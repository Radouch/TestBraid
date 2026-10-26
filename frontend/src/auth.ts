import { appBaseUrl } from './deployment-base'
import { ref } from 'vue'

export interface AuthorSession {
  authenticated: boolean
  csrfToken: string
  setupState?: 'ready' | 'needs-key' | 'complete'
  user?: { id: string; username: string }
}

export const authorSession = ref<AuthorSession | null>(null)
export const sessionChecked = ref(false)

export async function refreshAuthorSession(): Promise<void> {
  try {
    const response = await fetch(appBaseUrl() + 'api/auth/session', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('Session request failed')
    authorSession.value = await response.json() as AuthorSession
  } catch {
    authorSession.value = null
  } finally {
    sessionChecked.value = true
  }
}
