<!-- @copyBudget 170 学习检查只作演示入口，不伪造教师真实任务。 -->
<template>
  <div v-if="demo" class="assessment-learning">
    <div class="assessment-section-heading"><h2>带着反馈，再进步一步</h2><p>先看要求，再检查自己的想法。</p></div>
    <section class="assessment-priority assessment-learning-task"><img class="assessment-school-art" :src="demoAssessment.resources.temperature" alt="" /><div><span class="assessment-status">示例任务 · 条件判断</span><h3>{{ demoAssessment.task.title }}</h3><p>为校园活动写一个温度提醒器。</p><p class="assessment-note">这次先说清楚：输入是什么？遇到边界怎么办？</p><div class="assessment-actions"><button class="assessment-button assessment-button--primary" type="button" @click="$emit('open', 'submission', 'rules')">先看任务要求</button><button class="assessment-button" type="button" @click="$emit('records')">看看提交和反馈</button></div></div></section>
    <ol class="assessment-check-steps"><li><span>1</span><div><strong>看清要求</strong><p>知道要做什么</p></div></li><li><span>2</span><div><strong>留下自己的想法</strong><p>解释、代码和测试</p></div></li><li><span>3</span><div><strong>带着反馈再试</strong><p>对照新的原件复核</p></div></li></ol>
    <section class="assessment-mentor"><div class="assessment-mentor-avatar"><img :src="demoAssessment.resources.avatar" alt="" /><span>AI</span></div><div class="assessment-mentor-copy"><strong>AI导师 · 帮你看懂依据</strong><p>先看看你的提交，再说下一步。材料不够时，不提前下结论。</p><small>人工编写的流程演示，未调用真实AI。</small></div><button class="assessment-button" type="button" @click="$emit('open', 'submission', 'ai')">看看建议怎么来</button></section>
  </div>
  <section v-else class="assessment-empty"><img :src="demoAssessment.resources.temperature" alt="" /><h2>从老师安排的任务开始</h2><p>分析、建模、编程、测试和反思，都是学习的依据。</p><p class="assessment-note">本页的学习检查与反馈汇总还未接入课堂数据。研究小测请查看“研究测评”。</p><div class="assessment-actions"><RouterLink to="/student/home?section=tasks" class="assessment-button assessment-button--primary">查看课堂任务</RouterLink><button class="assessment-button" type="button" @click="$emit('demo')">体验学习检查</button></div></section>
</template>
<script setup lang="ts">
import { demoAssessment, type DrawerKind, type DrawerSection } from '@/data/assessmentDemo'
defineProps<{ demo: boolean }>()
defineEmits<{ open: [kind: DrawerKind, section?: DrawerSection]; records: []; demo: [] }>()
</script>
