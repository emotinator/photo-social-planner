import type { CallTimings, GenerationStats } from '../../types'

const fmt = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`)

/** Rows are aligned by a shared label column, so a run reads down as a column of times. */
const LABEL_WIDTH = '124px'

function Row({ label, children }: { label: string; children: any }) {
  return (
    <div style={{ display: 'flex', gap: '10px' }}>
      <span style={{ color: 'var(--text3)', minWidth: LABEL_WIDTH, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text2)' }}>{children}</span>
    </div>
  )
}

/**
 * What a call spent. Ollama reports load/prompt/generate separately, which is the
 * useful part — a cold load and a long prompt are different problems. Anthropic
 * reports only tokens, so those calls show the wall clock and the token counts.
 */
function CallDetail({ t }: { t: CallTimings }) {
  const parts: string[] = []
  if (t.loadMs !== undefined && t.loadMs >= 1) parts.push(`load ${fmt(t.loadMs)}`)
  if (t.promptMs !== undefined) parts.push(`prompt ${fmt(t.promptMs)}`)
  if (t.genMs !== undefined) parts.push(`gen ${fmt(t.genMs)}`)
  if (!parts.length) parts.push(fmt(t.wallMs))

  if (t.promptTokens !== undefined) parts.push(`${t.promptTokens} in`)
  if (t.genTokens !== undefined) {
    parts.push(`${t.genTokens} out`)
    if (t.genMs) parts.push(`${(t.genTokens / (t.genMs / 1000)).toFixed(1)} tok/s`)
  }

  // The row wraps in a narrow panel; break it between segments so a value never
  // ends up separated from its unit.
  return (
    <>
      {parts.map((part, i) => (
        <span key={i} style={{ whiteSpace: 'nowrap' }}>
          {i > 0 && <span style={{ color: 'var(--text3)' }}>{'  ·  '}</span>}
          {part}
        </span>
      ))}
    </>
  )
}

export function GenerationStatsLine({ stats }: { stats: GenerationStats }) {
  const callTotal = stats.calls.reduce((sum, c) => sum + c.wallMs, 0)
  const total = stats.prepMs + callTotal
  const n = stats.calls.length

  return (
    <div
      style={{
        marginTop: '10px',
        fontSize: '11px',
        lineHeight: 1.7,
        color: 'var(--text2)',
        fontFamily: "'DM Mono', monospace",
      }}
    >
      <div style={{ color: 'var(--text)' }}>
        {fmt(total)}
        <span style={{ color: 'var(--text3)' }}>
          {'  ·  '}{n} {n === 1 ? 'call' : 'calls'}{'  ·  '}{stats.model}
        </span>
      </div>

      {stats.prepMs >= 50 && (
        <Row label={`prep (${stats.imageCount} ${stats.imageCount === 1 ? 'image' : 'images'})`}>
          {fmt(stats.prepMs)}
        </Row>
      )}

      {stats.calls.map((t, i) => (
        <Row key={i} label={n === 1 ? 'call' : `call ${i + 1} · ${fmt(t.wallMs)}`}>
          <CallDetail t={t} />
        </Row>
      ))}
    </div>
  )
}
