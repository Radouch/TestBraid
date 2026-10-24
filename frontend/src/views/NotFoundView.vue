<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <section class="py-5 text-center" aria-labelledby="not-found-heading">
    <p class="display-1 fw-bold text-secondary mb-2">404</p>
    <h1 id="not-found-heading" class="h2 mb-3">{{ t('notFoundTitle') }}</h1>
    <p class="text-secondary mb-4">{{ t('notFoundDescription') }}</p>
    <RouterLink to="/" class="btn btn-primary">{{ t('notFoundHome') }}</RouterLink>
  </section>
</template>
