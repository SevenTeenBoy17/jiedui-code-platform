<!-- 页头组件（R6 裁决5）：结构类全部走 global.css 的 .page-head__*，本组件零 scoped 样式。
     title 缺省吃当前路由 meta.title；back 传路径即出返回链接（打印走全局 .no-print 隐藏）；右侧动作放默认 slot。
     豁免：TodayView / ReportView 的正文区头部是文档式排版，不用此组件。 -->
<template>
  <div class="page-head">
    <div>
      <RouterLink v-if="back" :to="back" class="page-head__back no-print">
        <BaseIcon name="arrow-left" :size="13" />{{ backLabel || '返回' }}
      </RouterLink>
      <h1 class="page-head__title">{{ title || String(route.meta.title ?? '') }}</h1>
      <p v-if="desc" class="page-head__desc">{{ desc }}</p>
    </div>
    <div><slot /></div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import BaseIcon from '@/components/ui/BaseIcon.vue'

defineProps<{ title?: string; desc?: string; back?: string; backLabel?: string }>()
const route = useRoute()
</script>
