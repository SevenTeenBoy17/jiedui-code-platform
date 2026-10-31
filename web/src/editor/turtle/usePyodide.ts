/**
 * Pyodide 浏览器 Python 执行（§4.2 §5）。懒加载，注入 turtle shim 捕获绘图命令 + stdout。
 *
 * **本地托管优先**。此前固定从 jsdelivr 拉 ~6MB 运行时，而 public/sw.js 明确不缓存第三方
 * （`url.origin !== self.location.origin` 直接 return），于是：
 *   一个机房 40 台机器第一次进 IDE ≈ 240MB 打境外 CDN；
 *   拉不下来时 IdeView 会静默回退到后端执行 —— 代码还能跑，但**海龟绘图整个消失**，
 *   而海龟绘图恰恰是这个平台对初中生最有吸引力的部分。
 *
 * 部署前跑 `npm run fetch:pyodide` 把运行时放到 web/public/pyodide/，
 * sw.js 会把 /pyodide/ 按 CacheFirst 缓存，第二台机器起就是本地命中。
 * 本地目录不存在时才回落 CDN（开发机方便），并且这个回落是**显式记录**的，不是静默的。
 */
const PYODIDE_VER = 'v0.26.4'
const LOCAL = '/pyodide/'
const CDN = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VER}/full/`

/** 本地是否已放好运行时 —— 探一次 HEAD，避免整包拉到一半才发现没有 */
async function pickBase(): Promise<string> {
  try {
    const r = await fetch(LOCAL + 'pyodide.js', { method: 'HEAD' })
    if (r.ok) return LOCAL
  } catch { /* 没有本地副本 */ }
  console.warn('[pyodide] 未找到本地运行时，回落 CDN。机房部署请先跑 npm run fetch:pyodide')
  return CDN
}

// turtle 垫片：覆盖 turtle 模块，把绘图调用记入 _cmds；重定向 stdout 到 _buf。
const SHIM = `
import sys, io, json, types
_cmds = []
_buf = io.StringIO()

class _T:
    def __init__(self, *a, **k): pass
    def forward(self, d): _cmds.append({'op':'forward','d':d})
    fd = forward
    def backward(self, d): _cmds.append({'op':'backward','d':d})
    back = bk = backward
    def right(self, a): _cmds.append({'op':'right','a':a})
    rt = right
    def left(self, a): _cmds.append({'op':'left','a':a})
    lt = left
    def setheading(self, a): _cmds.append({'op':'seth','a':a})
    seth = setheading
    def penup(self): _cmds.append({'op':'penup'})
    pu = up = penup
    def pendown(self): _cmds.append({'op':'pendown'})
    pd = down = pendown
    def circle(self, r, extent=None): _cmds.append({'op':'circle','r':r,'extent':extent})
    def goto(self, x, y=None): _cmds.append({'op':'goto','x':x,'y':(0 if y is None else y)})
    setpos = setposition = goto
    def pencolor(self, *c): _cmds.append({'op':'pencolor','c':(c[0] if c else 'black')})
    color = pencolor
    def pensize(self, w=None): _cmds.append({'op':'pensize','w':(w or 2)})
    width = pensize
    def home(self): _cmds.append({'op':'home'})
    def dot(self, *a): _cmds.append({'op':'dot'})
    def speed(self, *a): pass
    def hideturtle(self): pass
    def showturtle(self): pass
    def begin_fill(self): pass
    def end_fill(self): pass

_default = _T()
_mod = types.ModuleType('turtle')
_mod.Turtle = _T
_mod.Pen = _T
for _n in ['forward','fd','backward','back','bk','right','rt','left','lt','setheading','seth',
           'penup','pu','up','pendown','pd','down','circle','goto','setpos','setposition',
           'pencolor','color','pensize','width','home','dot','speed','hideturtle','showturtle',
           'begin_fill','end_fill']:
    setattr(_mod, _n, getattr(_default, _n))
_mod.done = _mod.mainloop = _mod.exitonclick = _mod.bye = (lambda *a, **k: None)
_mod.Screen = (lambda *a, **k: types.SimpleNamespace(bgcolor=lambda *x: None, setup=lambda *x, **y: None, exitonclick=lambda *x: None))
sys.modules['turtle'] = _mod

def _jiedui_reset():
    _cmds.clear()
    _buf.seek(0); _buf.truncate(0)
    sys.stdout = _buf

def _jiedui_out():
    return _buf.getvalue()

def _jiedui_cmds():
    return json.dumps(_cmds)
`

let pyPromise: Promise<any> | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Pyodide 脚本加载失败'))
    document.head.appendChild(s)
  })
}

export function pyodideReady(): boolean {
  return !!pyPromise
}

async function getPyodide(): Promise<any> {
  if (pyPromise) return pyPromise
  pyPromise = (async () => {
    const base = await pickBase()
    if (!(window as any).loadPyodide) await loadScript(base + 'pyodide.js')
    const py = await (window as any).loadPyodide({ indexURL: base })
    py.runPython(SHIM)
    return py
  })()
  return pyPromise
}

export interface PyRun {
  stdout: string
  turtle: any[]
  error: string
}

export async function runPythonTurtle(code: string): Promise<PyRun> {
  const py = await getPyodide()
  py.runPython('_jiedui_reset()')
  let error = ''
  try {
    py.runPython(code)
  } catch (e: any) {
    error = String(e?.message || e).split('\n').slice(-6).join('\n')
  }
  const stdout = py.runPython('_jiedui_out()') as string
  let turtle: any[] = []
  try {
    turtle = JSON.parse(py.runPython('_jiedui_cmds()') as string)
  } catch {}
  return { stdout, turtle, error }
}
