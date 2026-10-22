<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

withDefaults(defineProps<{ label: string; align?: 'start' | 'end' }>(), { align: 'end' })
const root = ref<HTMLDetailsElement | null>(null)
const open = ref(false)

function close(restoreFocus = false): void {
  if (!root.value?.open) return
  root.value.open = false
  open.value = false
  if (restoreFocus) root.value.querySelector('summary')?.focus()
}
function outside(event: MouseEvent): void {
  if (event.target instanceof Node && !root.value?.contains(event.target)) close()
}
function escape(event: KeyboardEvent): void {
  if (event.key === 'Escape' && root.value?.open) {
    event.preventDefault()
    close(true)
  }
}
function select(event: MouseEvent): void {
  // Native buttons retain normal Tab navigation; this is a disclosure, not
  // an ARIA menu that would require a separate arrow-key navigation model.
  const button = (event.target as Element).closest('button')
  if (button && !button.disabled) close(true)
}
onMounted(() => document.addEventListener('click', outside))
onUnmounted(() => document.removeEventListener('click', outside))
</script>

<template>
  <details ref="root" class="editor-menu" @toggle="open = !!root?.open" @keydown="escape">
    <summary class="btn btn-sm editor-menu-trigger" :aria-label="label" :title="label" :aria-expanded="open">
      <slot name="trigger">⋯</slot>
    </summary>
    <div v-if="open" class="editor-menu-panel border rounded shadow-sm bg-body p-1"
      :class="{ 'editor-menu-start': align === 'start' }" role="group" :aria-label="label" @click="select">
      <slot />
    </div>
  </details>
</template>

<style scoped>
.editor-menu { position: relative; flex-shrink: 0; }
.editor-menu-trigger { list-style: none; color: var(--bs-secondary-color); min-width: 2rem; }
.editor-menu-trigger::-webkit-details-marker { display: none; }
.editor-menu-trigger:hover, .editor-menu[open] > summary { background: var(--bs-tertiary-bg); color: var(--bs-primary); }
.editor-menu-panel { position: absolute; right: 0; top: calc(100% + .25rem); min-width: 11rem; z-index: 20; }
.editor-menu-start { right: auto; left: 0; }
.editor-menu-panel :slotted(button) { display: block; width: 100%; text-align: left; white-space: nowrap; }
</style>
