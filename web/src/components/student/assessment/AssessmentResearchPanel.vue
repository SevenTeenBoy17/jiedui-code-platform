<!-- @copyBudget 245 按02画布：研究目的、开放状态、隐私及AI边界不折叠。 -->
<template>
  <div class="assessment-research">
    <div class="assessment-heading-row"><div class="assessment-section-heading"><h2>老师安排的小测</h2><p>用于教学研究，与日常练习分开。</p></div><button type="button" class="assessment-button" @click="$emit('open', 'privacy')">参与与隐私说明</button></div>
    <section class="assessment-schedule-banner"><img :src="demoAssessment.resources.calendar" alt="" /><div><h3>现在不用作答</h3><p>开放后，这里会出现“开始小测”按钮。</p></div></section>
    <section aria-labelledby="research-unit"><h3 id="research-unit" class="assessment-unit-title">这个单元 · 条件判断</h3>
      <ol class="assessment-stages">
        <li><span class="assessment-stage-number">1</span><article class="assessment-stage-row"><img :src="demoAssessment.resources.notebook" alt="" /><div><h3>学习前小测</h3><p>（单元前测）</p></div><div class="assessment-stage-status"><p>已经交上了，不用重复提交</p><small>结果还没发布</small></div><button class="assessment-button" type="button" @click="$emit('open', 'receipt')">看提交凭证</button></article></li>
        <li><span class="assessment-stage-number">2</span><article class="assessment-stage-row"><div class="assessment-lock-art"><img :src="demoAssessment.resources.calendar" alt="" /><span><BaseIcon name="lock" :size="20" /></span></div><div><h3>学习中小测</h3><p>（阶段检查）</p></div><p class="assessment-stage-status">还没开放，等老师通知</p><button class="assessment-button" type="button" :aria-expanded="arrangementOpen" aria-controls="research-arrangement" @click="arrangementOpen = !arrangementOpen">{{ arrangementOpen ? '收起安排' : '看看安排' }}</button></article></li>
      </ol>
      <div v-if="arrangementOpen" id="research-arrangement" class="assessment-inline-note"><strong>老师开放后，才能开始</strong><p>目前没有公布时间。这里先显示安排，不读取题目或答案。</p></div>
    </section>
    <section class="assessment-earlier"><details><summary>更早的安排 <span aria-hidden="true">⌄</span></summary><p class="assessment-note">上一单元的作答窗口已经结束。如果错过了，请和老师确认后续安排。</p></details><div class="assessment-earlier-row"><img src="/generated/student-growth/stage-task.png" alt="" /><p><strong>上一单元小测</strong> · 已结束，这次没有提交</p><button class="assessment-button assessment-button--small" type="button" @click="$emit('open', 'contact')">请老师帮我确认</button></div></section>
    <section class="assessment-mentor assessment-mentor--research" aria-label="AI流程帮助"><div class="assessment-mentor-avatar"><img :src="demoAssessment.resources.avatar" alt="" /><span>AI</span></div><div class="assessment-mentor-copy"><strong>AI导师 · 只提供流程帮助</strong><p>结果还没发布，我先帮你看懂流程。</p><small>人工演示，未调用真实AI；不评价作答，不提供答案。</small></div><button class="assessment-button" type="button" @click="$emit('open', 'flow')">了解小测流程</button></section>
    <p class="assessment-footnote">研究记录单独保存，不自动变成成长分数。</p>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import { demoAssessment, type DrawerKind } from '@/data/assessmentDemo'
defineEmits<{ open: [kind: DrawerKind] }>()
const arrangementOpen = ref(false)
</script>
