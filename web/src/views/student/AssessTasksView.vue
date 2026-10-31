<!-- @copyBudget 245 对照批准画布01/02的聚合额度；一个页签常驻，原件与标准在独立抽屉。 -->
<template>
  <div class="assessment-center" data-testid="assessment-center">
    <div class="assessment-topline">
      <div class="assessment-tabs" role="tablist" aria-label="测评中心内容" @keydown="onTabKey">
        <button v-for="item in tabs" :id="'assess-tab-' + item.id" :key="item.id" type="button" role="tab"
          :aria-selected="tab === item.id" :tabindex="tab === item.id ? 0 : -1" :aria-controls="'assess-panel-' + item.id"
          :class="{ selected: tab === item.id }" @click="selectTab(item.id)">{{ item.label }}</button>
      </div>
      <div class="assessment-mode">
        <span :class="['assessment-source', { 'assessment-source--demo': isDemo }]">{{ isDemo ? '演示体验 · 非真实学生数据' : '课堂数据' }}</span>
        <button type="button" class="assessment-mode-button" @click="toggleDemo">{{ isDemo ? '回到课堂数据' : '看演示' }}</button>
      </div>
    </div>
    <section :id="'assess-panel-' + tab" class="assessment-panel" role="tabpanel" :aria-labelledby="'assess-tab-' + tab" tabindex="0">
      <AssessmentRecordsPanel v-if="tab === 'records'" :demo="isDemo" @open="openDrawer" @demo="toggleDemo" />
      <AssessmentResearchPanel v-else-if="tab === 'research' && isDemo" @open="openDrawer" />
      <AssessmentLiveList v-else-if="tab === 'research'" :key="String(auth.user?.id || 'anon')" />
      <AssessmentLearningPanel v-else :demo="isDemo" @open="openDrawer" @demo="toggleDemo" @records="selectTab('records')" />
    </section>
    <AssessmentDetailDrawer v-if="isDemo" :key="String(auth.user?.id || 'anon')" :open="drawerOpen" :kind="drawerKind" :section="drawerSection" @close="drawerOpen = false" />
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AssessmentRecordsPanel from '@/components/student/assessment/AssessmentRecordsPanel.vue'
import AssessmentResearchPanel from '@/components/student/assessment/AssessmentResearchPanel.vue'
import AssessmentLearningPanel from '@/components/student/assessment/AssessmentLearningPanel.vue'
import AssessmentLiveList from '@/components/student/assessment/AssessmentLiveList.vue'
import AssessmentDetailDrawer from '@/components/student/assessment/AssessmentDetailDrawer.vue'
import type { DrawerKind, DrawerSection } from '@/data/assessmentDemo'
import '@/components/student/assessment/assessment-center.css'
const route = useRoute(), router = useRouter(), auth = useAuthStore()
const tabs = [{ id: 'check', label: '学习检查' }, { id: 'records', label: '我的记录' }, { id: 'research', label: '研究测评' }] as const
type TabId = typeof tabs[number]['id']
const tab = computed<TabId>(() => tabs.some(t => t.id === route.query.tab) ? route.query.tab as TabId : 'check')
const isDemo = computed(() => route.query.demo === '1')
const drawerOpen = ref(false), drawerKind = ref<DrawerKind>('submission'), drawerSection = ref<DrawerSection>()
function selectTab(id: TabId) { drawerOpen.value = false; router.replace({ query: { ...route.query, tab: id } }) }
function toggleDemo() { drawerOpen.value = false; router.replace({ query: { ...route.query, demo: isDemo.value ? undefined : '1' } }) }
function openDrawer(kind: DrawerKind, section?: DrawerSection) {
  if (!isDemo.value) return
  drawerKind.value = kind; drawerSection.value = section; drawerOpen.value = true
}
async function onTabKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const index = tabs.findIndex(t => t.id === tab.value)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
  await router.replace({ query: { ...route.query, tab: tabs[next].id } })
  await nextTick(); document.getElementById('assess-tab-' + tabs[next].id)?.focus()
}
watch(() => auth.user?.id, () => { drawerOpen.value = false })
watch(() => route.fullPath, () => { drawerOpen.value = false })
</script>
