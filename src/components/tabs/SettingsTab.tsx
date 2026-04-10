import { useState, useCallback } from 'preact/hooks'
import { providerConfigs, showToast } from '../../store'
import { getProvider } from '../../providers/registry'

export function SettingsTab() {
  const configs = providerConfigs.value
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; error?: string }>>({})

  const updateConfig = (providerId: string, field: string, value: string) => {
    providerConfigs.value = {
      ...providerConfigs.value,
      [providerId]: {
        ...providerConfigs.value[providerId],
        [field]: value,
      },
    }
  }

  const testConnection = useCallback(async (providerId: string) => {
    const provider = getProvider(providerId)
    if (!provider) return

    setTestingProvider(providerId)
    try {
      const result = await provider.testConnection()
      setTestResults((prev) => ({ ...prev, [providerId]: result }))
      if (result.ok) {
        showToast(`${provider.name} connected!`, 'success')
      } else {
        showToast(result.error || 'Connection failed', 'error')
      }
    } catch (e: any) {
      setTestResults((prev) => ({ ...prev, [providerId]: { ok: false, error: e.message } }))
      showToast(e.message, 'error')
    } finally {
      setTestingProvider(null)
    }
  }, [])

  return (
    <>
      {/* Ollama Settings */}
      <div class="section">
        <div class="section-label">Ollama (Local)</div>

        <div class="field-row">
          <div class="field-label">Base URL</div>
          <input
            type="text"
            value={configs.ollama?.baseUrl || 'http://localhost:11434'}
            onInput={(e) => updateConfig('ollama', 'baseUrl', (e.target as HTMLInputElement).value)}
            placeholder="http://localhost:11434"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
          <button
            class="btn btn-ghost btn-sm"
            onClick={() => testConnection('ollama')}
            disabled={testingProvider === 'ollama'}
          >
            {testingProvider === 'ollama' ? <span class="spinner" /> : 'Test Connection'}
          </button>
          {testResults.ollama && (
            <div class="connection-status">
              <span class={`status-dot ${testResults.ollama.ok ? 'ok' : 'error'}`} />
              <span>{testResults.ollama.ok ? 'Connected' : testResults.ollama.error}</span>
            </div>
          )}
        </div>
      </div>

      {/* Anthropic Settings */}
      <div class="section">
        <div class="section-label">Claude (Anthropic)</div>

        <div class="field-row">
          <div class="field-label">API Key</div>
          <input
            type="password"
            value={configs.anthropic?.apiKey || ''}
            onInput={(e) => updateConfig('anthropic', 'apiKey', (e.target as HTMLInputElement).value)}
            placeholder="sk-ant-..."
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
          <button
            class="btn btn-ghost btn-sm"
            onClick={() => testConnection('anthropic')}
            disabled={testingProvider === 'anthropic' || !configs.anthropic?.apiKey}
          >
            {testingProvider === 'anthropic' ? <span class="spinner" /> : 'Test Connection'}
          </button>
          {testResults.anthropic && (
            <div class="connection-status">
              <span class={`status-dot ${testResults.anthropic.ok ? 'ok' : 'error'}`} />
              <span>{testResults.anthropic.ok ? 'Connected' : testResults.anthropic.error}</span>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div class="section">
        <div class="section-label">Security</div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", lineHeight: '1.6' }}>
          API keys are stored in your browser's localStorage and never leave your machine except to authenticate with the chosen provider.
        </div>
      </div>
    </>
  )
}
