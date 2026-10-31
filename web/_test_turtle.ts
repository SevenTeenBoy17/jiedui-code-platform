import { turtleToSegments, type TurtleCmd } from './src/editor/turtle/renderer.ts'

function approx(a: number, b: number, eps = 1e-6) { return Math.abs(a - b) < eps }
let fails = 0
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' :: ' + extra : ''}`)
  if (!cond) fails++
}

// 正方形：前进100 右转90 ×4 → 4 段，回到原点
const square: TurtleCmd[] = []
for (let i = 0; i < 4; i++) { square.push({ op: 'forward', d: 100 }, { op: 'right', a: 90 }) }
const s1 = turtleToSegments(square)
check('square segments=4', s1.segments.length === 4)
check('square closes at origin', approx(s1.end.x, 0, 1e-6) && approx(s1.end.y, 0, 1e-6), `end=(${s1.end.x.toFixed(2)},${s1.end.y.toFixed(2)})`)
check('square side length=100', approx(Math.hypot(s1.segments[0].x2 - s1.segments[0].x1, s1.segments[0].y2 - s1.segments[0].y1), 100))

// 三角形：前进100 左转120 ×3 → 3 段，回到原点
const tri: TurtleCmd[] = []
for (let i = 0; i < 3; i++) { tri.push({ op: 'forward', d: 100 }, { op: 'left', a: 120 }) }
const s2 = turtleToSegments(tri)
check('triangle segments=3', s2.segments.length === 3)
check('triangle closes', approx(s2.end.x, 0, 1e-6) && approx(s2.end.y, 0, 1e-6))

// penup 不画线
const pu: TurtleCmd[] = [{ op: 'penup' }, { op: 'forward', d: 50 }, { op: 'pendown' }, { op: 'forward', d: 50 }]
const s3 = turtleToSegments(pu)
check('penup skips segment', s3.segments.length === 1)

// circle 大致闭合（回到起点附近）
const s4 = turtleToSegments([{ op: 'circle', r: 50 }])
check('circle many segments', s4.segments.length >= 8)
check('circle roughly closes', Math.hypot(s4.end.x, s4.end.y) < 5, `end dist=${Math.hypot(s4.end.x, s4.end.y).toFixed(2)}`)

console.log(fails === 0 ? '\nALL TURTLE RENDERER TESTS PASSED' : `\n${fails} TEST(S) FAILED`)
process.exit(fails === 0 ? 0 : 1)
