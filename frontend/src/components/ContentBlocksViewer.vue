<script setup lang="ts">
import { appBaseUrl } from '../deployment-base'
import ContentMedia from './ContentMedia.vue'
import type { ContentBlock } from '../editor/model'
import { uuidPattern } from '../editor/model'

defineProps<{ blocks: ContentBlock[]; mediaUrls?: Record<string, string>; privatePreview?: boolean }>()
function source(id: string, urls?: Record<string, string>, privatePreview = false): string {
  if (urls?.[id]) return urls[id]
  return privatePreview && uuidPattern.test(id)
    ? appBaseUrl() + 'api/admin/media/' + encodeURIComponent(id) + '/preview'
    : ''
}
</script>

<template>
  <div class="d-grid gap-2">
    <template v-for="block in blocks" :key="block.id">
      <p v-if="block.type === 'text'" class="mb-1" style="white-space: pre-wrap">{{ block.text }}</p>
      <ContentMedia v-else-if="source(block.mediaId, mediaUrls, privatePreview)" :kind="block.type"
        :src="source(block.mediaId, mediaUrls, privatePreview)" />
    </template>
  </div>
</template>
