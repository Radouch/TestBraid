<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink, RouterView } from 'vue-router'

const { locale, t } = useI18n()

function selectLocale(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'en' || value === 'cs') {
    locale.value = value
    document.documentElement.lang = value
  }
}
</script>

<template>
  <div class="container py-4">
    <header class="d-flex justify-content-between align-items-center flex-wrap gap-3 border-bottom pb-3 mb-4">
      <RouterLink to="/" class="fs-4 text-decoration-none text-body fw-semibold">{{ t('title') }}</RouterLink>
      <div class="d-flex align-items-center gap-3">
        <nav class="d-flex gap-3" aria-label="Main navigation">
          <RouterLink to="/">{{ t('home') }}</RouterLink>
          <RouterLink to="/admin">{{ t('author') }}</RouterLink>
        </nav>
        <select
          class="form-select form-select-sm"
          style="width: auto"
          :value="locale"
          :aria-label="t('languageControl')"
          @change="selectLocale"
        >
          <option value="en">English</option>
          <option value="cs">Čeština</option>
        </select>
      </div>
    </header>
    <main>
      <RouterView />
    </main>
  </div>
</template>
