<!-- 通用线性图标（R3 裁决7）：全站功能位 emoji 的替代品。
     24 viewBox · stroke currentColor 1.5px round —— 颜色随文字色继承，
     深色工具栏/彩底按钮无需另行适配。纯装饰（aria-hidden），
     可及性名称由宿主控件的文字或 aria-label 提供，图标自己不发声。
     R4 裁决记两条「不做」：① 教学⇄教研 zone 切换不加图标（两字文字块本身即标识）；
     ② 行内「学情 →」类尾缀保留文字箭头，不换 arrow 图标（正文语气，非控件）。 -->
<template>
  <svg
    :width="size" :height="size" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="1.5"
    stroke-linecap="round" stroke-linejoin="round"
    class="ico" aria-hidden="true" focusable="false"
  >
    <!-- play 是唯一实心图标：16px 下描边三角太瘦，按裁决定稿改 fill 实心 -->
    <path :d="PATHS[name]" :fill="name === 'play' ? 'currentColor' : 'none'" />
  </svg>
</template>

<script lang="ts">
/** 图标路径表（首批）。新增图标只加条目，调用方经 IconName 自动获得类型收窄。 */
const PATHS = {
  plus: 'M12 5v14M5 12h14',
  play: 'M8 5.5l11 6.5-11 6.5z',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  square: 'M5 5h14v14H5z',
  'check-square': 'M5 5h14v14H5zM8.5 12.3l2.6 2.6 4.6-5.2',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  'eye-off': 'M3 3l18 18M10.5 5.2A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.8 17.8 0 0 1-3 4M6.4 6.4A17.3 17.3 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.6-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  school: 'M3 21h18M5 21V10l7-5 7 5v11M10 21v-5h4v5',
  swap: 'M4 7h13M14 4l3 3-3 3M20 17H7M10 14l-3 3 3 3',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  image: 'M3 5h18v14H3zM21 15l-4.5-4.5L6 21M8.5 9a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5z',
  clipboard: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6v4H9z',
  panel: 'M3 5h18v14H3zM15 5v14',
  keyboard: 'M2 6h20v12H2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6',
  blocks: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  /* —— R4 增补（侧栏导航 + 教研报表位）—— */
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  monitor: 'M3 5h18v12H3zM9 21h6M12 17v4',
  'chart-bar': 'M4 20h16M7 20v-6M12 20V6M17 20v-9',
  trend: 'M3 17l5.5-5.5 3.5 3.5L21 7M15.5 7H21v5.5',
  flask: 'M9.5 3h5M10 3v5.5L4.7 18a2 2 0 0 0 1.8 3h11a2 2 0 0 0 1.8-3L14 8.5V3M7.5 14.5h9',
  book: 'M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5zM4 19.5A2.5 2.5 0 0 1 6.5 17H20',
  ruler: 'M3 16.5L16.5 3 21 7.5 7.5 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  'file-text': 'M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM14 2v6h6M9 13h6M9 17h4',
  'alert-triangle': 'M12 3.5L2.5 20h19zM12 10v4M12 16.8h.01',
  pin: 'M9 3h6M10 3v6l-3.5 4h11L14 9V3M12 13v8',
  printer: 'M7 8V3h10v5M7 17H4a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 4 8h16a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 20 17h-3M7 13h10v8H7z',
  'arrow-left': 'M20 12H4M10 6l-6 6 6 6',
  'arrow-right': 'M4 12h16M14 6l6 6-6 6',
  /* —— R6 增补（ThinkingView 功能位 emoji 清零）—— */
  wrench: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  'help-circle': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.1 9a2.9 2.9 0 0 1 5.63.97c0 1.93-2.9 2.4-2.9 4.03M12 17.3h.01',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-1.8 5.2-5.2 1.8 1.8-5.2z',
} as const

export type IconName = keyof typeof PATHS
</script>

<script setup lang="ts">
withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 16 })
</script>

<style scoped>
/* 行内文字旁的基线对齐：不加这条，svg 按 baseline 排会在按钮里下坠 2-3px */
.ico { flex: none; vertical-align: -2px; }
</style>
