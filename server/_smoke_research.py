import urllib.request, json, sys
B = 'http://127.0.0.1:9099'

def post(p, b):
    return json.loads(urllib.request.urlopen(urllib.request.Request(
        B + p, data=json.dumps(b).encode('utf-8'), method='POST',
        headers={'Content-Type': 'application/json'})).read())

def raw(p, t):
    r = urllib.request.urlopen(urllib.request.Request(B + p, headers={'Authorization': 'Bearer ' + t}))
    return r.status, r.headers.get('Content-Disposition', ''), r.read().decode('utf-8')

def code(p, t):
    try:
        urllib.request.urlopen(urllib.request.Request(B + p, headers={'Authorization': 'Bearer ' + t}))
        return 200
    except urllib.error.HTTPError as e:
        return e.code

# 造点数据
for name, evs in [('赵小刚', ['run', 'run', 'error', 'fix']), ('钱小美', ['run', 'design_create', 'role_switch'])]:
    tok = post('/api/auth/student/login', {'username': name, 'password': '123456'})['token']
    for e in evs:
        urllib.request.urlopen(urllib.request.Request(B + '/api/ct/events', data=json.dumps({'type': e}).encode(),
            method='POST', headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok}))

stu = post('/api/auth/student/login', {'username': '赵小刚', 'password': '123456'})['token']
tea = post('/api/auth/teacher/login', {'username': 'demo-teacher', 'password': '123456'})['token']

out = sys.stdout.buffer
# 学生应 403
print('学生导出应403 ->', code('/api/research/export', stu))

# 教师 JSON
st, cd, body = raw('/api/research/export?format=json', tea)
d = json.loads(body)
out.write(('JSON status=%d disp=%s\n' % (st, cd)).encode())
out.write(('schema=%s n=%d dims=%d\n' % (d['schema'], d['n_students'], len(d['dims']))).encode())
s0 = d['students'][0]
out.write(('样本: pid=%s ct维度=%d behavior键=%s events=%d projects=%d\n' % (
    s0['pid'], len(s0['ct_scores']), ','.join(s0['behavior'].keys()), len(s0['events']), len(s0['projects']))).encode())
# 去标识化断言
assert s0['pid'].startswith('S') and len(s0['pid']) == 9, 'pid 假名格式'
assert 'stu-' not in body, '不得含 stu- 原始ID'
assert '赵小刚' not in body and '钱小美' not in body, '不得含姓名'
assert 'detail' not in body, '不得含自由文本detail'
assert all('t' in e and e['t'] >= 0 for e in s0['events']), '事件时间应为相对秒'
assert d['anonymized'] is True

# 教师 CSV
st2, cd2, csv_body = raw('/api/research/export?format=csv', tea)
lines = csv_body.strip().split('\n')
out.write(('CSV status=%d 行数=%d 表头=%s\n' % (st2, len(lines), lines[0][:60])).encode())
assert lines[0].startswith('pid,decompose')
assert 'stu-' not in csv_body and '赵小刚' not in csv_body

print('\nRESEARCH EXPORT OK (脱敏: 假名/无姓名/无标题/无detail/相对时间)')
