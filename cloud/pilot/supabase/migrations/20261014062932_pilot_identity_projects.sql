-- N1 only. No real classroom data is imported. Apply to the isolated pilot project.
create schema pilot_private;
revoke all on schema pilot_private from public, anon, authenticated;
grant usage on schema pilot_private to authenticated;

create table pilot_private.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  role text not null check (role in ('student', 'teacher')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table pilot_private.projects (
  id integer generated always as identity primary key,
  owner_id uuid not null references pilot_private.members(user_id),
  title text not null check (char_length(title) between 1 and 80),
  language text not null check (language in ('python', 'cpp', 'c')),
  latest_version integer not null default 0 check (latest_version between 0 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_idx on pilot_private.projects(owner_id, updated_at desc);
create table pilot_private.versions (
  project_id integer not null references pilot_private.projects(id),
  version_no integer not null check (version_no between 1 and 50),
  code text not null check (octet_length(code) <= 65536),
  block_state text check (block_state is null or octet_length(block_state) <= 65536),
  created_at timestamptz not null default now(),
  primary key (project_id, version_no),
  check (octet_length(code) + coalesce(octet_length(block_state),0) <= 65536)
);
create table pilot_private.requests (
  actor_id uuid not null references pilot_private.members(user_id),
  request_id uuid not null,
  fingerprint bytea not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, request_id)
);
alter table pilot_private.members enable row level security;
alter table pilot_private.projects enable row level security;
alter table pilot_private.versions enable row level security;
alter table pilot_private.requests enable row level security;
revoke all on all tables in schema pilot_private from public, anon, authenticated;
revoke all on all sequences in schema pilot_private from public, anon, authenticated;

-- Narrow trusted boundary: no caller-supplied actor, role, SQL, or table name.
-- Read/write RPCs each call this before accessing any application row.
create function pilot_private.require_member() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  claims jsonb := auth.jwt();
  sid text := claims ->> 'session_id';
  member pilot_private.members;
begin
  if actor is null or sid is null or sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(claims ->> 'exp', '') !~ '^[0-9]{1,12}$' then
    raise sqlstate 'PT401' using message = 'invalid_session';
  end if;
  -- Hold the session row until the RPC commits: logout and in-flight writes
  -- are ordered, rather than acknowledging logout before a queued save commits.
  perform 1 from auth.sessions s where s.id = sid::uuid and s.user_id = actor
    and (s.not_after is null or s.not_after > clock_timestamp()) for share;
  if not found or (claims ->> 'exp')::bigint <= extract(epoch from clock_timestamp()) then
    raise sqlstate 'PT401' using message = 'expired_or_revoked_session';
  end if;
  select * into member from pilot_private.members m where m.user_id = actor for share;
  if not found or not member.active then
    raise sqlstate 'PT403' using message = 'not_invited';
  end if;
  return jsonb_build_object('id', actor, 'name', member.name, 'role', member.role);
end;
$$;

create function pilot_private.projects_api(operation text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  identity jsonb := pilot_private.require_member();
  actor uuid := (identity ->> 'id')::uuid;
  project pilot_private.projects;
  previous pilot_private.versions;
  prior_request pilot_private.requests;
  pid integer;
  rid uuid;
  fingerprint bytea;
  result jsonb;
  title text;
  lang text;
  code_value text;
  block_value text;
  base_version integer;
begin
  if operation not in ('list','create','get','versions','save') or operation is null or
     jsonb_typeof(payload) is distinct from 'object' then
    raise sqlstate 'PT400' using message = 'invalid_request';
  end if;
  if octet_length(payload::text) > 80000 then
    raise sqlstate 'PT413' using message = 'request_too_large';
  end if;
  if exists (select 1 from jsonb_object_keys(payload) as k(key) where not (key = any (
    case operation
      when 'list' then array[]::text[]
      when 'create' then array['title','language','requestId']
      when 'save' then array['id','code','blockState','expectedVersion','requestId']
      else array['id'] end))) then
    raise sqlstate 'PT400' using message = 'unknown_field';
  end if;
  if operation = 'list' then
    select coalesce(jsonb_agg(to_jsonb(p) - 'owner_id' order by p.updated_at desc, p.id desc), '[]'::jsonb)
    into result from pilot_private.projects p where p.owner_id = actor;
    return result;
  end if;
  if operation in ('create','save') then
    if jsonb_typeof(payload -> 'requestId') is distinct from 'string' or
       (payload ->> 'requestId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise sqlstate 'PT400' using message = 'invalid_request_id';
    end if;
    rid := (payload ->> 'requestId')::uuid;
    -- Cross-instance serialization for this actor: quotas and idempotency share this lock.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text, 0));
    fingerprint := pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object('operation',operation,'payload',payload)::text,'UTF8'));
    select * into prior_request from pilot_private.requests r where r.actor_id = actor and r.request_id = rid;
    if found then
      if prior_request.fingerprint <> fingerprint then
        raise sqlstate 'PT409' using message = 'idempotency_conflict';
      end if;
      return prior_request.result;
    end if;
    if (select count(*) from pilot_private.requests r where r.actor_id = actor) >= 10000 then
      raise sqlstate 'PT429' using message = 'pilot_request_limit';
    end if;
  end if;
  if operation = 'create' then
    if jsonb_typeof(payload -> 'title') is distinct from 'string' or
       jsonb_typeof(payload -> 'language') is distinct from 'string' then
      raise sqlstate 'PT400' using message = 'invalid_project';
    end if;
    title := trim(payload ->> 'title'); lang := payload ->> 'language';
    if char_length(title) not between 1 and 80 or lang not in ('python','cpp','c') then
      raise sqlstate 'PT400' using message = 'invalid_project';
    end if;
    if (select count(*) from pilot_private.projects p where p.owner_id = actor) >= 100 then
      raise sqlstate 'PT429' using message = 'pilot_project_limit';
    end if;
    insert into pilot_private.projects(owner_id,title,language) values(actor,title,lang) returning * into project;
    result := to_jsonb(project) - 'owner_id' || jsonb_build_object('latest',null);
  else
    if jsonb_typeof(payload -> 'id') is distinct from 'number' or
       (payload ->> 'id') !~ '^[1-9][0-9]{0,9}$' then
      raise sqlstate 'PT400' using message = 'invalid_project_id';
    end if;
    if (payload ->> 'id')::bigint > 2147483647 then
      raise sqlstate 'PT400' using message = 'invalid_project_id';
    end if;
    pid := (payload ->> 'id')::integer;
    select * into project from pilot_private.projects p where p.id = pid and p.owner_id = actor for update;
    if not found then raise sqlstate 'PT404' using message = 'not_found'; end if;
    if operation = 'versions' then
      select coalesce(jsonb_agg(to_jsonb(v) - 'project_id' order by v.version_no desc), '[]'::jsonb)
      into result from pilot_private.versions v where v.project_id = pid;
      return result;
    end if;
    select * into previous from pilot_private.versions v where v.project_id = pid and v.version_no = project.latest_version;
    if operation = 'get' then
      return to_jsonb(project) - 'owner_id' || jsonb_build_object('latest',
        case when previous.version_no is null then null else to_jsonb(previous) - 'project_id' end);
    end if;
    if jsonb_typeof(payload -> 'code') is distinct from 'string' or
       jsonb_typeof(payload -> 'expectedVersion') is distinct from 'number' or
       (payload ->> 'expectedVersion') !~ '^(0|[1-9][0-9]?)$' or
       (payload ? 'blockState' and jsonb_typeof(payload -> 'blockState') not in ('string','null')) then
      raise sqlstate 'PT400' using message = 'invalid_version';
    end if;
    code_value := payload ->> 'code'; block_value := payload ->> 'blockState';
    if octet_length(code_value) + coalesce(octet_length(block_value),0) > 65536 then
      raise sqlstate 'PT413' using message = 'version_too_large';
    end if;
    base_version := (payload ->> 'expectedVersion')::integer;
    if base_version <> project.latest_version then
      raise sqlstate 'PT409' using message = 'version_conflict';
    end if;
    if previous.version_no is not null and previous.code = code_value and previous.block_state is not distinct from block_value then
      result := jsonb_build_object('versionNo',project.latest_version,'changed',false);
    else
      if project.latest_version >= 50 then raise sqlstate 'PT429' using message = 'pilot_version_limit'; end if;
      insert into pilot_private.versions(project_id,version_no,code,block_state)
      values(pid,project.latest_version+1,code_value,block_value);
      update pilot_private.projects p set latest_version = p.latest_version+1, updated_at = now() where p.id = pid;
      result := jsonb_build_object('versionNo',project.latest_version+1,'changed',true);
    end if;
  end if;
  insert into pilot_private.requests(actor_id,request_id,fingerprint,result) values(actor,rid,fingerprint,result);
  return result;
end;
$$;

create function public.pilot_me() returns jsonb
language sql security invoker set search_path = ''
as $$ select pilot_private.require_member(); $$;
create function public.pilot_projects(operation text, payload jsonb) returns jsonb
language sql security invoker set search_path = ''
as $$ select pilot_private.projects_api(operation, payload); $$;

revoke all on function pilot_private.require_member() from public, anon, authenticated;
revoke all on function pilot_private.projects_api(text,jsonb) from public, anon, authenticated;
revoke all on function public.pilot_me() from public, anon, authenticated;
revoke all on function public.pilot_projects(text,jsonb) from public, anon, authenticated;
grant execute on function pilot_private.require_member() to authenticated;
grant execute on function pilot_private.projects_api(text,jsonb) to authenticated;
grant execute on function public.pilot_me() to authenticated;
grant execute on function public.pilot_projects(text,jsonb) to authenticated;
