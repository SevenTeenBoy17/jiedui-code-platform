/**
 * turtle 命令 → 线段（纯函数，可无头单测）+ Canvas 绘制（§4.1 绘图区）。
 * 海龟坐标系：起点(0,0)，朝向 0=东，left 逆时针(+)、right 顺时针(-)，y 轴朝上（绘制时翻转）。
 */
export interface TurtleCmd {
  op: string
  // forward/backward: d ; right/left/seth: a ; circle: r,extent ; goto: x,y ; color: c ; width: w
  [k: string]: any
}
export interface Seg {
  x1: number; y1: number; x2: number; y2: number; color: string; width: number
}
export interface TurtleScene {
  segments: Seg[]
  end: { x: number; y: number; heading: number }
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

const D2R = Math.PI / 180

export function turtleToSegments(cmds: TurtleCmd[]): TurtleScene {
  let x = 0, y = 0, h = 0 // h in degrees
  let pen = true, color = '#1F2A44', width = 2
  const segments: Seg[] = []
  let minX = 0, minY = 0, maxX = 0, maxY = 0
  const grow = (px: number, py: number) => {
    minX = Math.min(minX, px); minY = Math.min(minY, py)
    maxX = Math.max(maxX, px); maxY = Math.max(maxY, py)
  }
  const moveTo = (nx: number, ny: number) => {
    if (pen) segments.push({ x1: x, y1: y, x2: nx, y2: ny, color, width })
    x = nx; y = ny; grow(x, y)
  }
  const forward = (d: number) => moveTo(x + d * Math.cos(h * D2R), y + d * Math.sin(h * D2R))

  for (const c of cmds) {
    switch (c.op) {
      case 'forward': forward(Number(c.d) || 0); break
      case 'backward': forward(-(Number(c.d) || 0)); break
      case 'right': h -= Number(c.a) || 0; break
      case 'left': h += Number(c.a) || 0; break
      case 'seth': h = Number(c.a) || 0; break
      case 'penup': pen = false; break
      case 'pendown': pen = true; break
      case 'pencolor': case 'color': color = String(c.c || color); break
      case 'pensize': case 'width': width = Number(c.w) || width; break
      case 'home': moveTo(0, 0); h = 0; break
      case 'goto': moveTo(Number(c.x) || 0, Number(c.y) || 0); break
      case 'dot': grow(x, y); break
      case 'circle': {
        const r = Number(c.r) || 0
        const extent = c.extent == null ? 360 : Number(c.extent)
        const steps = Math.max(8, Math.ceil(Math.abs(extent) / 10))
        const stepAng = extent / steps // 正=left
        const arcLen = (2 * Math.PI * Math.abs(r) * (Math.abs(extent) / 360)) / steps
        const dir = r >= 0 ? 1 : -1
        for (let i = 0; i < steps; i++) {
          forward(arcLen)
          h += dir * stepAng
        }
        break
      }
      default: break
    }
  }
  return { segments, end: { x, y, heading: h }, bounds: { minX, minY, maxX, maxY } }
}

/**
 * 把场景绘制到 canvas，自动居中缩放适配。
 *
 * `dpr`：调用方把 backing store 放大了多少倍（高清屏）。这里只用它修正**线宽与端点半径** ——
 * 不乘的话，2 倍屏上 2px 的笔画只有 1 CSS 像素粗，看起来像虚线。
 * 坐标本身不需要它：W/H 已经是设备像素，tx/ty 直接在设备像素空间里算。
 */
export function drawTurtle(canvas: HTMLCanvasElement, cmds: TurtleCmd[], dpr = 1) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  const scene = turtleToSegments(cmds)
  const { minX, minY, maxX, maxY } = scene.bounds
  const pad = 24 * dpr
  const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY)
  const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY, 4)
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  // 世界坐标 → 画布（居中 + y 翻转）
  const tx = (wx: number) => W / 2 + (wx - cx) * scale
  const ty = (wy: number) => H / 2 - (wy - cy) * scale

  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const s of scene.segments) {
    ctx.strokeStyle = s.color
    ctx.lineWidth = Math.max(1, s.width * Math.min(scale, 1.5)) * dpr
    ctx.beginPath(); ctx.moveTo(tx(s.x1), ty(s.y1)); ctx.lineTo(tx(s.x2), ty(s.y2)); ctx.stroke()
  }
  // 海龟标记（终点）
  ctx.fillStyle = '#2EC4B6'
  ctx.beginPath(); ctx.arc(tx(scene.end.x), ty(scene.end.y), 5 * dpr, 0, Math.PI * 2); ctx.fill()
}
