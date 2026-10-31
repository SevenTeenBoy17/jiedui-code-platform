import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './styles/global.css'
import { capability } from './composables/useDeviceCapability'
import { isCloudDeployment } from './config/deployment'

// 低配降级：把设备档位写到根节点，供 CSS（[data-cap]）与组件分流
document.documentElement.dataset.cap = capability.tier
if (capability.reducedMotion) document.documentElement.dataset.reducedMotion = 'true'

createApp(App).use(createPinia()).use(router).mount('#app')

// PWA：仅生产注册 Service Worker（dev 不缓存，避免开发困扰）
if (import.meta.env.PROD && !isCloudDeployment && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
