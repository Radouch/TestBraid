<script setup lang="ts">
import { appBaseUrl } from '../deployment-base'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

type Placement = 'within-public-app' | 'within-inferred-site-root' | 'outside-inferred-site-root' | 'unverified'
interface Inspection {
  backendPlacement: Placement
  storagePlacement: Placement
  denyFilePresent: boolean
  denyDirectivePresent: boolean
  probeFilePresent: boolean
}
const { t } = useI18n()
const inspection = ref<Inspection | null>(null)
const checking = ref(false)
const error = ref(false)
const probePath = ref('')
const probeResult = ref<'exposed' | 'blocked' | 'unverified' | 'invalid' | null>(null)
const probing = ref(false)

async function inspect(): Promise<void> {
  checking.value = true
  error.value = false
  inspection.value = null
  probeResult.value = null
  try {
    const response = await fetch(appBaseUrl() + 'api/admin/installation/security', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('Request failed')
    inspection.value = await response.json() as Inspection
  } catch {
    error.value = true
  } finally {
    checking.value = false
  }
}

function placementText(value: Placement): string {
  return t('securityPlacement_' + value)
}

// The browser, not the PHP server, performs this request. The input can
// reference only a relative path on the current origin (no cross-host SSRF).
async function checkProbe(): Promise<void> {
  const path = probePath.value.trim()
  probeResult.value = null
  if (!/^\/[A-Za-z0-9._~/-]+$/.test(path) || path.startsWith('//')
    || path.split('/').some(part => part === '..' || part === '.')
    || !path.endsWith('/security-probe.txt')) {
    probeResult.value = 'invalid'
    return
  }
  probing.value = true
  try {
    const response = await fetch(path, {
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    })
    if (response.status === 403 || response.status === 404) {
      probeResult.value = 'blocked'
    } else if (!response.ok) {
      probeResult.value = 'unverified'
    } else if (Number(response.headers.get('Content-Length') ?? 0) > 128) {
      probeResult.value = 'unverified'
    } else {
      const reader = response.body?.getReader()
      if (!reader) {
        probeResult.value = 'unverified'
      } else {
        const chunk = await reader.read()
        await reader.cancel()
        const text = new TextDecoder().decode(chunk.value ?? new Uint8Array())
        probeResult.value = chunk.done || text.length < 128
          ? (text.trim() === 'TESTBRAID_PRIVATE_BACKEND_PROBE_V1' ? 'exposed' : 'unverified')
          : 'unverified'
      }
    }
  } catch {
    probeResult.value = 'unverified'
  } finally {
    probing.value = false
  }
}
</script>

<template>
  <section class="card mt-4" aria-labelledby="security-diagnostics-title">
    <div class="card-body">
      <h2 id="security-diagnostics-title" class="h5">{{ t('securityDiagnosticsTitle') }}</h2>
      <p class="text-body-secondary">{{ t('securityDiagnosticsIntro') }}</p>
      <button type="button" class="btn btn-outline-secondary" :disabled="checking" @click="inspect">
        {{ checking ? t('loading') : t('securityRunCheck') }}
      </button>
      <p v-if="error" class="alert alert-danger mt-3" role="alert">{{ t('securityCheckFailed') }}</p>
      <div v-if="inspection" class="mt-3">
        <dl>
          <dt>{{ t('securityBackendPlacement') }}</dt>
          <dd>{{ placementText(inspection.backendPlacement) }}</dd>
          <dt>{{ t('securityStoragePlacement') }}</dt>
          <dd>{{ placementText(inspection.storagePlacement) }}</dd>
          <dt>{{ t('securityApacheRule') }}</dt>
          <dd>{{ t(inspection.denyFilePresent && inspection.denyDirectivePresent
            ? 'securityApacheRulePresent' : 'securityApacheRuleMissing') }}</dd>
          <dt>{{ t('securityProbeFile') }}</dt>
          <dd>{{ t(inspection.probeFilePresent ? 'securityProbeReady' : 'securityProbeMissing') }}</dd>
        </dl>
        <p class="small text-body-secondary">{{ t('securityInconclusive') }}</p>
        <div class="border-top pt-3">
          <label class="form-label" for="security-probe-url">{{ t('securityProbeUrl') }}</label>
          <input id="security-probe-url" v-model="probePath" class="form-control"
            autocomplete="off" placeholder="/tichotesty-backend/security-probe.txt" />
          <p class="form-text">{{ t('securityProbeExplanation') }}</p>
          <button type="button" class="btn btn-outline-secondary" :disabled="probing" @click="checkProbe">
            {{ probing ? t('loading') : t('securityTestHttp') }}
          </button>
          <p v-if="probeResult" class="mt-3" role="status"
            :class="probeResult === 'exposed' ? 'alert alert-danger' : 'alert alert-secondary'">
            {{ t('securityProbe_' + probeResult) }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
