import urllib.request, json, sys
B = 'http://127.0.0.1:9099'

def post(path, body, tok=None):
    h = {'Content-Type': 'application/json'}
    if tok: h['Authorization'] = 'Bearer ' + tok
    req = urllib.request.Request(B + path, data=json.dumps(body).encode(), method='POST', headers=h)
    return json.loads(urllib.request.urlopen(req).read())

tok = post('/api/auth/student/login', {'username': 'x', 'password': '123456'})['token']

cases = {
    'python': 'name = "结对编程"\nfor i in range(3):\n    print(i, name)\nprint("sum", sum(range(101)))',
    'cpp': '#include <iostream>\nusing namespace std;\nint main(){ int s=0; for(int i=1;i<=100;i++) s+=i; cout << "cpp sum=" << s << endl; return 0; }',
    'c': '#include <stdio.h>\nint main(){ int s=0; for(int i=1;i<=100;i++) s+=i; printf("c sum=%d\\n", s); return 0; }',
}
for lang, code in cases.items():
    r = post('/api/run', {'language': lang, 'code': code}, tok)
    sys.stdout.buffer.write(
        f"[{lang}] status={r['status']} ms={r['durationMs']} mock={r['mock']} stdout={r['stdout'].strip()!r}\n".encode('utf-8')
    )
