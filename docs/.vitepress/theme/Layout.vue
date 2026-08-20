<script setup lang="ts">
import { watch, onMounted, nextTick } from 'vue'
import { useRoute } from 'vitepress'
import DefaultTheme from 'vitepress/theme'

const { Layout } = DefaultTheme
const route = useRoute()

let observer: MutationObserver | null = null
let sidebarClicked = false

function scrollToActive() {
  const sidebar = document.querySelector('aside.VPSidebar')
  if (!sidebar) return
  const active = sidebar.querySelector('.is-active')
  if (!active) return
  active.scrollIntoView({ block: 'center', behavior: 'instant' })
}

function ensureVisible() {
  nextTick(scrollToActive)

  const sidebar = document.querySelector('aside.VPSidebar')
  if (!sidebar) return

  if (observer) observer.disconnect()
  observer = new MutationObserver(scrollToActive)
  observer.observe(sidebar, { subtree: true, attributes: true, attributeFilter: ['class'] })

  setTimeout(() => {
    observer?.disconnect()
    observer = null
  }, 2000)
}

// 全局捕获点击事件：记录是否来自侧边栏
function onGlobalClick(e: MouseEvent) {
  sidebarClicked = !!(e.target as HTMLElement).closest('aside.VPSidebar')
}

onMounted(() => {
  ensureVisible()
  document.addEventListener('click', onGlobalClick, true)
})

watch(() => route.path, () => {
  if (!sidebarClicked) ensureVisible()
  sidebarClicked = false
})
</script>

<template>
  <Layout />
</template>