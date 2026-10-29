import { appBaseUrl } from './deployment-base'
import { ref } from 'vue'
import { STATIC_DEMO } from './static-demo'

export interface AuthorSession {
  authenticated: boolean
  csrfToken: string
  setupState?: 'ready' | 'needs-key' | 'complete'
  user?: { id: string; username: string }
}

/**
 * Allowed author usernames. Must match the check in backend/public/index.php
 * (setup and login routes): the server rejects anything else, but with only a
 * generic error, so the setup form validates first to explain the rule.
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

export const authorSession = ref<AuthorSession | null>(null)
export const sessionChecked = ref(false)

export async function refreshAuthorSession(): Promise<void> {
  // The static demo has no server to sign in to; skip the doomed request.
  if (STATIC_DEMO) {
    authorSession.value = null
    sessionChecked.value = true
    return
  }
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
