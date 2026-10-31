<template>
  <section class="card"><slot /></section>
</template>

<style scoped>
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);   /* 企业卡片：细边框是质感来源，不靠大阴影 */
  border-radius: var(--card-radius, var(--r-lg));
  box-shadow: var(--elev, var(--shadow-sm));
  padding: var(--sp-5);
}
</style>
