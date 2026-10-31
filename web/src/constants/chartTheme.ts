/**
 * 图表专用色（ECharts 配置吃不到 CSS 变量，只能给字面量）。
 * 与 styles/tokens.css 的 --chart-1/2/3/4、--chart-grid、--chart-axis **同源** ——
 * 改任意一边必须同步另一边，否则 SVG/Canvas 图和 DOM 元素会出现两套色。
 */
export const CHART_COLORS = ['#3370FF', '#16A374', '#FF8A00', '#7C6BF0']
export const CHART_GRID = '#E5E9F2'
export const CHART_AXIS = '#4E5969'
