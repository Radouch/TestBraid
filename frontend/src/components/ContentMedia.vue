<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ kind: 'image' | 'video' | 'audio'; src: string; label?: string }>()
const media = ref<HTMLImageElement | HTMLVideoElement | null>(null)
const portrait = ref(false)

function measure(): void {
  if (props.kind === 'audio') return
  const element = media.value
  if (!element) return
  const width = props.kind === 'image'
    ? (element as HTMLImageElement).naturalWidth : (element as HTMLVideoElement).videoWidth
  const height = props.kind === 'image'
    ? (element as HTMLImageElement).naturalHeight : (element as HTMLVideoElement).videoHeight
  portrait.value = width > 0 && height > width
}
// Orientation belongs to the loaded source, not the authored block ID. Reset
// when reusing a block for another asset; cached images are measured on mount.
watch(() => [props.kind, props.src], () => { portrait.value = false })
onMounted(measure)
</script>

<template>
  <img v-if="kind === 'image'" ref="media" :src="src" :alt="label ?? ''" class="content-media"
    :class="{ 'media-portrait': portrait }" @load="measure" @error="portrait = false" />
  <video v-else-if="kind === 'video'" ref="media" :src="src" :aria-label="label" controls preload="metadata" class="content-media"
    :class="{ 'media-portrait': portrait }" @loadedmetadata="measure" @resize="measure" @error="portrait = false" />
  <div v-else class="audio-media">
    <AppIcon name="volume-up" />
    <audio :src="src" :aria-label="label" controls preload="metadata" />
  </div>
</template>

<style scoped>
.content-media {
  display: block;
  justify-self: center;
  /* Let both dimensions shrink together. A forced 100% video width would
     leave a narrow portrait frame inside a wide, height-limited player. */
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: min(var(--content-media-landscape-height, 360px), max(8rem, calc(100svh - 10rem)));
  object-fit: contain;
}
.audio-media { display: flex; align-items: center; gap: .5rem; width: 100%; max-width: 28rem; min-width: 0; }
.audio-media audio { display: block; width: 100%; min-width: 0; }
.audio-media :deep(.bi) { flex-shrink: 0; }
.media-portrait {
  max-height: min(var(--content-media-portrait-height, 560px), max(8rem, calc(100svh - 10rem)));
}
</style>
