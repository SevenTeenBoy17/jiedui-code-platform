import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ShowcaseApp from './ShowcaseApp.vue'
import { installShowcaseTransport } from './transport'
import { capability } from '@/composables/useDeviceCapability'
import '@/styles/global.css'

installShowcaseTransport()
document.documentElement.dataset.cap = capability.tier
if (capability.reducedMotion) document.documentElement.dataset.reducedMotion = 'true'
const router = (await import('@/router')).default
router.beforeEach(to => {
  if (to.path.startsWith('/student') && to.query.demo !== '1') return { path: to.path, query: { ...to.query, demo: '1' }, hash: to.hash }
})
createApp(ShowcaseApp).use(createPinia()).use(router).mount('#app')
