<script setup>
import { ref, onMounted, watch } from 'vue'

const props = defineProps({
  src: { type: String, required: true }
})

const svgContent = ref('')

async function loadSvg() {
  try {
    const base = import.meta.env.BASE_URL || '/'
    const url = props.src.startsWith('/') ? base + props.src.slice(1) : props.src
    const resp = await fetch(url)
    let text = await resp.text()
    // Remove XML declaration if present
    text = text.replace(/<\?xml[^?]*\?>\s*/g, '')
    svgContent.value = text
  } catch (e) {
    console.error('Failed to load SVG:', props.src, e)
  }
}

onMounted(loadSvg)
watch(() => props.src, loadSvg)
</script>

<template>
  <div class="svg-container" v-html="svgContent" />
</template>

<style scoped>
.svg-container {
  display: flex;
  justify-content: center;
  margin: 1.5em 0;
  overflow-x: auto;
}

.svg-container :deep(svg) {
  max-width: 100%;
  height: auto;
}
</style>
