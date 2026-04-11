import { useEffect, useCallback } from 'preact/hooks'
import {
  selectedProvider, selectedModel, availableModels,
  currentImages, currentNotes, currentPlatform,
  isGenerating, generationError, generationResult,
  editTitle, editCaption, editHashtags,
  activeTab, showToast, editingDraftId,
  allTemplates, allSnippetSets, selectedTemplateId,
  snippetSelections, snippetLLMContext, assembledPost,
  allCaptionVoices, selectedVoiceIds, voiceVariants, chosenVoiceId,
  captionLength, titleLength,
  type CaptionLength, type TitleLength,
} from '../../store'
import { getProvider, getAllProviders } from '../../providers/registry'
import { resizeForLLM, loadAllCaptionVoices } from '../../store/storage'
import { buildSystemPrompt, buildUserPrompt, buildTemplateSystemPrompt, getLengthSpec, calcCaptionBudget, getTitleSpec } from '../../utils/prompts'
import { extractLLMFields, extractUserFields, assembleTemplate, staticTextLength } from '../../utils/templateParser'
import { useState, useEffect as useEffectAlias } from 'preact/hooks'
import type { PostTemplate, SnippetSet, CaptionVoice } from '../../types'

export function GenerateTab() {
  const provider = selectedProvider.value
  const model = selectedModel.value
  const models = availableModels.value
  const images = currentImages.value
  const generating = isGenerating.value
  const error = generationError.value
  const [newHashtag, setNewHashtag] = useState('')

  const templates = allTemplates.value
  const snippetSets = allSnippetSets.value
  const templateId = selectedTemplateId.value
  const activeTemplate = templateId ? templates.find((t: PostTemplate) => t.id === templateId) : null
  const userFields = activeTemplate ? extractUserFields(activeTemplate.body) : []
  const isTemplateMode = !!activeTemplate

  const capLen = captionLength.value
  const titLen = titleLength.value
  const templateStatic = activeTemplate ? staticTextLength(activeTemplate.body) : 0
  const { budget, platformMax } = calcCaptionBudget(currentPlatform.value, capLen, templateStatic)

  // Detect if workspace has generated content
  const hasResult = !!(editCaption.value || assembledPost.value)
  const isEditing = !!editingDraftId.value

  const handleNewPost = useCallback(() => {
    currentImages.value = []
    currentNotes.value = ''
    editTitle.value = ''
    editCaption.value = ''
    editHashtags.value = []
    assembledPost.value = ''
    generationResult.value = null
    generationError.value = null
    voiceVariants.value = {}
    chosenVoiceId.value = null
    editingDraftId.value = null
    snippetSelections.value = {}
    snippetLLMContext.value = {}
    showToast('Workspace cleared', 'info')
  }, [])

  const voices = allCaptionVoices.value
  const selVoiceIds = selectedVoiceIds.value
  const variants = voiceVariants.value
  const pickedVoice = chosenVoiceId.value

  // Load voices on mount
  useEffectAlias(() => {
    loadAllCaptionVoices().then((v) => { allCaptionVoices.value = v })
  }, [])

  // Load models when provider changes
  useEffect(() => {
    const p = getProvider(provider)
    if (!p) return
    p.listModels().then((m) => {
      availableModels.value = m.map((x) => ({ id: x.id, name: x.name }))
      if (m.length > 0 && !m.find((x) => x.id === selectedModel.value)) {
        selectedModel.value = m[0].id
      }
    })
  }, [provider])

  const handleGenerate = useCallback(async () => {
    if (images.length === 0) {
      showToast('Add images first', 'error')
      return
    }

    const p = getProvider(provider)
    if (!p) {
      showToast('Select a provider', 'error')
      return
    }

    isGenerating.value = true
    generationError.value = null
    voiceVariants.value = {}
    chosenVoiceId.value = null

    try {
      const resized = await Promise.all(images.map((img: { blob: Blob }) => resizeForLLM(img.blob)))
      const platform = currentPlatform.value
      const llmSnippets = isTemplateMode
        ? Object.fromEntries(Object.entries(snippetSelections.value).filter(([k]) => snippetLLMContext.value[k]))
        : undefined
      const userPrompt = buildUserPrompt(currentNotes.value, images.length, llmSnippets)

      // Determine which voices to generate for
      const activeVoices = selVoiceIds
        .map((id: string) => voices.find((v: CaptionVoice) => v.id === id))
        .filter(Boolean) as CaptionVoice[]
      const hasMultipleVoices = activeVoices.length > 1

      const capLenVal = captionLength.value
      const titLenVal = titleLength.value
      const tmplStatic = activeTemplate ? staticTextLength(activeTemplate.body) : 0

      if (isTemplateMode && activeTemplate) {
        // Template mode
        const llmFieldKeys = extractLLMFields(activeTemplate.body)
        const llmFields = llmFieldKeys.map((key) => ({ key }))

        if (hasMultipleVoices) {
          // Generate one variant per voice
          const newVariants: Record<string, string> = {}
          for (const voice of activeVoices) {
            const systemPrompt = buildTemplateSystemPrompt(platform, llmFields, voice.description, capLenVal, titLenVal, tmplStatic)
            const result = await p.generate({ model, images: resized, systemPrompt, userPrompt, platform, templateLLMFields: llmFields })
            const fills = result.llmFills || {}
            newVariants[voice.id] = assembleTemplate(activeTemplate.body, fills, snippetSelections.value)
          }
          voiceVariants.value = newVariants
          // Auto-select the first
          const firstId = activeVoices[0].id
          chosenVoiceId.value = firstId
          assembledPost.value = newVariants[firstId]
          generationResult.value = null
        } else {
          // Single voice or no voice
          const voiceDesc = activeVoices.length === 1 ? activeVoices[0].description : undefined
          const systemPrompt = buildTemplateSystemPrompt(platform, llmFields, voiceDesc, capLenVal, titLenVal, tmplStatic)
          const result = await p.generate({ model, images: resized, systemPrompt, userPrompt, platform, templateLLMFields: llmFields })
          generationResult.value = result
          const fills = result.llmFills || {}
          assembledPost.value = assembleTemplate(activeTemplate.body, fills, snippetSelections.value)
        }

        editTitle.value = ''
        editCaption.value = ''
        editHashtags.value = []
      } else {
        // Classic mode
        if (hasMultipleVoices) {
          // Generate variant per voice — store caption variants
          const newVariants: Record<string, string> = {}
          let lastResult = null
          for (const voice of activeVoices) {
            const systemPrompt = buildSystemPrompt(platform, voice.description, capLenVal, titLenVal)
            const result = await p.generate({ model, images: resized, systemPrompt, userPrompt, platform })
            newVariants[voice.id] = result.caption
            lastResult = result
          }
          voiceVariants.value = newVariants
          const firstId = activeVoices[0].id
          chosenVoiceId.value = firstId
          editCaption.value = newVariants[firstId]
          editTitle.value = lastResult?.title || ''
          editHashtags.value = lastResult?.hashtags || []
          generationResult.value = lastResult
          assembledPost.value = ''
        } else {
          const voiceDesc = activeVoices.length === 1 ? activeVoices[0].description : undefined
          const systemPrompt = buildSystemPrompt(platform, voiceDesc, capLenVal, titLenVal)
          const result = await p.generate({ model, images: resized, systemPrompt, userPrompt, platform })
          generationResult.value = result
          editTitle.value = result.title
          editCaption.value = result.caption
          editHashtags.value = result.hashtags
          assembledPost.value = ''
        }
      }

      const voiceCount = activeVoices.length
      showToast(voiceCount > 1 ? `Generated ${voiceCount} voice variants!` : 'Draft generated!', 'success')
    } catch (e: any) {
      generationError.value = e.message || 'Generation failed'
      showToast(e.message || 'Generation failed', 'error')
    } finally {
      isGenerating.value = false
    }
  }, [provider, model, images, isTemplateMode, activeTemplate, selVoiceIds, voices])

  const addHashtag = () => {
    const tag = newHashtag.trim().replace(/^#/, '')
    if (tag && !editHashtags.value.includes(tag)) {
      editHashtags.value = [...editHashtags.value as string[], tag]
      setNewHashtag('')
    }
  }

  const removeHashtag = (tag: string) => {
    editHashtags.value = editHashtags.value.filter((h: string) => h !== tag)
  }

  return (
    <>
      {/* New Post button — shown when workspace has generated content */}
      {hasResult && (
        <div class="section">
          <button class="btn btn-ghost btn-full" onClick={handleNewPost}>
            <span class="material-symbols-outlined" style={{ fontSize: '16px' }}>add_circle</span>
            New Post
          </button>
          {isEditing && (
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", textAlign: 'center', marginTop: '4px' }}>
              Editing saved draft &middot; go to Plan tab to save
            </div>
          )}
        </div>
      )}

      <div class="section">
        <div class="section-label">Provider</div>
        <div class="field-row">
          <select
            value={provider}
            onChange={(e) => (selectedProvider.value = (e.target as HTMLSelectElement).value)}
          >
            {getAllProviders().map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div class="field-row">
          <div class="field-label">Model</div>
          <select
            value={model}
            onChange={(e) => (selectedModel.value = (e.target as HTMLSelectElement).value)}
          >
            {models.length === 0 && <option value="">No models available</option>}
            {models.map((m: { id: string; name: string }) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        <div class="field-row">
          <div class="field-label">Platform</div>
          <select
            value={currentPlatform.value}
            onChange={(e) => (currentPlatform.value = (e.target as HTMLSelectElement).value as any)}
          >
            <option value="instagram">Instagram</option>
            <option value="threads" disabled>Threads (coming soon)</option>
            <option value="linkedin" disabled>LinkedIn (coming soon)</option>
          </select>
        </div>

        <div class="field-row">
          <div class="field-label">Template</div>
          <select
            value={templateId || ''}
            onChange={(e) => {
              const val = (e.target as HTMLSelectElement).value
              selectedTemplateId.value = val || null
              snippetSelections.value = {}
              snippetLLMContext.value = {}
              assembledPost.value = ''
            }}
          >
            <option value="">None (classic mode)</option>
            {templates.map((t: PostTemplate) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Length Controls ── */}
      <div class="section">
        <div class="section-label">Content Length</div>

        {/* Title length */}
        <div class="length-control">
          <div class="length-header">
            <span class="length-label">Title</span>
            <span class="length-value">{getTitleSpec(titLen).label}</span>
          </div>
          <div class="length-slider-row">
            <input
              type="range"
              class="length-slider"
              min="0"
              max="5"
              step="1"
              value={[1, 2, 4, 6, 8, 0].indexOf(titLen)}
              onInput={(e) => {
                const steps: TitleLength[] = [1, 2, 4, 6, 8, 0]
                titleLength.value = steps[parseInt((e.target as HTMLInputElement).value)]
              }}
            />
            <div class="length-ticks">
              <span>1w</span><span>2w</span><span>4w</span><span>6w</span><span>8w</span><span>∞</span>
            </div>
          </div>
        </div>

        {/* Caption length */}
        <div class="length-control">
          <div class="length-header">
            <span class="length-label">Caption</span>
            <span class="length-value">{getLengthSpec(capLen).label}</span>
          </div>
          <div class="length-slider-row">
            <input
              type="range"
              class="length-slider"
              min="0"
              max="4"
              step="1"
              value={[0.5, 1, 2, 3, 0].indexOf(capLen)}
              onInput={(e) => {
                const steps: CaptionLength[] = [0.5, 1, 2, 3, 0]
                captionLength.value = steps[parseInt((e.target as HTMLInputElement).value)]
              }}
            />
            <div class="length-ticks">
              <span>½</span><span>1¶</span><span>2¶</span><span>3¶</span><span>∞</span>
            </div>
          </div>

          {/* Budget readout */}
          <div class="length-budget">
            {capLen === 0 ? (
              <span>Platform max: {platformMax.toLocaleString()} chars</span>
            ) : (
              <span>
                ~{budget.toLocaleString()} of {platformMax.toLocaleString()} chars
                {isTemplateMode && templateStatic > 0 && (
                  <span style={{ color: 'var(--text3)' }}> ({templateStatic} static)</span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Voice selector (multi-select) */}
      {voices.length > 0 && (
        <div class="section">
          <div class="section-label">Caption Voice</div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", marginBottom: '8px' }}>
            Select one or more. Multiple = generate a variant per voice.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {voices.map((v: CaptionVoice) => {
              const isSelected = selVoiceIds.includes(v.id)
              return (
                <label
                  key={v.id}
                  class={`template-list-item`}
                  style={{
                    cursor: 'pointer', marginBottom: 0,
                    borderColor: isSelected ? 'var(--accent)' : undefined,
                    background: isSelected ? 'var(--accent-dim)' : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {
                      if (isSelected) {
                        selectedVoiceIds.value = selVoiceIds.filter((id: string) => id !== v.id)
                      } else {
                        selectedVoiceIds.value = [...selVoiceIds, v.id]
                      }
                    }}
                    style={{ accentColor: 'var(--accent)', marginRight: '6px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{v.name}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", marginTop: '1px', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {v.description}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* Snippet selectors when template has [User ...] fields */}
      {isTemplateMode && userFields.length > 0 && (
        <div class="section">
          <div class="section-label">Snippet Selections</div>
          {userFields.map((fieldName) => {
            const set = snippetSets.find((s: SnippetSet) => s.name === fieldName)
            const sendToLLM = !!snippetLLMContext.value[fieldName]
            return (
              <div key={fieldName} class="field-row">
                <div class="field-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{fieldName}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", fontWeight: 400, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={sendToLLM}
                      onChange={() => {
                        snippetLLMContext.value = {
                          ...snippetLLMContext.value,
                          [fieldName]: !sendToLLM,
                        }
                      }}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    Send to AI
                  </label>
                </div>
                {set ? (
                  <select
                    value={snippetSelections.value[fieldName] || ''}
                    onChange={(e) => {
                      snippetSelections.value = {
                        ...snippetSelections.value,
                        [fieldName]: (e.target as HTMLSelectElement).value,
                      }
                    }}
                  >
                    <option value="">Select...</option>
                    {set.options.map((opt: string) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <div style={{ fontSize: '11px', color: 'var(--red)', fontFamily: "'DM Mono', monospace" }}>
                    No snippet set "{fieldName}" found. Create it in Templates tab.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div class="section">
        <button
          class="btn btn-accent btn-full"
          onClick={handleGenerate}
          disabled={generating || images.length === 0}
        >
          {generating ? (
            <>
              <span class="spinner" />
              Generating...
            </>
          ) : (
            <>
              <span class="material-symbols-outlined" style={{ fontSize: '16px' }}>auto_awesome</span>
              Generate Draft
            </>
          )}
        </button>

        {error && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--red)', fontFamily: "'DM Mono', monospace" }}>
            {error}
          </div>
        )}
      </div>

      {/* Voice variant picker */}
      {Object.keys(variants).length > 1 && (
        <div class="section">
          <div class="section-label">Voice Variants</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {Object.entries(variants).map(([voiceId, text]) => {
              const voice = voices.find((v: CaptionVoice) => v.id === voiceId)
              const isChosen = pickedVoice === voiceId
              return (
                <div
                  key={voiceId}
                  class="template-list-item"
                  style={{
                    cursor: 'pointer',
                    borderColor: isChosen ? 'var(--accent)' : undefined,
                    background: isChosen ? 'var(--accent-dim)' : undefined,
                  }}
                  onClick={() => {
                    chosenVoiceId.value = voiceId
                    if (isTemplateMode) {
                      assembledPost.value = text
                    } else {
                      editCaption.value = text
                    }
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: isChosen ? 'var(--accent)' : 'var(--text)' }}>
                      {voice?.name || 'Voice'}
                      {isChosen && <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--green)' }}>selected</span>}
                    </div>
                    <div style={{
                      fontSize: '11px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", marginTop: '3px',
                      display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {text}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Template mode: single assembled post textarea */}
      {isTemplateMode && assembledPost.value && (
        <div class="section">
          <div class="section-label">Assembled Post</div>
          <div class="result-field">
            <textarea
              class="template-editor"
              rows={14}
              value={assembledPost.value}
              onInput={(e) => (assembledPost.value = (e.target as HTMLTextAreaElement).value)}
            />
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", textAlign: 'right' }}>
              {assembledPost.value.length} characters
            </div>
          </div>
        </div>
      )}

      {/* Classic mode: title/caption/hashtags */}
      {!isTemplateMode && editCaption.value && (
        <>
          <div class="section">
            <div class="section-label">Title</div>
            <div class="result-field">
              <input
                type="text"
                value={editTitle.value}
                onInput={(e) => (editTitle.value = (e.target as HTMLInputElement).value)}
                placeholder="Post title..."
              />
            </div>
          </div>

          <div class="section">
            <div class="section-label">Caption</div>
            <div class="result-field">
              <textarea
                rows={8}
                value={editCaption.value}
                onInput={(e) => (editCaption.value = (e.target as HTMLTextAreaElement).value)}
              />
              <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", textAlign: 'right' }}>
                {editCaption.value.length} / 2200
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-label">Hashtags</div>
            <div class="hashtag-chips">
              {editHashtags.value.map((tag: string) => (
                <span key={tag} class="hashtag-chip">
                  #{tag}
                  <button onClick={() => removeHashtag(tag)}>&times;</button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <input
                type="text"
                placeholder="Add hashtag..."
                value={newHashtag}
                onInput={(e) => setNewHashtag((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addHashtag() } }}
                style={{ flex: 1 }}
              />
              <button class="btn btn-ghost btn-sm" onClick={addHashtag}>Add</button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
