<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseIcon from '../../ui/BaseIcon.vue'

type CategoryItem = {
  category: string
  title: string
  n: number | null
  description?: string
}

type CategoryGroup = {
  id: string
  title: string
  icon: string
  count: number | null
  items: CategoryItem[]
}

const props = defineProps<{
  groups: CategoryGroup[]
  initialGroup?: string
}>()
const emit = defineEmits<{ manage: [] }>()
const selectedGroup = ref('all')

watch(
  () => [props.initialGroup, props.groups.map(group => group.id).join('|')] as const,
  () => {
    selectedGroup.value = props.groups.some(group => group.id === props.initialGroup)
      ? props.initialGroup!
      : 'all'
  },
  { immediate: true },
)

const visibleGroups = computed(() => selectedGroup.value === 'all'
  ? props.groups
  : props.groups.filter(group => group.id === selectedGroup.value))

function knownCount(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0
}

function countLabel(value: number | null) {
  return knownCount(value) ? value.toLocaleString('zh-CN') : '—'
}

function iconSource(icon: string) {
  return icon.startsWith('/') ? icon : `/generated/my-data-v2/${icon || 'folder'}.png`
}

function detailNote(item: CategoryItem) {
  if (!knownCount(item.n)) return '当前尚未读取这类资料的数量，不能把它当作 0。'
  if (item.n === 0) return '当前返回数量为 0，暂时没有可查看的记录。'
  return '当前接口提供这类资料的数量，不等于已提供每一份原件。这里不根据条数判断你的能力。'
}
</script>

<template>
  <section class="data-categories" aria-label="数据分类目录">
    <div class="category-filters" role="group" aria-label="选择数据分组">
      <button
        type="button"
        class="category-filter"
        :class="{ 'category-filter--active': selectedGroup === 'all' }"
        :aria-pressed="selectedGroup === 'all'"
        @click="selectedGroup = 'all'"
      >全部分类</button>
      <button
        v-for="group in groups"
        :key="group.id"
        type="button"
        class="category-filter"
        :class="{ 'category-filter--active': selectedGroup === group.id }"
        :aria-pressed="selectedGroup === group.id"
        @click="selectedGroup = group.id"
      >{{ group.title }}</button>
    </div>

    <p class="category-guide">点开一行，看看具体保存了什么。</p>

    <div v-if="visibleGroups.length" class="category-grid">
      <section v-for="group in visibleGroups" :key="group.id" class="category-group">
        <header class="category-group-heading">
          <img :src="iconSource(group.icon)" alt="" width="52" height="52" class="category-icon" />
          <h3>{{ group.title }}<span class="group-total"> · {{ countLabel(group.count) }}<small v-if="knownCount(group.count)"> 条</small><small v-else> 暂未读取</small></span></h3>
        </header>

        <div class="category-list">
          <details v-for="item in group.items" :key="item.category" class="category-row">
            <summary>
              <span class="category-name">{{ item.title }}</span>
              <span class="category-count" :class="{ 'category-count--quiet': !knownCount(item.n) || item.n === 0 }">
                {{ countLabel(item.n) }}<span v-if="item.n === 0" class="category-state"> · 暂无记录</span><span v-else-if="!knownCount(item.n)" class="category-state"> · 暂未读取</span>
              </span>
              <BaseIcon name="arrow-right" :size="16" class="category-chevron" />
            </summary>
            <div class="category-row-detail">
              <p class="category-detail-label">保存内容</p>
              <p>{{ item.description || '当前接口未提供具体保存内容的说明，也未提供这类资料的原件。' }}</p>
              <p class="category-detail-note">{{ detailNote(item) }}</p>
              <span class="category-source">来源类别：<code>{{ item.category }}</code></span>
            </div>
          </details>
        </div>

        <div v-if="group.id === 'creative' && group.items.length <= 3" class="category-art-hint" aria-hidden="true">
          <img src="/generated/my-data-v2/folder.png" alt="" width="120" height="100" />
          <p>每一份作品，都有自己的记录。</p>
        </div>
        <p v-if="group.id === 'pair'" class="category-group-note">
          <BaseIcon name="help-circle" :size="18" />
          <span>角色、时间和回复类型不等于聊天或 AI 回复正文。</span>
        </p>
      </section>
    </div>
    <div v-else class="category-unavailable" role="status">
      <BaseIcon name="folder" :size="32" />
      <h3>分类暂时还没有读到</h3>
      <p>这不代表你没有留下资料，请稍后重新查看。</p>
    </div>

    <footer class="category-footer">
      <p><BaseIcon name="help-circle" :size="18" /><span>0 = 暂无记录；— = 暂未读取。条数不是能力分数。</span></p>
      <button type="button" class="category-manage" @click="emit('manage')">
        <BaseIcon name="lock" :size="18" />数据用途与管理
      </button>
    </footer>
  </section>
</template>

<style scoped>
.data-categories {
  --category-ink: #233858;
  --category-muted: #61738e;
  --category-blue: #2869d4;
  --category-border: #dae5f5;
  color: var(--category-ink);
  min-width: 0;
}
.category-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.category-filter, .category-manage {
  min-height: 44px;
  border: 1px solid var(--category-border);
  background: #f9fcff;
  color: #47617e;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.category-filter { padding: 9px 15px; border-radius: 14px; }
.category-filter:hover { border-color: #aec7f1; background: #f0f6ff; }
.category-filter--active { color: #175fc5; border-color: #aecaf2; background: #eaf3ff; }
.category-guide { margin: 0 0 14px; color: var(--category-muted); font-size: 14px; }
.category-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; align-items: stretch; }
.category-group {
  min-width: 0;
  padding: 17px 18px 15px;
  border: 1px solid var(--category-border);
  border-radius: 18px;
  background: #fdfefe;
  box-shadow: 0 2px 8px rgb(69 100 149 / 6%);
  display: flex;
  flex-direction: column;
}
.category-group-heading { display: flex; align-items: center; gap: 12px; min-height: 59px; padding-bottom: 11px; }
.category-icon { flex: 0 0 48px; width: 48px; height: 48px; object-fit: contain; }
.category-group-heading h3 { margin: 0; font-size: 17px; line-height: 1.5; font-weight: 750; overflow-wrap: anywhere; }
.group-total { font-variant-numeric: tabular-nums; white-space: nowrap; }
.group-total small { font-size: 13px; font-weight: 500; }
.category-list { border-top: 1px solid #e7edf6; }
.category-row + .category-row { border-top: 1px solid #e7edf6; }
.category-row summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 9px 1px;
  cursor: pointer;
  list-style: none;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.5;
}
.category-row summary::-webkit-details-marker { display: none; }
.category-row summary:hover { background: #f0f6ff; }
.category-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.category-count { flex: 0 0 auto; font-weight: 700; font-variant-numeric: tabular-nums; font-size: 16px; text-align: right; }
.category-count--quiet { color: #71809a; font-weight: 400; font-size: 14px; }
.category-state { font-size: 13px; white-space: nowrap; }
.category-chevron { flex: 0 0 auto; color: #7d94b3; transition: transform 160ms ease-out; }
.category-row[open] .category-chevron { transform: rotate(90deg); }
.category-row[open] summary { color: #1e63bd; }
.category-row-detail { padding: 12px 13px; margin-bottom: 10px; border-radius: 10px; background: #f0f6fd; overflow-wrap: anywhere; }
.category-row-detail p { margin: 0; font-size: 13px; line-height: 1.7; }
.category-row-detail p + p { margin-top: 6px; }
.category-detail-label { font-weight: 700; }
.category-row-detail .category-detail-note { color: #536c88; }
.category-source { display: block; margin-top: 9px; color: #617792; font-size: 13px; }
.category-source code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }
.category-art-hint { margin: auto 0 0; padding-top: 12px; text-align: center; color: #697d97; }
.category-art-hint img { display: block; margin: 0 auto; max-width: 100%; object-fit: contain; }
.category-art-hint p { margin: 5px 0 0; font-size: 13px; }
.category-group-note { display: flex; align-items: flex-start; gap: 8px; margin: auto 0 0; padding-top: 22px; color: #5b7190; font-size: 13px; line-height: 1.7; }
.category-group-note .ico { margin-top: 2px; }
.category-footer { display: flex; justify-content: space-between; align-items: center; gap: 18px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--category-border); }
.category-footer p { display: flex; align-items: center; gap: 8px; margin: 0; color: #5e7190; font-size: 13px; line-height: 1.6; }
.category-manage { flex-shrink: 0; display: inline-flex; justify-content: center; align-items: center; gap: 8px; padding: 10px 18px; border-color: #8cb5ec; border-radius: 12px; color: var(--category-blue); }
.category-manage:hover { background: #eaf3ff; border-color: var(--category-blue); }
.category-filter:focus-visible, .category-manage:focus-visible, .category-row summary:focus-visible { outline: 3px solid #79a9ed; outline-offset: 3px; }
.category-unavailable { padding: 32px 18px; text-align: center; background: #f4f8fe; border-radius: 18px; color: var(--category-muted); }
.category-unavailable h3 { color: var(--category-ink); font-size: 18px; }
.category-unavailable p { font-size: 14px; }
@media (max-width: 1050px) {
  .category-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .category-grid { grid-template-columns: minmax(0, 1fr); gap: 14px; }
  .category-filters { gap: 7px; }
  .category-filter { padding-inline: 12px; font-size: 13px; }
  .category-group { padding: 14px; }
  .category-footer { align-items: stretch; flex-direction: column; }
  .category-manage { width: 100%; }
  .category-art-hint { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .category-chevron { transition: none; }
}
</style>
