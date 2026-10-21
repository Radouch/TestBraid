<script setup lang="ts">
import type { ContentBlock } from '../editor/model'
import { uuidPattern } from '../editor/model'

defineProps<{ blocks: ContentBlock[]; mediaUrls?: Record<string, string>; privatePreview?: boolean }>()
function source(id: string, urls?: Record<string, string>, privatePreview = false): string {
  if (urls?.[id]) return urls[id]
  return privatePreview && uuidPattern.test(id)
    ? import.meta.env.BASE_URL + 'api/admin/media/' + encodeURIComponent(id) + '/preview'
    : ''
}
</script>

<template>
  <div class="d-grid gap-2">
    <template v-for="block in blocks" :key="block.id">
      <p v-if="block.type === 'text'" class="mb-1" style="white-space: pre-wrap">{{ block.text }}</p>
      <img v-else-if="block.type === 'image' && source(block.mediaId, mediaUrls, privatePreview)"
        :src="source(block.mediaId, mediaUrls, privatePreview)"
        class="img-fluid" style="max-height: 360px; object-fit: contain" alt="" />
      <video v-else-if="block.type === 'video' && source(block.mediaId, mediaUrls, privatePreview)"
        :src="source(block.mediaId, mediaUrls, privatePreview)"
        controls preload="metadata" class="w-100" style="max-height: 360px" />
    </template>
  </div>
</template>
