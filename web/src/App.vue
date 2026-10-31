<template>
  <div v-if="isCloudDeployment" class="cloud-candidate">
    <aside class="cloud-candidate__notice" aria-label="云端迁移状态">
      <strong>原产品云端候选 · F1</strong>
      <span>已接通限定账号与作品保存；课堂、AI、测评、画像尚未接入。页面示例不代表真实学情。</span>
    </aside>
    <div class="cloud-candidate__product"><router-view /><RoleCompanion /></div>
  </div>
  <template v-else><router-view /><RoleCompanion /></template>
</template>

<script setup lang="ts">
import RoleCompanion from '@/components/pair/RoleCompanion.vue'
import { isCloudDeployment } from '@/config/deployment'

// 根组件：布局壳（StudentShell/TeacherShell）在各自组件上设置 data-app 主题作用域
</script>

<style scoped>
.cloud-candidate { height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); }
.cloud-candidate__notice { padding: 8px 16px; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 4px 16px; background: #fff5df; color: #68461b; font-size: 12px; line-height: 1.5; border-bottom: 1px solid #ead9b8; }
.cloud-candidate__product { min-height: 0; height: 100%; }
</style>
