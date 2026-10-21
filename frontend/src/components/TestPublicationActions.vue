<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { publicationProblems } from '../editor/model'
import type { Question } from '../editor/model'

interface PublishableTest {
  id: string
  title: string
  status: 'draft' | 'published'
  questions: Question[]
}
interface ErrorResponse {
  error?: { code?: string }
}

const props = defineProps<{ test: PublishableTest; csrfToken: string }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const router = useRouter()
const busy = ref(false)
const error = ref('')
const notice = ref('')
const showLinkFallback = ref(false)
const linkInput = ref<HTMLInputElement | null>(null)

const problems = computed(() => publicationProblems(props.test.questions))
const publicUrl = computed(() => new URL(
  router.resolve({ name: 'test', params: { id: props.test.id } }).href,
  window.location.href,
).href)

/**
 * CSRF-protected transition. The server validates all references and only
 * creates public media as part of a successfully published test. Never
 * attempt to publish by changing a document's status client-side.
 */
async function transition(action: 'publish' | 'unpublish'): Promise<void> {
  if (busy.value) return
  const confirmation = action === 'publish'
    ? t('publicationConfirmPublish', { title: props.test.title })
    : t('publicationConfirmUnpublish', { title: props.test.title })
  if (!window.confirm(confirmation)) return

  busy.value = true
  error.value = ''
  notice.value = ''
  showLinkFallback.value = false
  try {
    const response = await fetch(
      import.meta.env.BASE_URL + 'api/admin/tests/' + encodeURIComponent(props.test.id) + '/' + action,
      {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'X-CSRF-Token': props.csrfToken },
      },
    )
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as ErrorResponse
      const code = result.error?.code ?? 'HTTP_' + response.status
      if (action === 'publish' && ['NOT_PUBLISHABLE', 'VALIDATION_FAILED', 'MEDIA_MISSING'].includes(code)) {
        throw new Error(t('publicationNotReady'))
      }
      if (code === 'ALREADY_PUBLISHED' || code === 'NOT_PUBLISHED') {
        throw new Error(t('publicationStale'))
      }
      throw new Error(t('publicationOperationFailed') + ': ' + code)
    }
    const updated = await response.json() as { status?: string }
    const expected = action === 'publish' ? 'published' : 'draft'
    if (updated.status !== expected) throw new Error(t('publicationUnexpectedResponse'))
    notice.value = t(action === 'publish' ? 'publicationPublished' : 'publicationUnpublished')
    emit('changed')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('publicationOperationFailed')
  } finally {
    busy.value = false
  }
}

async function copyLink(): Promise<void> {
  if (busy.value || props.test.status !== 'published') return
  error.value = ''
  notice.value = ''
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable')
    await navigator.clipboard.writeText(publicUrl.value)
    notice.value = t('publicationCopied')
    showLinkFallback.value = false
  } catch {
    // A browser may deny Clipboard API access. Show a selectable, read-only
    // URL rather than claiming that copying succeeded.
    showLinkFallback.value = true
    notice.value = t('publicationCopyManually')
    await nextTick()
    linkInput.value?.focus()
    linkInput.value?.select()
  }
}
</script>

<template>
  <div class="d-grid gap-2">
    <div class="d-flex flex-wrap gap-1">
      <button v-if="test.status === 'draft'" type="button" class="btn btn-outline-success btn-sm"
        :disabled="busy" @click="transition('publish')">
        {{ t('publicationPublish') }}
      </button>
      <template v-else>
        <RouterLink class="btn btn-outline-primary btn-sm"
          :to="{ name: 'test', params: { id: test.id } }" target="_blank" rel="noopener">
          {{ t('publicationOpenPublic') }}
        </RouterLink>
        <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="busy"
          @click="copyLink">{{ t('publicationCopyLink') }}</button>
        <button type="button" class="btn btn-outline-warning btn-sm" :disabled="busy"
          @click="transition('unpublish')">{{ t('publicationUnpublish') }}</button>
      </template>
    </div>
    <p v-if="test.status === 'draft' && problems.length > 0" class="small text-secondary mb-0">
      {{ t('publicationReadinessHint') }}
    </p>
    <p v-if="error" class="small text-danger mb-0" role="alert">{{ error }}</p>
    <p v-if="notice" class="small text-success mb-0" role="status">{{ notice }}</p>
    <div v-if="showLinkFallback && test.status === 'published'">
      <label :for="'publication-link-' + test.id" class="small form-label">{{ t('publicationLink') }}</label>
      <input :id="'publication-link-' + test.id" ref="linkInput" class="form-control form-control-sm"
        :value="publicUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
    </div>
  </div>
</template>
