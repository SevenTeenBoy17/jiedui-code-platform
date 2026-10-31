<!-- @copyBudget 120：登录首页按已选参考稿保留品牌、学习路径与双角色表单三组必要信息。 -->
<template>
  <main class="login-page">
    <section class="shell" aria-labelledby="login-title">
      <header class="topbar">
        <a class="brand" href="#login-title" aria-label="结对编程智能体首页">
          <img :src="asset('mascot_cat')" alt="" />
          <span>结对编程智能体</span>
        </a>

        <div class="feature-rail" aria-label="平台特点">
          <div class="feature-card feature-card--task">
            <BaseIcon name="compass" :size="27" />
            <span>任务驱动</span>
          </div>
          <div class="feature-card feature-card--hint">
            <BaseIcon name="blocks" :size="27" />
            <span>分层提示</span>
          </div>
          <div class="feature-card feature-card--evidence">
            <BaseIcon name="check-square" :size="27" />
            <span>证据可追溯</span>
          </div>
        </div>
      </header>

      <div class="content-grid">
        <section class="intro" aria-label="平台介绍">
          <p class="eyebrow">初中信息课</p>
          <h1 id="login-title">和智能体一起，<br />把思路写成程序</h1>
          <p class="intro-copy">从分析、建模到测试迁移，在教师支持下完成真实编程任务。</p>

          <div class="intro-actions">
            <button class="action action--primary" type="button" @click="selectRole('student')">
              <BaseIcon name="user" :size="20" />
              <span>学生登录</span>
            </button>
            <button class="action action--secondary" type="button" @click="selectRole('teacher')">
              <BaseIcon name="school" :size="20" />
              <span>教师登录</span>
            </button>
          </div>

          <div class="learning-card" aria-label="计算思维学习路径">
            <div class="learning-path">
              <span class="path-step path-step--analyze"><BaseIcon name="compass" :size="18" />分析</span>
              <BaseIcon class="path-arrow" name="arrow-right" :size="14" />
              <span class="path-step path-step--model"><BaseIcon name="blocks" :size="18" />建模</span>
              <BaseIcon class="path-arrow" name="arrow-right" :size="14" />
              <span class="path-step path-step--code"><BaseIcon name="keyboard" :size="18" />编码</span>
              <BaseIcon class="path-arrow" name="arrow-right" :size="14" />
              <span class="path-step path-step--test"><BaseIcon name="flask" :size="18" />测试</span>
              <BaseIcon class="path-arrow" name="arrow-right" :size="14" />
              <span class="path-step path-step--reflect"><BaseIcon name="trend" :size="18" />反思迁移</span>
            </div>
            <p class="trust-note"><BaseIcon name="check-square" :size="20" />只给分层提示，不代写答案</p>
          </div>
        </section>

        <section class="visual-stage" aria-label="树小骥与熊猫泡泡伙伴及登录入口">
          <div class="hero-scene">
            <div class="hero-art-frame">
              <PairDuoIllustration class="hero-art" label="树小骥导航员与熊猫泡泡领航员一起陪伴编程学习" />
            </div>
          </div>

          <section class="login-card" aria-label="登录表单">
            <div class="card-heading"><p>选择身份</p></div>

            <div class="role-tabs" aria-label="选择登录身份">
              <button id="student-tab" :class="['role-tab', { active: role === 'student' }]" type="button" :aria-pressed="role === 'student'" @click="selectRole('student')">学生</button>
              <button id="teacher-tab" :class="['role-tab', { active: role === 'teacher' }]" type="button" :aria-pressed="role === 'teacher'" @click="selectRole('teacher')">教师</button>
            </div>

            <div v-if="role === 'student' && !isCloudDeployment && !isShowcase" class="mode-switch" aria-label="学生登录方式">
              <button :class="{ active: mode === 'account' }" type="button" :aria-pressed="mode === 'account'" @click="mode = 'account'">账号登录</button>
              <button :class="{ active: mode === 'classcode' }" type="button" :aria-pressed="mode === 'classcode'" @click="mode = 'classcode'">班级码登录</button>
            </div>
            <p v-if="isCloudDeployment" class="cloud-login-note" title="仅限受邀邮箱账号，身份由学校分配">邮箱登录 · 暂无班级码</p>

            <form v-if="isShowcase" class="form" @submit.prevent="onSubmit">
              <p class="showcase-entry-note">免登录演示</p>
              <BaseButton class="login-submit" variant="run" size="lg" block>
                {{ role === 'teacher' ? '进入教师演示' : '进入学生演示' }}
              </BaseButton>
            </form>
            <form v-else id="login-form" class="form" @submit.prevent="onSubmit">
              <label class="field-label" for="login-username">{{ usernamePlaceholder }}</label>
              <div class="field">
                <BaseIcon :name="role === 'student' && mode === 'classcode' ? 'school' : 'user'" :size="19" />
                <input id="login-username" ref="usernameInput" v-model="username" :placeholder="`请输入${usernamePlaceholder}`" :autocomplete="role === 'student' && mode === 'classcode' ? 'off' : 'username'" />
              </div>

              <label class="field-label" for="login-password">密码</label>
              <div class="field">
                <BaseIcon name="lock" :size="19" />
                <input id="login-password" v-model="password" :type="showPwd ? 'text' : 'password'" placeholder="请输入密码" autocomplete="current-password" />
                <button type="button" class="eye" :aria-label="showPwd ? '隐藏密码' : '显示密码'" :aria-pressed="showPwd" @click="showPwd = !showPwd">
                  <BaseIcon :name="showPwd ? 'eye-off' : 'eye'" :size="19" />
                </button>
              </div>

              <p v-if="error || auth.sessionError" class="error" role="alert">{{ error || auth.sessionError }}</p>
              <BaseButton class="login-submit" variant="run" size="lg" block :disabled="loading">
                {{ loading ? '正在登录…' : role === 'teacher' ? '进入教师工作台' : '进入学习' }}
              </BaseButton>
            </form>

            <p class="privacy-note"><BaseIcon name="check" :size="14" />仅用于课堂支持</p>
          </section>
        </section>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import PairDuoIllustration from '@/components/pair/PairDuoIllustration.vue'
import { asset } from '@/assets/assets'
import { isCloudDeployment } from '@/config/deployment'

type LoginRole = 'student' | 'teacher'
const isShowcase = import.meta.env.VITE_DEPLOYMENT_TARGET === 'showcase'

const DEFAULT_CREDENTIALS: Record<LoginRole, { username: string; password: string }> = {
  student: { username: 'xiaoma', password: '123456' },
  teacher: { username: 'teacher', password: '123456' },
}

const router = useRouter()
const auth = useAuthStore()
const role = ref<LoginRole>('student')
const mode = ref<'account' | 'classcode'>('account')
const username = ref(isCloudDeployment ? '' : DEFAULT_CREDENTIALS.student.username)
const password = ref(isCloudDeployment ? '' : DEFAULT_CREDENTIALS.student.password)
const showPwd = ref(false)
const loading = ref(false)
const error = ref('')
const usernameInput = ref<HTMLInputElement | null>(null)
const usernamePlaceholder = computed(() => isCloudDeployment ? '受邀账号邮箱' : role.value === 'teacher' ? '教师账号 / 工号' : mode.value === 'classcode' ? '班级码' : '学生账号')

onMounted(() => {
  document.title = '结对编程智能体'
})

function selectRole(nextRole: LoginRole) {
  role.value = nextRole
  mode.value = 'account'
  username.value = isCloudDeployment ? username.value : DEFAULT_CREDENTIALS[nextRole].username
  password.value = isCloudDeployment ? '' : DEFAULT_CREDENTIALS[nextRole].password
  error.value = ''
  nextTick(() => usernameInput.value?.focus())
}

async function onSubmit() {
  if (loading.value) return
  error.value = ''
  loading.value = true
  try {
    const u = await auth.login(username.value, password.value, role.value)
    router.push(u.role === 'teacher' ? '/teacher' : '/student')
  } catch (e: any) {
    error.value = e?.message || '登录失败'
  } finally {
    if (isCloudDeployment) password.value = ''
    loading.value = false
  }
}
</script>

<style scoped>
.showcase-entry-note { margin: 8px 0 20px; line-height: 1.8; color: #526273; font-size: 15px; }
.login-page {
  --outer: clamp(18px, 2vw, 32px);
  width: 100%;
  min-height: 100dvh;
  padding: var(--outer);
  background: #f2f4f5;
  color: #17222d;
}

.shell {
  --rail: clamp(48px, 5.2vw, 82px);
  width: 100%;
  min-height: calc(100dvh - 2 * var(--outer));
  max-width: 1524px;
  display: grid;
  grid-template-rows: 112px minmax(0, 1fr);
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid rgba(214, 220, 224, .78);
  border-radius: 26px;
  background: linear-gradient(135deg, #fcfdfd 0%, #f8fafb 62%, #f4f6f7 100%);
  box-shadow: 0 24px 64px rgba(25, 38, 50, .11);
}

.topbar {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 32px;
  padding-inline: var(--rail);
  border-bottom: 1px solid #e9edef;
  background: rgba(255, 255, 255, .82);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: #1b232c;
  font-size: clamp(20px, 1.75vw, 27px);
  font-weight: 800;
  letter-spacing: -.035em;
  text-decoration: none;
  white-space: nowrap;
}

.brand img { width: 48px; height: 48px; display: block; object-fit: contain; }

.feature-rail {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(160px, 214px));
  justify-content: end;
  gap: clamp(12px, 1.4vw, 20px);
  margin-left: auto;
}

.feature-card {
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding-inline: 20px;
  border: 1px solid rgba(231, 235, 238, .82);
  border-radius: 15px;
  background: rgba(255, 255, 255, .9);
  box-shadow: 0 10px 28px rgba(35, 53, 68, .055);
  color: #2d3742;
  font-size: 17px;
  font-weight: 700;
  white-space: nowrap;
  animation: feature-enter .52s cubic-bezier(.22, 1, .36, 1) both;
}

.feature-card:nth-child(1) { animation-delay: .04s; }
.feature-card:nth-child(2) { animation-delay: .11s; }
.feature-card:nth-child(3) { animation-delay: .18s; }

.feature-card--task :deep(.ico),
.feature-card--evidence :deep(.ico) { color: #4d91eb; }
.feature-card--hint :deep(.ico) { color: #39b695; }

.content-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(400px, .8fr) minmax(680px, 1.2fr);
  align-items: center;
  gap: clamp(18px, 2vw, 30px);
  padding: clamp(38px, 5vh, 58px) var(--rail) clamp(46px, 5.6vh, 66px);
}

.intro { position: relative; z-index: 2; max-width: 530px; }

.eyebrow {
  display: flex;
  align-items: center;
  gap: 13px;
  margin: 0 0 26px;
  color: #9a4800;
  font-size: 15px;
  font-weight: 760;
  letter-spacing: .02em;
}

.eyebrow::before { width: 3px; height: 20px; border-radius: 2px; background: #ff8318; content: ''; }

h1 {
  margin: 0;
  color: #17222d;
  font-size: clamp(46px, 3.8vw, 60px);
  font-weight: 830;
  line-height: 1.24;
  letter-spacing: -.055em;
}

.intro-copy {
  max-width: 520px;
  margin: 24px 0 34px;
  color: #4f5d69;
  font-size: clamp(15px, 1.2vw, 18px);
  line-height: 1.82;
}

.intro-actions { display: flex; flex-wrap: wrap; gap: 18px; }

.action {
  min-width: 178px;
  min-height: 58px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 0 24px;
  border-radius: 13px;
  font: inherit;
  font-size: 17px;
  font-weight: 760;
  cursor: pointer;
  transition: transform .2s ease, box-shadow .2s ease, background-color .2s ease;
}

.action:hover { transform: translateY(-2px); }
.action:active { transform: translateY(1px); }
.action:focus-visible { outline: 3px solid rgba(63, 122, 219, .32); outline-offset: 3px; }

.action--primary {
  border: 1px solid #ef7c14;
  background: linear-gradient(135deg, #ff9c2b, #ff8117);
  box-shadow: 0 12px 24px rgba(241, 112, 12, .22);
  color: #4b2600;
}

.action--secondary { border: 1.5px solid #2f70d8; background: #fff; color: #245fae; }

.learning-card {
  width: 100%;
  margin-top: 50px;
  overflow: hidden;
  border: 1px solid rgba(226, 231, 235, .82);
  border-radius: 16px;
  background: rgba(255, 255, 255, .82);
  box-shadow: 0 12px 30px rgba(31, 47, 60, .055);
}

.learning-path {
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  border-bottom: 1px solid #eaedef;
  color: #4b5965;
}

.path-step { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 680; white-space: nowrap; }
.path-step--analyze :deep(.ico) { color: #ff8318; }
.path-step--model :deep(.ico) { color: #4d91eb; }
.path-step--code :deep(.ico) { color: #34b997; }
.path-step--test :deep(.ico) { color: #9257cf; }
.path-step--reflect :deep(.ico) { color: #f4b629; }
.path-arrow { color: #9ba6b1; }

.trust-note {
  min-height: 58px;
  display: flex;
  align-items: center;
  gap: 13px;
  margin: 0;
  padding: 0 20px;
  color: #4d5a66;
  font-size: 14px;
}

.trust-note :deep(.ico) { color: #2eb58f; }

.visual-stage {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(326px, 340px);
  align-items: center;
  gap: 20px;
}

.hero-scene { position: relative; min-width: 0; width: 100%; min-height: 360px; display: grid; place-items: center; overflow: hidden; }

.hero-scene::before {
  position: absolute;
  width: min(118%, 620px);
  height: 82%;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 47%, rgba(255, 215, 165, .4), rgba(239, 245, 248, .44) 52%, transparent 74%);
  transform: translate3d(0, 0, 0) scale(.98);
  transform-origin: 50% 52%;
  will-change: transform, opacity;
  animation: hero-glow-pulse 4.8s ease-in-out 1.1s infinite alternate;
  content: '';
}

.hero-scene::after {
  position: absolute;
  z-index: 2;
  top: 8%;
  bottom: 8%;
  left: 9%;
  width: 24%;
  border-radius: 50%;
  background: linear-gradient(108deg, transparent 8%, rgba(255, 255, 255, .08) 32%, rgba(255, 255, 255, .52) 51%, rgba(255, 255, 255, .08) 70%, transparent 92%);
  opacity: 0;
  transform: translate3d(-130%, 0, 0) skewX(-7deg);
  will-change: transform, opacity;
  pointer-events: none;
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 16%, #000 82%, transparent);
  mask-image: linear-gradient(180deg, transparent, #000 16%, #000 82%, transparent);
  animation: hero-light-sweep 5.8s cubic-bezier(.22, 1, .36, 1) 1.25s infinite;
  content: '';
}

.hero-art-frame {
  --hero-scale: 1;
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 480px;
  height: auto;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  isolation: isolate;
  transform-origin: 50% 58%;
  animation: hero-enter .78s cubic-bezier(.22, 1, .36, 1) .12s both;
}

.hero-art-frame::after {
  content: none;
}

.hero-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
  display: block;
  object-fit: contain;
  filter: drop-shadow(0 24px 34px rgba(70, 53, 34, .16));
  transform: translate3d(0, 0, 0) scale(var(--hero-scale));
  transform-origin: 52% 54%;
}

.login-card {
  position: relative;
  z-index: 3;
  width: 100%;
  max-width: 340px;
  justify-self: end;
  margin-left: 0;
  padding: 30px;
  border: 1px solid rgba(224, 229, 233, .92);
  border-radius: 22px;
  background: rgba(255, 255, 255, .97);
  box-shadow: 0 24px 52px rgba(30, 45, 57, .15);
  animation: panel-enter .68s cubic-bezier(.22, 1, .36, 1) .26s both;
}

.learning-card { animation: surface-enter .64s cubic-bezier(.22, 1, .36, 1) .2s both; }

@keyframes hero-enter {
  0% { opacity: 0; transform: translate3d(0, 18px, 0) scale(.965); }
  72% { opacity: 1; transform: translate3d(0, -2px, 0) scale(1.006); }
  100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}

@keyframes hero-breathe {
  0%, 100% { transform: translate3d(0, 3px, 0) scale(var(--hero-scale)) rotate(-.08deg); }
  50% { transform: translate3d(0, -9px, 0) scale(calc(var(--hero-scale) + .018)) rotate(.18deg); }
}

@keyframes hero-glow-pulse {
  from { opacity: .74; transform: translate3d(0, 5px, 0) scale(.98); }
  to { opacity: 1; transform: translate3d(0, -4px, 0) scale(1.045); }
}

@keyframes hero-light-sweep {
  0%, 48% { opacity: 0; transform: translate3d(-130%, 0, 0) skewX(-7deg); }
  58% { opacity: .52; }
  78% { opacity: .18; transform: translate3d(310%, 0, 0) skewX(-7deg); }
  100% { opacity: 0; transform: translate3d(310%, 0, 0) skewX(-7deg); }
}

@keyframes feature-enter {
  0% { opacity: 0; transform: translate3d(0, -10px, 0) scale(.96); }
  100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}

@keyframes surface-enter {
  0% { opacity: 0; transform: translate3d(-12px, 12px, 0); }
  100% { opacity: 1; transform: translate3d(0, 0, 0); }
}

@keyframes panel-enter {
  0% { opacity: 0; transform: translate3d(18px, 12px, 0) scale(.97); }
  100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}

.card-heading { margin-bottom: 18px; }
.card-heading p { margin: 0; color: #26313a; font-size: 16px; font-weight: 760; }
.role-tabs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }

.role-tab {
  min-height: 46px;
  border: 1px solid #dfe5ea;
  border-radius: 11px;
  background: #fff;
  color: #5272a2;
  font: inherit;
  font-size: 15px;
  font-weight: 720;
  cursor: pointer;
  transition: border-color .18s ease, background-color .18s ease, box-shadow .18s ease;
}

.role-tab.active { border-color: #ff8318; background: #fff9f3; box-shadow: inset 0 0 0 1px rgba(255, 131, 24, .16); color: #9a4800; }

.role-tab:focus-visible,
.mode-switch button:focus-visible,
.eye:focus-visible { outline: 3px solid rgba(63, 122, 219, .28); outline-offset: 2px; }

.mode-switch { display: flex; gap: 22px; margin: 18px 0 2px; }

.mode-switch button {
  padding: 0 0 7px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #5f6b76;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.mode-switch button.active { border-bottom-color: #ff8318; color: #9b4700; font-weight: 760; }
.form { display: flex; flex-direction: column; gap: 9px; margin-top: 18px; }
.field-label { margin-top: 3px; color: #414d57; font-size: 13px; font-weight: 700; }

.field {
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border: 1px solid #dfe5ea;
  border-radius: 11px;
  background: #fcfdfd;
  color: #7f8b96;
  transition: border-color .18s ease, box-shadow .18s ease;
}

.field:focus-within { border-color: #5991df; box-shadow: 0 0 0 3px rgba(65, 127, 219, .13); }

.field input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #263440;
  font: inherit;
  font-size: 14px;
}

.field input::placeholder { color: #687582; }
.eye { display: grid; place-items: center; padding: 5px; border: 0; background: transparent; color: #71808d; cursor: pointer; }
.error { margin: 2px 0; color: #c93f37; font-size: 12px; }
.cloud-login-note { margin: 14px 0 0; color: #65727d; font-size: 12px; line-height: 1.6; }

:deep(.login-submit) {
  height: 56px;
  margin-top: 12px;
  border-radius: 12px;
  background: linear-gradient(135deg, #ff9d2c, #ff8016);
  box-shadow: 0 4px 0 #c85a00, 0 12px 22px rgba(236, 106, 8, .18);
  color: #4b2600;
  font-size: 16px;
  font-weight: 780;
}

:deep(.login-submit:hover:not(:disabled)) { background: #ffad47; }

.privacy-note {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 5px;
  margin: 18px 0 0;
  color: #65727d;
  font-size: 10px;
  line-height: 1.5;
  text-align: center;
}

.privacy-note :deep(.ico) { margin-top: 1px; color: #3f83dd; }

@media (max-width: 1320px) {
  .shell { --rail: 46px; }
  .feature-rail { grid-template-columns: repeat(3, minmax(142px, 1fr)); gap: 10px; }
  .feature-card { min-height: 58px; gap: 10px; padding-inline: 12px; font-size: 15px; }
  .content-grid { grid-template-columns: minmax(350px, .72fr) minmax(610px, 1.28fr); gap: 12px; }
  h1 { font-size: 48px; }
  .intro-copy { font-size: 15px; }
  .action { min-width: 154px; }
  .learning-path { gap: 5px; padding-inline: 14px; }
  .path-step { gap: 4px; font-size: 12px; }
  .visual-stage { grid-template-columns: minmax(0, 1fr) 326px; gap: 16px; }
  .login-card { padding: 26px; }
}

@media (max-height: 800px) and (min-width: 1121px) {
  .shell { grid-template-rows: 96px minmax(0, 1fr); }
  .brand img { width: 42px; height: 42px; }
  .feature-card { min-height: 54px; }
  .content-grid { padding-block: 24px 30px; }
  .eyebrow { margin-bottom: 16px; }
  .intro-copy { margin-block: 18px 24px; line-height: 1.65; }
  .action { min-height: 52px; }
  .learning-card { margin-top: 30px; }
  .learning-path { min-height: 56px; }
  .trust-note { min-height: 50px; }
  .hero-scene { min-height: 320px; }
  .login-card { padding: 24px; }
}

@media (max-width: 1120px) {
  .shell { --rail: 40px; }
  .topbar { gap: 24px; }
  .feature-rail { grid-template-columns: repeat(3, minmax(124px, 1fr)); }
  .feature-card { font-size: 14px; }
  .content-grid { grid-template-columns: 1fr; align-items: start; gap: 30px; padding-block: 46px 54px; }
  .intro { max-width: 820px; }
  .intro-copy { max-width: 720px; }
  .learning-card { max-width: 620px; margin-top: 36px; }
  .visual-stage { grid-template-columns: minmax(0, 1fr) 350px; width: 100%; max-width: 850px; justify-self: center; }
  .hero-scene { min-height: 320px; }
  .login-card { max-width: 350px; }
}

@media (max-width: 840px) and (min-width: 761px) {
  .visual-stage { grid-template-columns: minmax(0, 1fr) minmax(300px, 326px); max-width: 100%; }
  .login-card { max-width: 326px; padding: 24px; }
}

@media (max-width: 760px) {
  .login-page { --outer: 0px; padding: 0; }
  .shell { --rail: 24px; min-height: 100dvh; grid-template-rows: 82px auto; border: 0; border-radius: 0; }
  .topbar { padding-inline: var(--rail); }
  .brand { font-size: 19px; }
  .brand img { width: 42px; height: 42px; }
  .feature-rail { display: none; }
  .content-grid { gap: 24px; padding-block: 38px 40px; }
  .eyebrow { margin-bottom: 18px; }
  h1 { font-size: clamp(39px, 11vw, 52px); line-height: 1.18; }
  .intro-copy { margin-block: 20px 26px; line-height: 1.72; }
  .intro-actions { gap: 12px; }
  .action { min-width: 0; flex: 1; min-height: 54px; padding-inline: 14px; }
  .learning-card { margin-top: 30px; }
  .learning-path { min-height: 72px; flex-wrap: wrap; gap: 6px; padding-block: 12px; }
  .path-arrow { width: 11px; }
  .visual-stage { grid-template-columns: 1fr; gap: 16px; width: 100%; }
  .hero-scene { min-height: 0; }
  .hero-art-frame { max-width: 360px; }
  .login-card { width: min(100%, 430px); max-width: none; justify-self: center; margin: 0; padding: 26px; }
}

@media (max-width: 430px) {
  .shell { --rail: 16px; grid-template-rows: 76px auto; }
  .brand { gap: 9px; font-size: 17px; }
  .brand img { width: 38px; height: 38px; }
  .content-grid { gap: 18px; padding-block: 30px 32px; }
  .eyebrow { font-size: 13px; }
  h1 { font-size: clamp(35px, 10.5vw, 44px); }
  .intro-copy { font-size: 14px; }
  .action { gap: 8px; font-size: 15px; }
  .learning-card { margin-top: 26px; }
  .learning-path { padding-inline: 12px; }
  .path-step { font-size: 11px; }
  .trust-note { padding-inline: 14px; font-size: 13px; }
  .hero-art-frame { max-width: 300px; }
  .login-card { padding: 22px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
  .hero-art-frame,
  .hero-art,
  .feature-card,
  .learning-card,
  .login-card,
  .hero-scene::before,
  .hero-scene::after { animation: none !important; }
  .hero-art { transform: scale(var(--hero-scale)); will-change: auto; }
  .hero-scene::before { opacity: .9; transform: none; will-change: auto; }
  .hero-scene::after { display: none; will-change: auto; }
}
</style>
