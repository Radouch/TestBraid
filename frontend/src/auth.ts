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

let pendingSession: Promise<void> | null = null

/**
 * Read the author session. Callers that ask while a read is in flight share
 * it: without a session cookie, each request would start its own server
 * session with its own CSRF token, the browser would keep only one of the
 * cookies, and a form could then post a token from another session (#106).
 */
export function refreshAuthorSession(): Promise<void> {
  pendingSession ??= readAuthorSession().finally(() => { pendingSession = null })
  return pendingSession
}

async function readAuthorSession(): Promise<void> {
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
