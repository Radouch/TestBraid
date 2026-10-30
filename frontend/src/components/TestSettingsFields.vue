<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorLesson, TestSettings } from '../editor/test-settings'
import { languageOptions } from '../i18n'

const props = defineProps<{ settings: TestSettings; lessons: EditorLesson[]; lessonsUnavailable?: boolean }>()
const { t } = useI18n()
// The home page lists a test only under the interface language with the same
// code, so the content language is chosen from the site's languages. A stored
// value outside them (an older free-text entry, or a language later removed
// from uiLanguages) stays selectable and is never changed silently.
const unofferedLanguage = computed(() => props.settings.language
  && !languageOptions.value.some(option => option.code === props.settings.language)
  ? props.settings.language : '')
</script>

<template>
  <div class="test-settings-fields d-grid gap-3">
    <section class="card" aria-labelledby="test-settings-basics">
      <div class="card-header"><h2 id="test-settings-basics" class="h6 mb-0">{{ t('editorBasicSettings') }}</h2></div>
      <div class="card-body d-grid gap-3">
        <div>
          <label for="test-settings-title" class="form-label">{{ t('catalogTitle') }}</label>
          <input id="test-settings-title" v-model="settings.title" class="form-control" maxlength="250" required
            @input="($event.target as HTMLInputElement).setCustomValidity('')" />
        </div>
        <div class="row g-3">
          <div class="col-md-8">
            <label for="test-settings-lesson" class="form-label">{{ t('adminLessons') }}</label>
            <select id="test-settings-lesson" v-model="settings.groupId" class="form-select" required :disabled="lessonsUnavailable">
              <option v-if="!lessons.some(lesson => lesson.id === settings.groupId)" :value="settings.groupId">
                {{ t('editorCurrentLesson') }}
              </option>
              <option v-for="lesson in lessons" :key="lesson.id" :value="lesson.id">{{ lesson.name }}</option>
            </select>
          </div>
          <div class="col-md-4">
            <label for="test-settings-language" class="form-label">{{ t('catalogContentLanguage') }}</label>
            <select id="test-settings-language" v-model="settings.language" class="form-select" required
              :aria-describedby="unofferedLanguage ? 'test-settings-language-help' : undefined">
              <option v-if="unofferedLanguage" :value="unofferedLanguage">
                {{ t('catalogLanguageNotOffered', { code: unofferedLanguage }) }}
              </option>
              <option v-for="option in languageOptions" :key="option.code" :value="option.code" :lang="option.code">
                {{ option.label }}
              </option>
            </select>
            <p v-if="unofferedLanguage" id="test-settings-language-help" class="form-text text-warning-emphasis mb-0">
              {{ t('catalogLanguageNotOfferedHelp') }}
            </p>
          </div>
        </div>
        <div>
          <label for="test-settings-description" class="form-label">{{ t('catalogDescription') }}</label>
          <textarea id="test-settings-description" v-model="settings.description" class="form-control" rows="3" maxlength="50000" />
        </div>
      </div>
    </section>
    <section class="card" aria-labelledby="test-settings-grading">
      <div class="card-header"><h2 id="test-settings-grading" class="h6 mb-0">{{ t('editorGradingSettings') }}</h2></div>
      <div class="card-body">
        <div class="form-check">
          <input id="test-settings-score" v-model="settings.showOverallScore" class="form-check-input" type="checkbox" />
          <label for="test-settings-score" class="form-check-label">{{ t('catalogShowOverallScore') }}</label>
          <p class="form-text mb-0">{{ t('catalogShowOverallScoreHelp') }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.test-settings-fields { max-width: 48rem; }
</style>
