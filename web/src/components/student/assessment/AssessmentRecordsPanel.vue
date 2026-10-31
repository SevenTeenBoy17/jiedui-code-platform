<!-- @copyBudget 220 按01画布：当前任务、缺项、下一步和AI边界常显。 -->
<template>
  <div v-if="demo" class="assessment-records">
    <section class="assessment-priority" aria-labelledby="records-heading">
      <div class="assessment-section-heading"><h2 id="records-heading">看看我的任务进展</h2><p>先回应老师的反馈，再接着学。</p></div>
      <div class="assessment-priority-grid">
        <img class="assessment-school-art" :src="demoAssessment.resources.temperature" alt="" width="320" height="235" />
        <div class="assessment-task-copy">
          <span class="assessment-status">有反馈，等你补充</span><h3>{{ demoAssessment.task.title }}</h3>
          <p class="assessment-teacher">林老师的反馈</p><blockquote>“{{ demoAssessment.FB01.quote }}”</blockquote>
          <div class="assessment-actions">
            <button class="assessment-button assessment-button--primary" type="button" @click="$emit('open', 'supplement')"><img :src="growth + '/soft-pencil.png'" alt="" />补充这一步</button>
            <button class="assessment-button" type="button" @click="$emit('open', 'submission')"><BaseIcon name="file-text" />看提交和反馈</button>
          </div><p class="assessment-note">补充还没提交</p>
        </div>
      </div>
    </section>
    <section class="assessment-other" aria-labelledby="other-tasks"><h3 id="other-tasks">其他任务</h3>
      <article class="assessment-task-row"><img :src="growth + '/book-pencil.png'" alt="" /><strong>循环绘图检查</strong><p>已经交上了，等老师反馈</p><button class="assessment-button" type="button" @click="$emit('open', 'loop')">看这次提交</button></article>
      <article class="assessment-task-row"><img :src="growth + '/book-magnifier.png'" alt="" /><strong>信息来源辨识</strong><p>还没开始，先看看要做什么</p><button class="assessment-button" type="button" @click="$emit('open', 'requirements')">看任务要求</button></article>
    </section>
    <section class="assessment-mentor" aria-label="此任务的AI建议">
      <div class="assessment-mentor-avatar"><img :src="demoAssessment.resources.avatar" alt="" /><span>AI</span></div>
      <div class="assessment-mentor-copy"><strong>AI导师 · 建议待老师核对</strong><b>仅校园温度提醒器 · 第一次提交</b><p>30℃这一行还缺预期和解释，还不能判断你是否理解。</p></div>
      <div class="assessment-mentor-action"><button type="button" class="assessment-button" @click="$emit('open', 'submission', 'ai')">看建议依据</button><small>人工编写的演示建议，未调用真实AI</small></div>
    </section>
  </div>
  <section v-else class="assessment-empty"><img :src="demoAssessment.resources.notebook" alt="" /><h2>在这里，回看自己的每一步</h2><p>提交和老师反馈的记录页正在接入。</p><p class="assessment-note">暂时看不到记录，不代表你没有提交。</p><div class="assessment-actions"><RouterLink class="assessment-button assessment-button--primary" to="/student/home?section=tasks">回到课堂任务</RouterLink><button class="assessment-button" type="button" @click="$emit('demo')">体验示例记录</button></div></section>
</template>
<script setup lang="ts">
import { demoAssessment, type DrawerKind, type DrawerSection } from '@/data/assessmentDemo'
import BaseIcon from '@/components/ui/BaseIcon.vue'
defineProps<{ demo: boolean }>()
defineEmits<{ open: [kind: DrawerKind, section?: DrawerSection]; demo: [] }>()
const growth = '/generated/assessment-center-v1'
</script>
