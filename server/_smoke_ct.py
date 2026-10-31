import urllib.request, json, sys
B = 'http://127.0.0.1:9099'

def post(p, b, t=None):
    h = {'Content-Type': 'application/json'}
    if t: h['Authorization'] = 'Bearer ' + t
    return json.loads(urllib.request.urlopen(urllib.request.Request(B + p, data=json.dumps(b).encode(), method='POST', headers=h)).read())

def get(p, t):
    return json.loads(urllib.request.urlopen(urllib.request.Request(B + p, headers={'Authorization': 'Bearer ' + t})).read())

tok = post('/api/auth/student/login', {'username': 'ct-stu', 'password': '123456'})['token']

seq = [
    ('design_create', '画流程图'), ('run', '运行成功'), ('error', 'NameError'),
    ('ai_help', '向AI求助'), ('fix', '修复成功'), ('role_switch', '切观察员'),
    ('run', '再次成功'), ('save', '保存'),
]
for t, d in seq:
    post('/api/ct/events', {'type': t, 'detail': d}, tok)

s = get('/api/ct/summary', tok)
sys.stdout.buffer.write(
    ('runs=%s errors=%s fixes=%s ai_helps=%s switches=%s designs=%s rate=%s%%\n'
     % (s['runs'], s['errors'], s['fixes'], s['ai_helps'], s['role_switches'], s['designs'], s['success_rate'])).encode()
)
print('ct_scores:', s['ct_scores'])
print('path types:', [p['type'] for p in s['path']])
print('has_real_data:', s['has_real_data'])
assert s['runs'] == 2 and s['errors'] == 1 and s['fixes'] == 1 and s['designs'] == 1
assert all(0 <= v <= 100 for v in s['ct_scores'].values())
assert len(s['ct_scores']) == 6
print('CT SUMMARY OK')
