// 按需注册的 echarts 精简入口（全站图表只有雷达+漏斗）。新图表类型须在此注册后使用。
import * as echarts from 'echarts/core'
import { RadarChart, FunnelChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
echarts.use([RadarChart, FunnelChart, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])
export default echarts
