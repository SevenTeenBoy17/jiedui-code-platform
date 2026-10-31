<template>
  <header class="growth-head">
    <div class="growth-head__context">
      <strong>{{ title }}<span v-if="taskCode">{{ taskCode }}</span></strong>
      <p>前端演示 · {{ isReview ? '复核结论须由教师确认' : '同一份成长证据，切换查看方式' }}</p>
    </div>
    <div class="growth-head__controls">
      <nav class="growth-head__modes" aria-label="成长信息显示方式">
        <RouterLink :to="linkTo('/student/thinking')" :class="{ active: isSimple }" :aria-current="isSimple ? 'page' : undefined">
          <img src="/generated/student-growth/thinking-growth.png" alt="" /><span>简约版</span>
        </RouterLink>
        <RouterLink :to="linkTo('/student/thinking/profile')" :class="{ active: isDetail }" :aria-current="isDetail ? 'page' : undefined">
          <img src="/generated/student-growth/profile-detail.png" alt="" /><span>详情版</span>
        </RouterLink>
      </nav>
      <RouterLink class="growth-head__review" :class="{ active: isReview }" :to="linkTo('/student/thinking/review')" :aria-current="isReview ? 'page' : undefined">
        <img src="/generated/student-growth/teacher-feedback.png" alt="" /><span>教师反馈复核</span>
      </RouterLink>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useGrowthDisplay } from '@/composables/useGrowthDisplay'

defineProps<{ eyebrow: string; title: string; description: string; taskCode?: string }>()
const route = useRoute()
const { linkTo } = useGrowthDisplay()
const isSimple = computed(() => route.path === '/student/thinking')
const isDetail = computed(() => route.path === '/student/thinking/profile')
const isReview = computed(() => route.path === '/student/thinking/review')
</script>

<style scoped>
.growth-head { min-width:0; padding:2px 2px 8px; display:flex; align-items:center; justify-content:space-between; gap:16px; color:#35304d; }
.growth-head__context { min-width:0; }
.growth-head__context strong { display:flex; align-items:center; gap:10px; font-size:18px; }
.growth-head__context strong span { font-size:12px; color:#6259a3; font-weight:600; }
.growth-head__context p { margin:5px 0 0; font-size:12px; color:#67617a; }
.growth-head__controls { display:flex; align-items:center; gap:14px; flex:none; }
.growth-head__modes { display:flex; padding:4px; border:1px solid #dcd7e9; border-radius:16px; background:#efedf5; box-shadow:inset 0 2px 4px #d5cfe544; }
.growth-head a { min-height:42px; display:flex; align-items:center; justify-content:center; gap:7px; padding:0 15px; border-radius:12px; text-decoration:none; color:#5f5775; font-size:14px; font-weight:700; white-space:nowrap; transition:background .15s, box-shadow .15s; }
.growth-head img { width:27px; height:27px; object-fit:contain; }
.growth-head__modes a.active { color:#fcfbff; background:linear-gradient(#8881db,#675fc3); box-shadow:inset 0 1px 1px #bbb5ef,0 3px 5px #8177ad40; }
.growth-head__review { border:1px solid #dcd7e9; background:#fcfaf8; }
.growth-head__review.active { border-color:#8278c4; background:#eae5fa; color:#49407f; }
.growth-head a:hover { box-shadow:0 3px 10px #5e527522; }
.growth-head a:focus-visible { outline:3px solid #6c62bf; outline-offset:3px; }
@media(max-width:1080px) { .growth-head { flex-wrap:wrap; }.growth-head__controls { margin-left:auto; } }
@media(max-width:620px) { .growth-head { gap:12px; }.growth-head__controls { flex-wrap:wrap; margin-left:0; width:100%; gap:8px; }.growth-head__modes { flex:1; }.growth-head__modes a { flex:1; }.growth-head a { padding-inline:10px; min-height:44px; }.growth-head__context p { line-height:1.5; } }
.growth-head__title { min-width: 0; }
.growth-head__eyebrow { display: block; margin-bottom: 4px; color: #777db0; font-size: 10px; font-weight: 800; letter-spacing: .08em; }
.growth-head__line { display: flex; align-items: center; gap: 9px; }
.growth-head h2 { margin: 0; color: #20263d; font-size: clamp(22px, 2.1vw, 30px); line-height: 1.05; }
.growth-head__code { padding: 3px 8px; border-radius: 8px; color: #5f55c8; background: #f0edff; font-size: 11px; font-weight: 800; }
.growth-head p { margin: 6px 0 0; color: #747b91; font-size: 12px; }
.growth-head__nav { flex: none; padding: 4px; border-radius: 14px; display: flex; align-items: center; gap: 3px; background: #f1f1f7; }
.growth-head__nav a { min-height: 36px; padding: 0 13px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; color: #5f657a; font-size: 12px; font-weight: 700; text-decoration: none; white-space: nowrap; }
.growth-head__nav a.active { color: #fff; background: linear-gradient(135deg, #7771df, #5b5ccf); box-shadow: 0 6px 14px rgba(84,79,190,.22); }
.growth-head__nav a:focus-visible { outline: 3px solid rgba(102,96,205,.25); outline-offset: 2px; }
@media (max-width: 760px) {
  .growth-head { padding: 15px; align-items: flex-start; flex-direction: column; gap: 13px; }
  .growth-head__nav { width: 100%; overflow-x: auto; }
  .growth-head__nav a { flex: 1; padding-inline: 10px; }
}
@media (max-width: 460px) {
  .growth-head { border-radius: 16px; }
  .growth-head__nav a { min-width: max-content; font-size: 11px; }
}
</style>
