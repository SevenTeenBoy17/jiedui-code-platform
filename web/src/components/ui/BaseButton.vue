<template>
  <button :class="['btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block']" :disabled="disabled">
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'run' | 'danger' | 'ghost'
    size?: 'sm' | 'md' | 'lg'
    block?: boolean
    disabled?: boolean
  }>(),
  { variant: 'primary', size: 'md' },
)
</script>

<style scoped>
.btn {
  font-family: var(--font-sans); font-weight: var(--fw-medium); border: none; cursor: pointer;
  border-radius: var(--r-md);
  /* UI调研'26-08 落地（Emil 7-tips + 复核清单）：transition 指明属性、不用 all ——
     all 会把未来任何属性改动都拖进动画；transform 走 --d-fast/--e-out（motion.css 强曲线），
     并因此自动吃 reduced-motion 的时长归零降级，无需另写 @media。 */
  transition: background-color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease),
    transform var(--d-fast) var(--e-out);
  display: inline-flex; gap: var(--sp-2); align-items: center; justify-content: center;
}
.btn--sm { height: 32px; padding: 0 var(--sp-3); font-size: var(--fs-sm); }
.btn--md { height: 40px; padding: 0 var(--sp-4); font-size: var(--fs-base); }
.btn--lg { height: 48px; padding: 0 var(--sp-5); font-size: var(--fs-md); }
.btn--block { width: 100%; }
/* UI调研'26-08 落地（Emil tip 1；Linear/Arc 实测同款）：按压 scale(.97)——界面在「听」用户。
   只动 transform 不碰布局；:not(:disabled) 挡掉「按了个不能按的」的假反馈。 */
.btn:active:not(:disabled) { transform: scale(.97); }
/* 实心底一律走 --on-* 安全组合（白字压亮色不达标的老教训）。 */
.btn--primary { background: var(--on-primary-bg); color: var(--on-primary-fg); }
.btn--primary:hover:not(:disabled) { background: var(--color-primary-strong); }
.btn--run { background: var(--on-accent-bg); color: var(--on-accent-fg); box-shadow: 0 3px 0 var(--orange-700); }
.btn--run:hover:not(:disabled) { background: var(--orange-300); }
/* UI调研'26-08 落地（Duolingo 羽毛按钮的公开工艺 + PostHog 同色深描边思路）：
   学生端「运行」是全站最该有实体感的键 —— 深一档同色底沿造 3D，按下整体下沉、底沿收平。
   box-shadow 不参与布局，工具条不跳；该变体全库仅学生 IdeView 一处（已核），不漏教师端。 */
.btn--run:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 0 0 var(--orange-700); }
.btn--secondary { background: var(--color-surface); color: var(--color-primary-ontext); border: 1px solid var(--color-border); }
.btn--secondary:hover:not(:disabled) { border-color: var(--color-primary); background: var(--blue-50); }
.btn--danger { background: var(--on-danger-bg); color: var(--on-danger-fg); }
.btn--ghost { background: transparent; color: var(--color-text-2); }
.btn--ghost:hover:not(:disabled) { background: var(--color-fill-2); }
.btn:disabled { opacity: .5; cursor: not-allowed; }
</style>
