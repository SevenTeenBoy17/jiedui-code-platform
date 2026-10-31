import urllib.request, json, io, zipfile, sys
B = 'http://127.0.0.1:9099'

def req(method, path, body=None, tok=None, raw=False):
    h = {}
    data = None
    if body is not None and not raw:
        h['Content-Type'] = 'application/json'; data = json.dumps(body).encode()
    elif raw:
        data = body
    if tok: h['Authorization'] = 'Bearer ' + tok
    r = urllib.request.Request(B + path, data=data, method=method, headers=h)
    resp = urllib.request.urlopen(r)
    return resp

def jreq(method, path, body=None, tok=None):
    return json.loads(req(method, path, body, tok).read())

tok = jreq('POST', '/api/auth/student/login', {'username': 'xiaoma', 'password': '123456'})['token']

# 1) 创建
p = jreq('POST', '/api/projects', {'title': '我的海龟', 'language': 'python'}, tok)
pid = p['id']; print('create -> id', pid, 'ver', p['latest_version'])
# 2) 保存版本
v = jreq('POST', f'/api/projects/{pid}/versions', {'code': 'print("hello 作品")', 'blockState': '{"blocks":1}'}, tok)
print('save version ->', v)
# 3) 列表
lst = jreq('GET', '/api/projects', tok=tok)
print('list count', len(lst), '-> latest_version', lst[0]['latest_version'])
# 4) 获取
g = jreq('GET', f'/api/projects/{pid}', tok=tok)
print('get latest code:', repr(g['latest']['code']))
# 5) 下载 zip
z = req('GET', f'/api/projects/{pid}/download', tok=tok).read()
zf = zipfile.ZipFile(io.BytesIO(z))
print('download zip entries:', zf.namelist(), 'main.py=', repr(zf.read('main.py').decode()))
# 6) 上传导入（构造一个 zip）
buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w') as zz:
    zz.writestr('main.py', 'print("imported")')
    zz.writestr('metadata.json', json.dumps({'title': '导入的作品', 'language': 'python'}))
buf.seek(0)
boundary = '----jiedui'
body = b''
body += f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="w.zip"\r\nContent-Type: application/zip\r\n\r\n'.encode()
body += buf.read() + f'\r\n--{boundary}--\r\n'.encode()
r = urllib.request.Request(B + '/api/projects/upload', data=body, method='POST',
                           headers={'Authorization': 'Bearer ' + tok, 'Content-Type': f'multipart/form-data; boundary={boundary}'})
imp = json.loads(urllib.request.urlopen(r).read())
sys.stdout.buffer.write(('upload import -> id %s title %s code %r\n' % (imp['id'], imp['title'], imp['latest']['code'])).encode('utf-8'))
# 7) 删除
d = jreq('DELETE', f'/api/projects/{pid}', tok=tok)
print('delete ->', d)
print('OK storage smoke passed')
