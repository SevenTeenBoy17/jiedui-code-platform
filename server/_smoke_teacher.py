import urllib.request, json, sys
B = 'http://127.0.0.1:9099'

def post(p, b, t=None):
    h = {'Content-Type': 'application/json'}
    if t: h['Authorization'] = 'Bearer ' + t
    try:
        return json.loads(urllib.request.urlopen(urllib.request.Request(B + p, data=json.dumps(b).encode('utf-8'), method='POST', headers=h)).read())
    except urllib.error.HTTPError as e:
        return {'_status': e.code}

def get(p, t):
    return json.loads(urllib.request.urlopen(urllib.request.Request(B + p, headers={'Authorization': 'Bearer ' + t})).read())

# 造 3 个学生的数据
for name, evs in [
    ('王小明', ['run', 'run', 'error', 'fix', 'design_create']),
    ('李小红', ['run', 'error', 'error', 'ai_help']),
    ('张小华', ['run', 'run', 'run', 'fix', 'design_create', 'role_switch']),
]:
    tok = post('/api/auth/student/login', {'username': name, 'password': '123456'})['token']
    for e in evs:
        post('/api/ct/events', {'type': e}, tok)

# 一个学生触发高危告警（需先同意才走 AI；但 risk 也可由 guard 直接，这里用 AI 链路）
tok = post('/api/auth/student/login', {'username': '李小红', 'password': '123456'})['token']
post('/api/consent', {'guardian': '家长'}, tok)
post('/api/ai/chat', {'message': '我不想活了', 'role': 'turtle'}, tok)  # → risk_event

# 教师拉首页
tea = post('/api/auth/teacher/login', {'username': 'demo-teacher', 'password': '123456'})['token']
h = get('/api/teacher/home', tea)
out = sys.stdout.buffer
out.write(('KPI: %s\n' % json.dumps(h['kpis'], ensure_ascii=False)).encode())
out.write(('班级六维均值: %s\n' % json.dumps(h['class_ct'], ensure_ascii=False)).encode())
out.write(('漏斗: %s\n' % json.dumps(h['funnel'], ensure_ascii=False)).encode())
out.write(('学生数: %d，示例: %s\n' % (len(h['students']), json.dumps([{'name': s['name'], 'runs': s['runs'], 'risk': s['risk']} for s in h['students'][:4]], ensure_ascii=False))).encode())
out.write(('告警数: %d，含自伤: %s\n' % (len(h['alerts']), any(a['category'] == 'self_harm' for a in h['alerts']))).encode())
assert h['kpis']['students'] >= 3
assert len(h['class_ct']) == 6
assert any(a['category'] == 'self_harm' for a in h['alerts'])
print('\nTEACHER HOME OK')
