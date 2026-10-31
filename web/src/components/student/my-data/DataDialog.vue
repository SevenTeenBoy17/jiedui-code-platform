<!-- @lintOverlay @copyBudget 200 V3 wide detail dialog: own heading plus independently reviewed 180-character detail. -->
<script setup lang="ts">
import { defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { gsap } from 'gsap'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import type { MyData } from '@/api/compliance'
import type { DataGroup, DataProject } from './model'
const DataCategories=defineAsyncComponent(()=>import('./DataCategories.vue'))
const ProjectDetail=defineAsyncComponent(()=>import('./ProjectDetail.vue'))
const DataManagement=defineAsyncComponent(()=>import('./DataManagement.vue'))
const props=defineProps<{open:boolean;title:string;demo:boolean;mode:'categories'|'project'|'manage'|'use'|null;total:number|null;groups:DataGroup[];category:string;selected:DataProject|null;detailTarget:string;summary:MyData|null}>()
const emit=defineEmits<{close:[];manage:[];updated:[];workshop:[project:DataProject]}>()
const dialog=ref<HTMLDialogElement|null>(null),heading=ref<HTMLElement|null>(null)
let trigger:HTMLElement|null=null,mm:gsap.MatchMedia|null=null
watch(()=>props.open,async open=>{await nextTick();const el=dialog.value;if(!el)return;mm?.revert();mm=null;if(open){trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;if(!el.open)el.showModal();heading.value?.focus({preventScroll:true});mm=gsap.matchMedia();mm.add('(prefers-reduced-motion: no-preference)',()=>{gsap.fromTo(el,{opacity:0,y:12},{opacity:1,y:0,duration:.22,ease:'power3.out',clearProps:'transform,opacity'})})}else{el.close();if(trigger?.isConnected)trigger.focus({preventScroll:true})}},{immediate:true})
watch(()=>props.title,async()=>{if(props.open){await nextTick();heading.value?.focus({preventScroll:true});dialog.value?.querySelector('.data-dialog-body')?.scrollTo(0,0)}})
onBeforeUnmount(()=>{mm?.revert();dialog.value?.close();if(trigger?.isConnected)trigger.focus({preventScroll:true})})
</script>
<template><dialog ref="dialog" class="data-dialog" :class="{'is-project':mode==='project'}" aria-labelledby="data-dialog-title" @cancel.prevent="emit('close')" @close="open&&emit('close')"><header class="data-dialog-header"><div><h2 id="data-dialog-title" ref="heading" tabindex="-1">{{title}}</h2><p>{{demo?'设计预览 · 全部为演示数据':'仅查看本人资料'}}</p></div><button type="button" aria-label="关闭详情并返回原来的按钮" @click="emit('close')">关闭<BaseIcon name="x" :size="20" /></button></header><div class="data-dialog-body">
<template v-if="mode==='categories'"><p class="category-summary">{{total??'—'}} 条记录 · {{groups.reduce((n,g)=>n+g.items.length,0)}} 个类别 · {{groups.some(g=>g.items.some(i=>i.n===null))?'—':groups.flatMap(g=>g.items).filter(i=>i.n===0).length}} 类暂无记录</p><DataCategories :groups="groups" :initial-group="category" @manage="emit('manage')" /></template>
<ProjectDetail v-else-if="mode==='project'&&selected" :project="selected" :demo="demo" :initial-target="detailTarget" @close="emit('close')" @workshop="emit('workshop',$event)" />
<DataManagement v-else-if="mode==='manage'||mode==='use'" :demo="demo" :summary="summary" :initial-section="mode==='use'?'use':'manage'" @updated="emit('updated')" />
</div></dialog></template>
<style scoped>
.is-project .data-dialog-header{padding-block:8px}.is-project .data-dialog-header h2{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.is-project .data-dialog-header p{margin:0}.is-project .data-dialog-body{padding-top:16px}
.data-dialog{position:fixed;inset:0;width:min(1320px,calc(100vw - 282px));max-width:none;max-height:calc(100dvh - 40px);height:auto;margin:auto 22px auto auto;padding:0;border:1px solid #d5e2f5;border-radius:24px;background:#fafdff;color:#203558;box-shadow:0 20px 70px #243b635c;overflow:hidden}.data-dialog[open]{display:flex;flex-direction:column}.data-dialog::backdrop{background:#24395561}.data-dialog-header{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-shrink:0;padding:20px 26px 15px;border-bottom:1px solid #e2eaf5;background:#fdfefe}.data-dialog-header h2{font-size:25px;font-weight:750;margin:0;line-height:1.4}.data-dialog-header h2:focus{outline:none}.data-dialog-header p{font-size:13px;color:#596f91;margin:4px 0 0}.data-dialog-header button{display:flex;align-items:center;gap:8px;min-width:84px;min-height:44px;padding:8px 14px;border:1px solid #9ebbe8;border-radius:12px;color:#265fae;background:#f9fcff;font:inherit;cursor:pointer}.data-dialog-header button:hover{background:#edf4ff}.data-dialog-header button:focus-visible{outline:3px solid #2263d4;outline-offset:3px}.data-dialog-body{min-height:0;overflow:auto;overscroll-behavior:contain;padding:20px 26px 24px}
@media(max-width:1120px){.data-dialog{width:calc(100vw - 110px);margin-right:16px}.data-dialog-body{padding:18px}.data-dialog-header{padding:18px}}
@media(max-width:720px){.data-dialog{width:calc(100vw - 20px);max-height:calc(100dvh - 20px);margin:10px;border-radius:18px}.data-dialog-header h2{font-size:20px}.data-dialog-body{padding:14px}.data-dialog-header{padding:14px;gap:10px}.data-dialog-header button{min-width:70px;padding:8px}}
</style>
