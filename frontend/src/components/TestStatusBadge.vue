<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// One look for a test's publication status wherever it appears: the test
// list, the editor header and the publication settings.
defineProps<{ status: 'draft' | 'published' }>()
const { t } = useI18n()
</script>

<template>
  <span class="badge border test-status-badge"
    :class="status === 'published' ? 'text-success-emphasis bg-success-subtle' : 'text-body-secondary bg-body-tertiary'">
    {{ t(status === 'published' ? 'catalogPublished' : 'editorDraftStatus') }}
  </span>
</template>
