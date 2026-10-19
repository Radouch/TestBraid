<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
</script>

<template>
  <h1 class="h2">{{ t('learnerPlaceholder') }}</h1>
  <p class="text-secondary">{{ t('learnerTest', { id: String(route.params.id) }) }}</p>
</template>
