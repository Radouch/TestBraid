<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{ label: string; align?: 'start' | 'end' }>(), { align: 'end' })
const root = ref<HTMLDetailsElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const open = ref(false)
const placement = ref<Record<string, string>>({ visibility: 'hidden' })

function place(): void {
  if (!root.value?.open || !panel.value) return
  const anchor = root.value.querySelector('summary')!.getBoundingClientRect()
  const origin = root.value.getBoundingClientRect()
  const gutter = 8
  const gap = 4
  const width = panel.value.getBoundingClientRect().width
  const height = panel.value.scrollHeight + 2
  const below = window.innerHeight - gutter - anchor.bottom - gap
  const above = anchor.top - gutter - gap
  const upwards = height > below && above > below
  const maxHeight = Math.max(0, Math.min(window.innerHeight - 2 * gutter, upwards ? above : below))
  const left = props.align === 'start' ? anchor.left : anchor.right - width
  placement.value = {
    left: Math.max(gutter, Math.min(left, window.innerWidth - gutter - width)) - origin.left + 'px',
    top: Math.max(gutter, upwards ? anchor.top - gap - Math.min(height, maxHeight) : anchor.bottom + gap) - origin.top + 'px',
    maxHeight: maxHeight + 'px',
  }
}

function stopTracking(): void {
  window.removeEventListener('resize', place)
  document.removeEventListener('scroll', place, true)
}
watch(open, async value => {
  stopTracking()
  if (!value) { placement.value = { visibility: 'hidden' }; return }
  await nextTick()
  // Clamp in viewport coordinates, then place relative to the disclosure. The
  // panel stays inside its disabled fieldset and native keyboard event path.
  // Track only an open disclosure, including scrolling within the page.
  if (!root.value?.open) return
  place()
  window.addEventListener('resize', place)
  document.addEventListener('scroll', place, true)
})

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
  // A selected action may already have opened a native modal. Keep focus in
  // that dialog; its owner restores a persistent trigger when it closes.
  if (button && !button.disabled) close(!document.querySelector('dialog[open]'))
}
onMounted(() => document.addEventListener('click', outside))
onUnmounted(() => { document.removeEventListener('click', outside); stopTracking() })
</script>

<template>
  <details ref="root" class="editor-menu" @toggle="open = !!root?.open" @keydown="escape">
    <summary class="btn btn-sm editor-menu-trigger" :class="{ 'icon-button': !$slots.trigger }" :aria-label="label" :title="label" :aria-expanded="open">
      <slot name="trigger"><AppIcon name="three-dots" /></slot>
    </summary>
    <div v-if="open" ref="panel" class="editor-menu-panel border rounded shadow-sm bg-body p-1"
      :style="placement" role="group" :aria-label="label" @click="select">
      <slot />
    </div>
  </details>
</template>

<style scoped>
.editor-menu { position: relative; flex-shrink: 0; }
.editor-menu[open] { z-index: 40; }
.editor-menu-trigger { display: inline-flex; align-items: center; min-height: 2.75rem; list-style: none; color: var(--bs-secondary-color); }
.editor-menu-trigger.icon-button { min-width: 2.75rem; min-height: 2.75rem; }
.editor-menu-trigger::-webkit-details-marker { display: none; }
.editor-menu-trigger:hover, .editor-menu[open] > summary { background: var(--bs-tertiary-bg); color: var(--bs-primary); }
.editor-menu-panel { position: absolute; width: max-content; min-width: min(13rem, calc(100vw - 1rem)); max-width: min(24rem, calc(100vw - 1rem)); overflow-y: auto; z-index: 40; }
.editor-menu-panel :slotted(button) { display: block; width: 100%; min-height: 2.75rem; text-align: start; white-space: normal; }
</style>
