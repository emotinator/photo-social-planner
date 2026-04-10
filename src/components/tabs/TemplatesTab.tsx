import { useEffect, useState, useRef } from 'preact/hooks'
import { allTemplates, allSnippetSets, allCaptionVoices, showToast } from '../../store'
import {
  saveTemplate, loadAllTemplates, deleteTemplate,
  saveSnippetSet, loadAllSnippetSets, deleteSnippetSet,
  saveCaptionVoice, loadAllCaptionVoices, deleteCaptionVoice,
  exportTemplateBundle, importTemplateBundle,
} from '../../store/storage'
import { parsePlaceholders, validateTemplate } from '../../utils/templateParser'
import type { PostTemplate, SnippetSet, CaptionVoice, ParsedPlaceholder } from '../../types'

export function TemplatesTab() {
  const templates = allTemplates.value
  const snippetSets = allSnippetSets.value
  const captionVoices = allCaptionVoices.value

  // Editor state
  const [editingTemplate, setEditingTemplate] = useState<PostTemplate | null>(null)
  const [editingSet, setEditingSet] = useState<SnippetSet | null>(null)
  const [editingVoice, setEditingVoice] = useState<CaptionVoice | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  // Load on mount
  useEffect(() => {
    loadAllTemplates().then((t) => { allTemplates.value = t })
    loadAllSnippetSets().then((s) => { allSnippetSets.value = s })
    loadAllCaptionVoices().then((v) => { allCaptionVoices.value = v })
  }, [])

  // Template CRUD
  const handleNewTemplate = () => {
    const now = new Date().toISOString()
    setEditingTemplate({
      id: crypto.randomUUID(),
      name: '',
      body: '[LLM Title]\n.\n.\n.\n[LLM Caption]\n---\n[LLM Hashtags]',
      createdAt: now,
      updatedAt: now,
    })
  }

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return
    if (!editingTemplate.name.trim()) {
      showToast('Template needs a name', 'error')
      return
    }
    const updated = { ...editingTemplate, updatedAt: new Date().toISOString() }
    await saveTemplate(updated)
    allTemplates.value = await loadAllTemplates()
    setEditingTemplate(null)
    showToast('Template saved', 'success')
  }

  const handleDeleteTemplate = async (id: string) => {
    await deleteTemplate(id)
    allTemplates.value = await loadAllTemplates()
    if (editingTemplate?.id === id) setEditingTemplate(null)
    showToast('Template deleted', 'info')
  }

  // Snippet Set CRUD
  const handleNewSet = () => {
    const now = new Date().toISOString()
    setEditingSet({
      id: crypto.randomUUID(),
      name: '',
      options: [''],
      createdAt: now,
      updatedAt: now,
    })
  }

  const handleSaveSet = async () => {
    if (!editingSet) return
    if (!editingSet.name.trim()) {
      showToast('Snippet set needs a name', 'error')
      return
    }
    const cleaned = {
      ...editingSet,
      options: editingSet.options.filter((o) => o.trim()),
      updatedAt: new Date().toISOString(),
    }
    if (cleaned.options.length === 0) {
      showToast('Add at least one option', 'error')
      return
    }
    await saveSnippetSet(cleaned)
    allSnippetSets.value = await loadAllSnippetSets()
    setEditingSet(null)
    showToast('Snippet set saved', 'success')
  }

  const handleDeleteSet = async (id: string) => {
    await deleteSnippetSet(id)
    allSnippetSets.value = await loadAllSnippetSets()
    if (editingSet?.id === id) setEditingSet(null)
    showToast('Snippet set deleted', 'info')
  }

  // Caption Voice CRUD
  const handleNewVoice = () => {
    const now = new Date().toISOString()
    setEditingVoice({
      id: crypto.randomUUID(),
      name: '',
      description: '',
      createdAt: now,
      updatedAt: now,
    })
  }

  const handleSaveVoice = async () => {
    if (!editingVoice) return
    if (!editingVoice.name.trim()) {
      showToast('Voice needs a name', 'error')
      return
    }
    if (!editingVoice.description.trim()) {
      showToast('Voice needs a description', 'error')
      return
    }
    const updated = { ...editingVoice, updatedAt: new Date().toISOString() }
    await saveCaptionVoice(updated)
    allCaptionVoices.value = await loadAllCaptionVoices()
    setEditingVoice(null)
    showToast('Voice saved', 'success')
  }

  const handleDeleteVoice = async (id: string) => {
    await deleteCaptionVoice(id)
    allCaptionVoices.value = await loadAllCaptionVoices()
    if (editingVoice?.id === id) setEditingVoice(null)
    showToast('Voice deleted', 'info')
  }

  // Export/Import
  const handleExport = async () => {
    const json = await exportTemplateBundle()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `templates-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Templates exported', 'success')
  }

  const handleImport = async (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const counts = await importTemplateBundle(text)
      allTemplates.value = await loadAllTemplates()
      allSnippetSets.value = await loadAllSnippetSets()
      allCaptionVoices.value = await loadAllCaptionVoices()
      const settingsNote = counts.settingsRestored ? ' + settings' : ''
      showToast(`Imported ${counts.templates} templates, ${counts.snippetSets} sets, ${counts.voices} voices${settingsNote}`, 'success')
    } catch (err: any) {
      showToast(err.message || 'Import failed', 'error')
    }
    input.value = ''
  }

  // Parse placeholders for live preview
  const placeholders: ParsedPlaceholder[] = editingTemplate ? parsePlaceholders(editingTemplate.body) : []
  const setNames = snippetSets.map((s: SnippetSet) => s.name)
  const validation = editingTemplate ? validateTemplate(editingTemplate.body, setNames) : null

  return (
    <>
      {/* ── Post Templates ── */}
      <div class="section">
        <div class="section-label">Post Templates</div>

        {!editingTemplate ? (
          <>
            {templates.length === 0 && (
              <div style={{ fontSize: '13px', color: 'var(--text3)', fontStyle: 'italic', fontFamily: "'DM Mono', monospace", marginBottom: '10px' }}>
                No templates yet
              </div>
            )}

            {templates.map((t: PostTemplate) => (
              <div key={t.id} class="template-list-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", marginTop: '2px' }}>
                    {parsePlaceholders(t.body).length} placeholders
                  </div>
                </div>
                <div class="btn-row">
                  <button class="btn btn-ghost btn-sm" onClick={() => setEditingTemplate({ ...t })}>Edit</button>
                  <button class="btn btn-danger btn-sm" onClick={() => handleDeleteTemplate(t.id)}>Del</button>
                </div>
              </div>
            ))}

            <button class="btn btn-ghost btn-full" style={{ marginTop: '8px' }} onClick={handleNewTemplate}>
              + New Template
            </button>
          </>
        ) : (
          <div class="template-editor-panel">
            <div class="field-row">
              <div class="field-label">Name</div>
              <input
                type="text"
                value={editingTemplate.name}
                onInput={(e) => setEditingTemplate({ ...editingTemplate, name: (e.target as HTMLInputElement).value })}
                placeholder="e.g., Portrait Post"
              />
            </div>

            <div class="field-row" style={{ marginTop: '10px' }}>
              <div class="field-label">Template Body</div>
              <textarea
                class="template-editor"
                rows={12}
                value={editingTemplate.body}
                onInput={(e) => setEditingTemplate({ ...editingTemplate, body: (e.target as HTMLTextAreaElement).value })}
                placeholder={'[LLM Title]\n.\n.\n.\n[LLM Caption]\n---\nShot by @photographer\n[User Lighting]\n.\n[LLM Hashtags]'}
              />
            </div>

            {/* Live placeholder preview */}
            {placeholders.length > 0 && (
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {placeholders.map((p, i) => (
                  <span key={i} class={`placeholder-tag ${p.type}`}>
                    {p.raw}
                  </span>
                ))}
              </div>
            )}

            {/* Validation warnings */}
            {validation && !validation.valid && (
              <div style={{ marginTop: '6px' }}>
                {validation.errors.map((err, i) => (
                  <div key={i} style={{ fontSize: '11px', color: 'var(--red)', fontFamily: "'DM Mono', monospace" }}>
                    {err}
                  </div>
                ))}
              </div>
            )}

            <div class="btn-row" style={{ marginTop: '10px' }}>
              <button class="btn btn-accent btn-sm" onClick={handleSaveTemplate}>Save</button>
              <button class="btn btn-ghost btn-sm" onClick={() => setEditingTemplate(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Snippet Sets ── */}
      <div class="section">
        <div class="section-label">Snippet Sets</div>

        {!editingSet ? (
          <>
            {snippetSets.length === 0 && (
              <div style={{ fontSize: '13px', color: 'var(--text3)', fontStyle: 'italic', fontFamily: "'DM Mono', monospace", marginBottom: '10px' }}>
                No snippet sets yet
              </div>
            )}

            {snippetSets.map((s: SnippetSet) => (
              <div key={s.id} class="template-list-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{s.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", marginTop: '2px' }}>
                    {s.options.length} option{s.options.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div class="btn-row">
                  <button class="btn btn-ghost btn-sm" onClick={() => setEditingSet({ ...s })}>Edit</button>
                  <button class="btn btn-danger btn-sm" onClick={() => handleDeleteSet(s.id)}>Del</button>
                </div>
              </div>
            ))}

            <button class="btn btn-ghost btn-full" style={{ marginTop: '8px' }} onClick={handleNewSet}>
              + New Snippet Set
            </button>
          </>
        ) : (
          <div class="template-editor-panel">
            <div class="field-row">
              <div class="field-label">Set Name</div>
              <input
                type="text"
                value={editingSet.name}
                onInput={(e) => setEditingSet({ ...editingSet, name: (e.target as HTMLInputElement).value })}
                placeholder="e.g., Lighting-Set"
              />
              <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", marginTop: '3px' }}>
                Reference in templates as: [User {editingSet.name || '...'}]
              </div>
            </div>

            <div class="field-row" style={{ marginTop: '10px' }}>
              <div class="field-label">Options (pick one per post)</div>
              {editingSet.options.map((opt, i) => (
                <div key={i} class="snippet-option">
                  <input
                    type="text"
                    value={opt}
                    onInput={(e) => {
                      const opts = [...editingSet.options]
                      opts[i] = (e.target as HTMLInputElement).value
                      setEditingSet({ ...editingSet, options: opts })
                    }}
                    placeholder={`Option ${i + 1}`}
                    style={{ flex: 1 }}
                  />
                  {editingSet.options.length > 1 && (
                    <button
                      class="btn btn-danger btn-sm"
                      style={{ padding: '6px 8px' }}
                      onClick={() => {
                        const opts = editingSet.options.filter((_: string, j: number) => j !== i)
                        setEditingSet({ ...editingSet, options: opts })
                      }}
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
              <button
                class="btn btn-ghost btn-sm"
                style={{ marginTop: '6px' }}
                onClick={() => setEditingSet({ ...editingSet, options: [...editingSet.options, ''] })}
              >
                + Add Option
              </button>
            </div>

            <div class="btn-row" style={{ marginTop: '10px' }}>
              <button class="btn btn-accent btn-sm" onClick={handleSaveSet}>Save</button>
              <button class="btn btn-ghost btn-sm" onClick={() => setEditingSet(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Caption Voices ── */}
      <div class="section">
        <div class="section-label">Caption Voices</div>

        {!editingVoice ? (
          <>
            {captionVoices.length === 0 && (
              <div style={{ fontSize: '13px', color: 'var(--text3)', fontStyle: 'italic', fontFamily: "'DM Mono', monospace", marginBottom: '10px' }}>
                No voices yet. Create voices to shape your caption's tone.
              </div>
            )}

            {captionVoices.map((v: CaptionVoice) => (
              <div key={v.id} class="template-list-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{v.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", marginTop: '2px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {v.description}
                  </div>
                </div>
                <div class="btn-row">
                  <button class="btn btn-ghost btn-sm" onClick={() => setEditingVoice({ ...v })}>Edit</button>
                  <button class="btn btn-danger btn-sm" onClick={() => handleDeleteVoice(v.id)}>Del</button>
                </div>
              </div>
            ))}

            <button class="btn btn-ghost btn-full" style={{ marginTop: '8px' }} onClick={handleNewVoice}>
              + New Voice
            </button>
          </>
        ) : (
          <div class="template-editor-panel">
            <div class="field-row">
              <div class="field-label">Voice Name</div>
              <input
                type="text"
                value={editingVoice.name}
                onInput={(e) => setEditingVoice({ ...editingVoice, name: (e.target as HTMLInputElement).value })}
                placeholder="e.g., Warm & Reflective"
              />
            </div>

            <div class="field-row" style={{ marginTop: '10px' }}>
              <div class="field-label">Voice Description</div>
              <textarea
                rows={5}
                value={editingVoice.description}
                onInput={(e) => setEditingVoice({ ...editingVoice, description: (e.target as HTMLTextAreaElement).value })}
                placeholder="Describe the tone, style, and personality. e.g., 'Write in a warm, reflective tone. Use short poetic sentences. Share personal insights about the creative process. Speak as an artist sharing their journey, not selling a product.'"
              />
            </div>

            <div class="btn-row" style={{ marginTop: '10px' }}>
              <button class="btn btn-accent btn-sm" onClick={handleSaveVoice}>Save</button>
              <button class="btn btn-ghost btn-sm" onClick={() => setEditingVoice(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Export / Import ── */}
      <div class="section">
        <div class="section-label">Backup</div>
        <div class="btn-row">
          <button class="btn btn-ghost btn-sm" onClick={handleExport}>
            Export JSON
          </button>
          <button class="btn btn-ghost btn-sm" onClick={() => importRef.current?.click()}>
            Import JSON
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </div>
      </div>
    </>
  )
}
