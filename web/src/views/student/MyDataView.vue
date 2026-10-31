<!-- @copyBudget 300 V3 My Data: only the overview is resident; details are single-layer native dialogs. -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { complianceApi, type MyData } from '@/api/compliance'
import { request } from '@/api/http'
import type { Project } from '@/api/projects'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import DataOverview from '@/components/student/my-data/DataOverview.vue'
import DataDialog from '@/components/student/my-data/DataDialog.vue'
import { makeGroups, demoData, demoProjects, type DataProject } from '@/components/student/my-data/model'
const route=useRoute(),router=useRouter()
const demo=computed(()=>route.query.demo==='1')
const summary=ref<MyData|null>(null),error=ref(''),busy=ref(false)
const projects=ref<DataProject[]|null>(null),projectsError=ref(''),selected=ref<DataProject|null>(null)
const mode=ref<'categories'|'project'|'manage'|'use'|null>(null),category=ref('all')
const detailTarget=ref('')
const groups=computed(()=>makeGroups(summary.value,demo.value))
const total=computed(()=>demo.value?demoData.total_rows:summary.value?.total_rows??null)
const titles={categories:'全部数据分类',project:'作品与原件详情',manage:'管理我的资料',use:'这些数据有什么用'}
let generation=0
async function load(){const id=++generation;error.value='';projectsError.value='';summary.value=null;projects.value=null;selected.value=null;if(demo.value){projects.value=demoProjects;selected.value=demoProjects[0];busy.value=false;return}busy.value=true;const [s,p]=await Promise.allSettled([complianceApi.myData(),request<Project[]>('/api/projects')]);if(id!==generation)return;busy.value=false;if(s.status==='fulfilled'&&s.value)summary.value=s.value;else error.value='暂时读不到你的资料清单，请重试。';if(p.status==='fulfilled'){projects.value=Array.from(new Map(p.value.map(p=>[p.id,p])).values()).map(p=>({id:p.id,title:p.title,language:p.language,version:p.latest_version}));selected.value=projects.value[0]??null}else projectsError.value='请求未成功，不代表你没有作品。'}
function openCategories(group:string){category.value=group;mode.value='categories'}
function openProject(p:DataProject,target=''){selected.value=p;detailTarget.value=target;mode.value='project'}
function workshop(p:DataProject){selected.value=p;if(demo.value){openProject(p,'preview');return}mode.value=null;router.push({path:'/student/ide',query:{project:String(p.id),mode:p.language}})}
watch(demo,()=>{mode.value=null;load()},{immediate:true})
watch(()=>route.query.section,s=>{if(s==='account')mode.value='manage'},{immediate:true})
</script>
<template>
 <section class="my-data-page" aria-label="我的数据工作区"><div class="data-toolbar"><p>看看留下了什么，找到我的作品</p><div><span :class="['data-mode',{'data-mode--demo':demo}]"><BaseIcon :name="demo?'eye':'lock'" :size="17" />{{demo?'设计预览 · 全部为演示数据':'本人资料 · 真实接口'}}</span><button class="data-manage-entry" @click="mode='manage'"><BaseIcon name="user" :size="18" />管理我的资料</button></div></div>
  <div v-if="busy" class="data-loading" role="status" aria-live="polite"><p>正在读取你保存的资料…</p><div /><div /></div>
  <template v-else><div v-if="error" class="data-error" role="alert">{{error}}<button @click="load">重新读取</button></div><DataOverview :demo="demo" :total="total" :groups="groups" :projects="projects" :projects-error="projectsError" :selected="selected" @categories="openCategories" @project="openProject" @select="selected=$event" @workshop="workshop" @use="mode='use'" @retry="load" /></template>
  <DataDialog :open="mode!==null" :mode="mode" :title="mode?titles[mode]:''" :demo="demo" :total="total" :groups="groups" :category="category" :selected="selected" :detail-target="detailTarget" :summary="summary" @close="mode=null" @manage="mode='manage'" @updated="load" @workshop="workshop" />
 </section>
</template>
<style scoped>
.my-data-page{min-height:100%;box-sizing:border-box;background:linear-gradient(150deg,#f1f8fd,#f7faff);padding:16px 18px 20px;color:#203558}.data-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}.data-toolbar>p{font-size:14px;margin:0;color:#58708f}.data-toolbar>div{display:flex;align-items:center;gap:12px}.data-mode{display:inline-flex;gap:7px;align-items:center;color:#32717d;background:#e8f4f3;border:1px solid #d2eae8;padding:9px 13px;border-radius:12px;font-size:12px;white-space:nowrap}.data-mode--demo{color:#315fa5;background:#eef5ff;border-color:#cbdffb}.data-manage-entry{display:flex;align-items:center;gap:8px;min-height:44px;padding:9px 15px;background:#fbfdff;border:1px solid #8cb1e7;border-radius:12px;color:#265fad;font:inherit;font-size:13px;cursor:pointer}.data-manage-entry:hover{background:#e8f2ff}.data-manage-entry:focus-visible,.data-error button:focus-visible{outline:3px solid #2263d4;outline-offset:3px}.data-loading{color:#536e8d}.data-loading>div{height:160px;border:1px solid #e1ebf5;background:#e9f2fa;border-radius:22px;margin-top:16px}.data-error{border:1px solid #eccca8;border-radius:12px;background:#fff8ee;padding:12px 16px;margin-bottom:12px;color:#80542d;font-size:14px}.data-error button{border:1px solid #ab7946;min-height:44px;border-radius:8px;background:#fffcf6;margin-left:12px;padding:7px 13px;cursor:pointer}.category-summary{margin:0 0 15px;color:#586e90;font-size:14px}
@media(max-width:760px){.my-data-page{padding:12px}.data-toolbar{align-items:flex-start;flex-direction:column;gap:10px}.data-toolbar>div{width:100%;flex-wrap:wrap;gap:8px}.data-mode{font-size:11px;padding:8px}.data-toolbar>p{font-size:13px}.data-manage-entry{font-size:12px;padding:8px 10px}}
</style>
