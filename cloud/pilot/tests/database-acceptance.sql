-- Target only: slyzlplnuozzccdznuqp (isolated jiedui pilot project).
-- Real PostgreSQL contract test with synthetic claims, NOT real Auth login,
-- NOT HTTP/PostgREST integration, NOT multi-connection concurrency testing.
-- Fixtures have no password and no usable email; all row changes roll back.
-- Identity nextval may consume project IDs despite rollback; do not reset it.
begin;
set local statement_timeout = '20s';
set local lock_timeout = '5s';
do $test$
declare
  original_role text := current_setting('role');
  actor_a uuid := gen_random_uuid(); actor_b uuid := gen_random_uuid();
  session_a uuid := gen_random_uuid(); session_b uuid := gen_random_uuid();
  claims_a jsonb; claims_b jsonb;
  created jsonb; saved jsonb; actual jsonb; pid integer;
  item jsonb; state text; passed integer := 0;
begin
  if exists(select 1 from pilot_private.members) or exists(select 1 from pilot_private.projects) then
    raise exception 'N1 test requires empty isolated pilot tables';
  end if;
  insert into auth.users(id,aud,role,email,is_anonymous,created_at,updated_at)
  values(actor_a,'authenticated','authenticated',actor_a::text||'@n1-test.invalid',false,now(),now()),
        (actor_b,'authenticated','authenticated',actor_b::text||'@n1-test.invalid',false,now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
  values(session_a,actor_a,now(),now(),now()+interval '1 hour'),
        (session_b,actor_b,now(),now(),now()+interval '1 hour');
  insert into pilot_private.members(user_id,name,role) values(actor_a,'Synthetic A','student');
  claims_a := jsonb_build_object('sub',actor_a,'session_id',session_a,'role','authenticated',
    'exp',floor(extract(epoch from now()+interval '1 hour')),
    'user_metadata',jsonb_build_object('role','teacher'));
  claims_b := jsonb_build_object('sub',actor_b,'session_id',session_b,'role','authenticated',
    'exp',floor(extract(epoch from now()+interval '1 hour')));
  perform set_config('request.jwt.claims',claims_a::text,true);
  perform set_config('role','authenticated',true);

  actual := public.pilot_me();
  if actual->>'id' is distinct from actor_a::text or actual->>'role' is distinct from 'student' then
    raise exception 'case 01 failed: trusted identity and role'; end if;
  passed := passed+1;
  if public.pilot_projects('list','{}') is distinct from '[]'::jsonb then
    raise exception 'case 02 failed: empty list'; end if;
  passed := passed+1;
  created := public.pilot_projects('create','{"title":"N1 synthetic work","language":"python","requestId":"00000000-0000-4000-8000-000000000001"}');
  pid := (created->>'id')::integer;
  if pid is null or (created->>'latest_version')::integer is distinct from 0 or created ? 'owner_id' then
    raise exception 'case 03 failed: create contract'; end if;
  passed := passed+1;
  if public.pilot_projects('create','{"title":"N1 synthetic work","language":"python","requestId":"00000000-0000-4000-8000-000000000001"}') is distinct from created then
    raise exception 'case 04 failed: create idempotency'; end if;
  passed := passed+1;
  state := null;
  begin
    perform public.pilot_projects('create','{"title":"Different title","language":"python","requestId":"00000000-0000-4000-8000-000000000001"}');
  exception when others then get stacked diagnostics state = returned_sqlstate; end;
  if state is distinct from 'PT409' then raise exception 'case 05 failed: got %',state; end if;
  passed := passed+1;
  saved := public.pilot_projects('save',jsonb_build_object('id',pid,'code','print(1)','blockState',null,'expectedVersion',0,'requestId','00000000-0000-4000-8000-000000000002'));
  if saved is distinct from '{"versionNo":1,"changed":true}'::jsonb then raise exception 'case 06 failed: first save'; end if;
  passed := passed+1;
  if public.pilot_projects('save',jsonb_build_object('id',pid,'code','print(1)','blockState',null,'expectedVersion',0,'requestId','00000000-0000-4000-8000-000000000002')) is distinct from saved then
    raise exception 'case 07 failed: save idempotency'; end if;
  passed := passed+1;

  for item in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('case','08 same key changed body','expected','PT409','op','save','payload',jsonb_build_object('id',pid,'code','print(2)','expectedVersion',0,'requestId','00000000-0000-4000-8000-000000000002')),
    jsonb_build_object('case','09 stale version','expected','PT409','op','save','payload',jsonb_build_object('id',pid,'code','print(3)','expectedVersion',0,'requestId','00000000-0000-4000-8000-000000000003'))
  )) loop
    state := null;
    begin perform public.pilot_projects(item->>'op',item->'payload');
    exception when others then get stacked diagnostics state = returned_sqlstate; end;
    if state is distinct from item->>'expected' then raise exception 'case % failed: got %',item->>'case',state; end if;
    passed := passed+1;
  end loop;
  actual := public.pilot_projects('save',jsonb_build_object('id',pid,'code','print(1)','blockState',null,'expectedVersion',1,'requestId','00000000-0000-4000-8000-000000000004'));
  if actual is distinct from '{"versionNo":1,"changed":false}'::jsonb then raise exception 'case 10 failed: content dedup'; end if;
  passed := passed+1;
  actual := public.pilot_projects('save',jsonb_build_object('id',pid,'code','print(2)','blockState',null,'expectedVersion',1,'requestId','00000000-0000-4000-8000-000000000005'));
  if actual is distinct from '{"versionNo":2,"changed":true}'::jsonb then raise exception 'case 11 failed: second save'; end if;
  passed := passed+1;
  actual := public.pilot_projects('get',jsonb_build_object('id',pid));
  if actual#>>'{latest,code}' is distinct from 'print(2)' or actual#>>'{latest,version_no}' is distinct from '2' then
    raise exception 'case 12 failed: latest restore'; end if;
  passed := passed+1;
  actual := public.pilot_projects('versions',jsonb_build_object('id',pid));
  if jsonb_array_length(actual) is distinct from 2 or actual#>>'{1,code}' is distinct from 'print(1)' then
    raise exception 'case 13 failed: immutable history'; end if;
  passed := passed+1;

  for item in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('case','14 unknown field','expected','PT400','op','list','payload',jsonb_build_object('owner_id',actor_b)),
    jsonb_build_object('case','15 combined size limit','expected','PT413','op','save','payload',jsonb_build_object('id',pid,'code',repeat('a',40000),'blockState',repeat('b',30000),'expectedVersion',2,'requestId','00000000-0000-4000-8000-000000000006'))
  )) loop
    state := null;
    begin perform public.pilot_projects(item->>'op',item->'payload');
    exception when others then get stacked diagnostics state = returned_sqlstate; end;
    if state is distinct from item->>'expected' then raise exception 'case % failed: got %',item->>'case',state; end if;
    passed := passed+1;
  end loop;
  state := null;
  begin perform 1 from pilot_private.projects;
  exception when others then get stacked diagnostics state = returned_sqlstate; end;
  if state is distinct from '42501' then raise exception 'case 16 failed: direct table read got %',state; end if;
  passed := passed+1;
  state := null;
  begin update pilot_private.members set role='teacher' where user_id=actor_a;
  exception when others then get stacked diagnostics state = returned_sqlstate; end;
  if state is distinct from '42501' then raise exception 'case 17 failed: direct role write got %',state; end if;
  passed := passed+1;

  perform set_config('request.jwt.claims',claims_b::text,true);
  state := null;
  begin perform public.pilot_me();
  exception when others then get stacked diagnostics state = returned_sqlstate; end;
  if state is distinct from 'PT403' then raise exception 'case 18 failed: uninvited got %',state; end if;
  passed := passed+1;
  perform set_config('role',original_role,true);
  insert into pilot_private.members(user_id,name,role) values(actor_b,'Synthetic B','teacher');
  perform set_config('role','authenticated',true);
  if public.pilot_projects('list','{}') is distinct from '[]'::jsonb then raise exception 'case 19 failed: isolated list'; end if;
  passed := passed+1;
  for item in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('case','20 cross owner read','expected','PT404','op','get','payload',jsonb_build_object('id',pid)),
    jsonb_build_object('case','21 cross owner save','expected','PT404','op','save','payload',jsonb_build_object('id',pid,'code','tamper','expectedVersion',2,'requestId','00000000-0000-4000-8000-000000000007'))
  )) loop
    state := null;
    begin perform public.pilot_projects(item->>'op',item->'payload');
    exception when others then get stacked diagnostics state = returned_sqlstate; end;
    if state is distinct from item->>'expected' then raise exception 'case % failed: got %',item->>'case',state; end if;
    passed := passed+1;
  end loop;
  perform set_config('role',original_role,true);
  update pilot_private.members set active=false where user_id=actor_b;
  perform set_config('role','authenticated',true);
  state := null;
  begin perform public.pilot_me();
  exception when others then get stacked diagnostics state = returned_sqlstate; end;
  if state is distinct from 'PT403' then raise exception 'case 22 failed: deactivated got %',state; end if;
  passed := passed+1;

  perform set_config('role',original_role,true);
  delete from auth.sessions where id=session_a;
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims',claims_a::text,true);
  state := null;
  begin perform public.pilot_me();
  exception when others then get stacked diagnostics state = returned_sqlstate; end;
  if state is distinct from 'PT401' then raise exception 'case 23 failed: revoked session got %',state; end if;
  passed := passed+1;
  perform set_config('role','anon',true);
  state := null;
  begin perform public.pilot_projects('list','{}');
  exception when others then get stacked diagnostics state = returned_sqlstate; end;
  if state is distinct from '42501' then raise exception 'case 24 failed: anon public RPC got %',state; end if;
  passed := passed+1;
  state := null;
  begin perform pilot_private.require_member();
  exception when others then get stacked diagnostics state = returned_sqlstate; end;
  if state is distinct from '42501' then raise exception 'case 25 failed: anon private function got %',state; end if;
  passed := passed+1;

  perform set_config('role',original_role,true);
  update pilot_private.members set active=true where user_id=actor_b;
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims',(claims_b || jsonb_build_object('exp',1))::text,true);
  state := null;
  begin perform public.pilot_me();
  exception when others then get stacked diagnostics state = returned_sqlstate; end;
  if state is distinct from 'PT401' then raise exception 'case 26 failed: expired JWT got %',state; end if;
  passed := passed+1;
  perform set_config('request.jwt.claims',(claims_b || jsonb_build_object('sub',actor_a))::text,true);
  state := null;
  begin perform public.pilot_me();
  exception when others then get stacked diagnostics state = returned_sqlstate; end;
  if state is distinct from 'PT401' then raise exception 'case 27 failed: session owner mismatch got %',state; end if;
  passed := passed+1;
  perform set_config('role',original_role,true);
  update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=session_b;
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims',claims_b::text,true);
  state := null;
  begin perform public.pilot_me();
  exception when others then get stacked diagnostics state = returned_sqlstate; end;
  if state is distinct from 'PT401' then raise exception 'case 28 failed: not_after got %',state; end if;
  passed := passed+1;

  perform set_config('role',original_role,true);
  if (select count(*) from pilot_private.projects) <> 1 or
     (select count(*) from pilot_private.versions) <> 2 or
     (select count(*) from pilot_private.requests) <> 4 or
     (select latest_version from pilot_private.projects where id=pid) <> 2 then
    raise exception 'case 29 failed: rejects/dedup did not preserve row counts'; end if;
  passed := passed+1;
  if passed <> 29 then raise exception 'case accounting failed: %',passed; end if;
end
$test$;
rollback;
-- This statement executes only if every assertion above succeeded. If any
-- assertion fails, the query call errors; verify rollback with a fresh query.
select jsonb_build_object(
  'status','PASS','assertions_completed',29,'scope','database-role contract only',
  'members_after',(select count(*) from pilot_private.members),
  'projects_after',(select count(*) from pilot_private.projects),
  'versions_after',(select count(*) from pilot_private.versions),
  'requests_after',(select count(*) from pilot_private.requests),
  'synthetic_auth_users_after',(select count(*) from auth.users where email like '%@n1-test.invalid')
) as n1_database_acceptance;
