<script setup lang="ts">
import { appBaseUrl } from '../deployment-base'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

type Placement = 'within-public-app' | 'within-inferred-site-root' | 'outside-inferred-site-root' | 'unverified'
type Severity = 'success' | 'warning' | 'danger' | 'info' | 'secondary'
type ProbeResult = 'exposed' | 'blocked' | 'unverified' | 'invalid'
interface Inspection {
  backendPlacement: Placement
  storagePlacement: Placement
  denyFilePresent: boolean
  denyDirectivePresent: boolean
  probeFilePresent: boolean
  probeUrlPath?: string | null
}
const { t } = useI18n()
const inspection = ref<Inspection | null>(null)
const checking = ref(false)
const error = ref(false)
const probePath = ref('')
const probeResult = ref<ProbeResult | null>(null)
const probing = ref(false)
const hasDenyRule = computed(() => Boolean(inspection.value?.denyFilePresent && inspection.value?.denyDirectivePresent))
const bothOutside = computed(() => inspection.value?.backendPlacement === 'outside-inferred-site-root'
  && inspection.value.storagePlacement === 'outside-inferred-site-root')
const exposureRisk = computed(() => [inspection.value?.backendPlacement, inspection.value?.storagePlacement]
  .includes('within-public-app'))
const overallSeverity = computed<Severity>(() => {
  if (probeResult.value === 'exposed' || exposureRisk.value) return 'danger'
  return bothOutside.value ? 'success' : 'warning'
})
const overallKey = computed(() => {
  if (probeResult.value === 'exposed') return 'securityOverviewExposed'
  if (exposureRisk.value) return 'securityOverviewDanger'
  return bothOutside.value ? 'securityOverviewGood' : 'securityOverviewWarning'
})
const apacheSeverity = computed<Severity>(() => {
  if (hasDenyRule.value) return 'info'
  if (bothOutside.value) return 'secondary'
  return 'warning'
})
const probeFileSeverity = computed<Severity>(() => inspection.value?.probeFilePresent ? 'info' : 'secondary')
function placementSeverity(value: Placement): Severity {
  if (value === 'outside-inferred-site-root') return 'success'
  if (value === 'within-public-app') return 'danger'
  return 'warning'
}
function statusLabel(severity: Severity): string {
  return t('securityStatus_' + severity)
}

async function inspect(): Promise<void> {
  checking.value = true
  error.value = false
  inspection.value = null
  probeResult.value = null
  probePath.value = ''
  try {
    const response = await fetch(appBaseUrl() + 'api/admin/installation/security', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('Request failed')
    inspection.value = await response.json() as Inspection
    // Pre-fill only a URL derived from a *known* physical web-root mapping.
    // When the backend is outside the web root, no public URL can be inferred.
    if (inspection.value.probeUrlPath) probePath.value = inspection.value.probeUrlPath
  } catch {
    error.value = true
  } finally {
    checking.value = false
  }
}

// The browser performs the request. Accept only same-origin root-relative
// paths ending in the harmless probe file, never URLs on remote hosts.
async function checkProbe(): Promise<void> {
  const path = probePath.value.trim()
  probeResult.value = null
  if (!path) return
  if (!/^\/[A-Za-z0-9._~%-]+(?:\/[A-Za-z0-9._~%-]+)*$/.test(path)
    || path.startsWith('//') || path.split('/').some(part => part === '..' || part === '.')
    || /%(?:2e|2f|5c)/i.test(path) || !path.endsWith('/security-probe.txt')) {
    probeResult.value = 'invalid'
    return
  }
  probing.value = true
  try {
    const response = await fetch(path, { credentials: 'omit', cache: 'no-store', redirect: 'error' })
    if (response.status === 403 || response.status === 404) {
      probeResult.value = 'blocked'
    } else if (!response.ok || Number(response.headers.get('Content-Length') ?? 0) > 128) {
      probeResult.value = 'unverified'
    } else {
      const reader = response.body?.getReader()
      if (!reader) {
        probeResult.value = 'unverified'
      } else {
        const parts: Uint8Array[] = []
        let totalBytes = 0
        let finished = false
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) { finished = true; break }
          if (chunk.value) {
            totalBytes += chunk.value.byteLength
            if (totalBytes > 128) break
            parts.push(chunk.value)
          }
        }
        await reader.cancel()
        if (!finished || totalBytes > 128) {
          probeResult.value = 'unverified'
        } else {
          const content = new Uint8Array(totalBytes)
          let offset = 0
          for (const part of parts) {
            content.set(part, offset)
            offset += part.byteLength
          }
          probeResult.value = new TextDecoder().decode(content).trim() === 'TESTBRAID_PRIVATE_BACKEND_PROBE_V1'
            ? 'exposed' : 'unverified'
        }
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
        <div class="alert" :class="'alert-' + overallSeverity" role="status">
          <strong>{{ t(overallKey) }}</strong>
          <p class="mb-0 small">{{ t('securityOverviewNote') }}</p>
        </div>
        <dl class="mb-0">
          <div class="d-flex flex-wrap align-items-baseline gap-2 py-2 border-bottom">
            <dt class="me-auto">{{ t('securityBackendPlacement') }}</dt>
            <dd class="mb-0 d-flex align-items-baseline flex-wrap gap-2">
              <span class="badge" :class="'text-bg-' + placementSeverity(inspection.backendPlacement)">
                {{ statusLabel(placementSeverity(inspection.backendPlacement)) }}
              </span>
              <span>{{ t('securityPlacement_' + inspection.backendPlacement) }}</span>
            </dd>
          </div>
          <div class="d-flex flex-wrap align-items-baseline gap-2 py-2 border-bottom">
            <dt class="me-auto">{{ t('securityStoragePlacement') }}</dt>
            <dd class="mb-0 d-flex align-items-baseline flex-wrap gap-2">
              <span class="badge" :class="'text-bg-' + placementSeverity(inspection.storagePlacement)">
                {{ statusLabel(placementSeverity(inspection.storagePlacement)) }}
              </span>
              <span>{{ t('securityPlacement_' + inspection.storagePlacement) }}</span>
            </dd>
          </div>
          <div class="d-flex flex-wrap align-items-baseline gap-2 py-2 border-bottom">
            <dt class="me-auto">{{ t('securityApacheRule') }}</dt>
            <dd class="mb-0 d-flex align-items-baseline flex-wrap gap-2">
              <span class="badge" :class="'text-bg-' + apacheSeverity">{{ statusLabel(apacheSeverity) }}</span>
              <span>{{ t(hasDenyRule ? 'securityApacheRulePresent' : 'securityApacheRuleMissing') }}</span>
            </dd>
          </div>
          <div class="d-flex flex-wrap align-items-baseline gap-2 py-2">
            <dt class="me-auto">{{ t('securityProbeFile') }}</dt>
            <dd class="mb-0 d-flex align-items-baseline flex-wrap gap-2">
              <span class="badge" :class="'text-bg-' + probeFileSeverity">{{ statusLabel(probeFileSeverity) }}</span>
              <span>{{ t(inspection.probeFilePresent ? 'securityProbeReady' : 'securityProbeMissing') }}</span>
            </dd>
          </div>
        </dl>
        <p class="small text-body-secondary mt-2">{{ t('securityInconclusive') }}</p>
        <details class="border-top pt-3 mt-3" data-testid="advanced-http-probe">
          <summary class="fw-semibold" style="cursor: pointer">{{ t('securityAdvancedHttpTitle') }}</summary>
          <div class="pt-3">
            <p>{{ t('securityAdvancedHttpIntro') }}</p>
            <p v-if="!inspection.probeUrlPath" class="text-body-secondary small">
              {{ t('securityNoSuggestedUrl') }}
            </p>
            <p v-else class="small">{{ t('securitySuggestedUrl') }}</p>
            <label class="form-label" for="security-probe-url">{{ t('securityProbeUrl') }}</label>
            <input id="security-probe-url" v-model="probePath" class="form-control" autocomplete="off"
              inputmode="url" aria-describedby="security-probe-help" />
            <p id="security-probe-help" class="form-text">{{ t('securityProbeExplanation') }}</p>
            <button type="button" class="btn btn-outline-secondary" :disabled="probing || !probePath.trim()"
              @click="checkProbe">
              {{ probing ? t('loading') : t('securityTestHttp') }}
            </button>
            <p v-if="probeResult" class="alert mt-3" role="status"
              :class="probeResult === 'exposed' ? 'alert-danger' : 'alert-warning'">
              {{ t('securityProbe_' + probeResult) }}
            </p>
          </div>
        </details>
      </div>
    </div>
  </section>
</template>
