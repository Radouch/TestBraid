<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const connected = ref(false)
const checked = ref(false)

onMounted(async () => {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' })
    if (!response.ok) throw new Error('Health endpoint unavailable')
    const data: unknown = await response.json()
    connected.value = typeof data === 'object' && data !== null
      && 'status' in data && data.status === 'ok'
  } catch {
    connected.value = false
  } finally {
    checked.value = true
  }
})
</script>

<template>
  <section class="col-lg-8">
    <h1 class="h2">{{ t('status') }}</h1>
    <p>{{ t('note') }}</p>
    <p>
      {{ t('api') }}:
      <span v-if="!checked" class="text-secondary">…</span>
      <span v-else :class="connected ? 'text-success' : 'text-danger'">
        {{ connected ? t('connected') : t('unavailable') }}
      </span>
    </p>
  </section>
</template>
