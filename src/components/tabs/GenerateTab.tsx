import { useEffect, useCallback } from 'preact/hooks'
import {
  selectedProvider, selectedModel, availableModels,
  currentImages, currentNotes, currentPlatform,
  isGenerating, generationError, generationResult,
  editTitle, editCaption, editHashtags,
  showToast, editingDraftId,
  allTemplates, allSnippetSets, selectedTemplateId,
  snippetSelections, snippetLLMContext, assembledPost,
  allCaptionVoices, selectedVoiceIds, voiceVariants, chosenVoiceId,
  captionLength, titleLength,
  enableAltText, enableThreadsPost, editAltText, editThreadsPost, threadsCredits,
  type CaptionLength, type TitleLength, type VoiceVariant,
} from '../../store'
import { getProvider, getAllProviders } from '../../providers/registry'
import { resizeForLLM, loadAllCaptionVoices, loadDraftsMeta } from '../../store/storage'
import { buildSystemPrompt, buildUserPrompt, buildTemplateSystemPrompt, getLengthSpec, calcCaptionBudget, getTitleSpec, calcThreadsBudget } from '../../utils/prompts'
import { buildRepetitionContext } from '../../utils/repetition'
import { extractLLMFields, extractUserFields, assembleTemplate, staticTextLength } from '../../utils/templateParser'
import { useState, useEffect as useEffectAlias } from 'preact/hooks'
import type { PostTemplate, SnippetSet, CaptionVoice } from '../../types'
import { PLATFORMS } from '../../types'

/**
 * Copy a result's extra outputs into the editable fields (used on generate and on
 * voice switch). The credits block is appended here so the Threads field holds the
 * complete post — the credits and their @handles are then editable like any other text.
 */
function applyVariantExtras(src: { altText?: string[]; threadsPost?: string }) {
  if (src.altText) editAltText.value = src.altText
  if (src.threadsPost !== undefined) {
    const credits = threadsCredits.value.trim()
    editThreadsPost.value = credits ? `${src.threadsPost}\n${credits}` : src.threadsPost
  }
}

export function GenerateTab() {
  const provider = selectedProvider.value
  const model = selectedModel.value
  const models = availableModels.value
  const images = currentImages.value
  const generating = isGenerating.value
  const error = generationError.value
  const [newHashtag, setNewHashtag] = useState('')
  const [outputTab, setOutputTab] = useState<'post' | 'alt' | 'threads'>('post')

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

  // ── Output tabs ──
  // Only the outputs that actually got generated are offered. Warnings live on the
  // tab badges so an over-limit post isn't hidden behind an unselected tab.
  const altList = editAltText.value.slice(0, images.length)
  const hasAlt = altList.some((t: string) => t)
  const hasThreads = !!editThreadsPost.value
  const threadsOver = editThreadsPost.value.length > PLATFORMS.threads.captionMaxLength
  const altOver = altList.some((t: string) => t.length > 200)

  const outputTabs = [
    hasResult && { id: 'post' as const, label: isTemplateMode ? 'Assembled' : 'Post' },
    hasAlt && {
      id: 'alt' as const,
      label: 'Alt Text',
      badge: String(altList.filter((t: string) => t).length),
      warn: altOver,
    },
    hasThreads && {
      id: 'threads' as const,
      label: 'Threads',
      badge: String(editThreadsPost.value.length),
      warn: threadsOver,
    },
  ].filter(Boolean) as { id: 'post' | 'alt' | 'threads'; label: string; badge?: string; warn?: boolean }[]

  // Fall back to the first available tab if the selected one no longer exists
  const activeOutput = outputTabs.some((t) => t.id === outputTab)
    ? outputTab
    : outputTabs[0]?.id ?? 'post'
  const showOutputTabs = outputTabs.length > 1

  const handleNewPost = useCallback(() => {
    currentImages.value = []
    currentNotes.value = ''
    editTitle.value = ''
    editCaption.value = ''
    editHashtags.value = []
    editAltText.value = []
    editThreadsPost.value = ''
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
      // Load planned-post metadata fresh (no image blobs) so repetition context
      // reflects the current queue even if the Plan tab was never opened.
      const draftsMeta = (await loadDraftsMeta()).filter((d) => d.id !== editingDraftId.value)
      const repetition = buildRepetitionContext(draftsMeta)
      const userPrompt = buildUserPrompt(currentNotes.value, images.length, llmSnippets, repetition)

      // Determine which voices to generate for
      const activeVoices = selVoiceIds
        .map((id: string) => voices.find((v: CaptionVoice) => v.id === id))
        .filter(Boolean) as CaptionVoice[]
      const hasMultipleVoices = activeVoices.length > 1

      const capLenVal = captionLength.value
      const titLenVal = titleLength.value
      const tmplStatic = activeTemplate ? staticTextLength(activeTemplate.body) : 0

      // Extra outputs ride along in the same call. A separate Threads post is
      // meaningless when the post itself is already for Threads.
      const wantAlt = enableAltText.value
      const wantThreads = enableThreadsPost.value && platform !== 'threads'
      const extraOutputs = wantAlt || wantThreads
        ? { altText: wantAlt, threadsPost: wantThreads }
        : undefined
      const imageCount = images.length
      // Reserve the credits block out of the Threads limit before asking for text
      const threadsBudget = calcThreadsBudget(threadsCredits.value)

      // Clear previous extras so a run with a box unticked doesn't leave stale
      // text on screen — or silently save it onto the draft
      editAltText.value = []
      editThreadsPost.value = ''

      if (isTemplateMode && activeTemplate) {
        // Template mode
        const llmFieldKeys = extractLLMFields(activeTemplate.body)
        const llmFields = llmFieldKeys.map((key) => ({ key }))

        if (hasMultipleVoices) {
          // Generate one variant per voice
          const newVariants: Record<string, VoiceVariant> = {}
          for (const voice of activeVoices) {
            const systemPrompt = buildTemplateSystemPrompt(platform, llmFields, voice.description, capLenVal, titLenVal, tmplStatic, extraOutputs, imageCount, threadsBudget)
            const result = await p.generate({ model, images: resized, systemPrompt, userPrompt, platform, templateLLMFields: llmFields, extraOutputs, imageCount, threadsBudget: threadsBudget.budget })
            const fills = result.llmFills || {}
            newVariants[voice.id] = {
              text: assembleTemplate(activeTemplate.body, fills, snippetSelections.value),
              altText: result.altText,
              threadsPost: result.threadsPost,
            }
          }
          voiceVariants.value = newVariants
          // Auto-select the first
          const firstId = activeVoices[0].id
          chosenVoiceId.value = firstId
          assembledPost.value = newVariants[firstId].text
          applyVariantExtras(newVariants[firstId])
          generationResult.value = null
        } else {
          // Single voice or no voice
          const voiceDesc = activeVoices.length === 1 ? activeVoices[0].description : undefined
          const systemPrompt = buildTemplateSystemPrompt(platform, llmFields, voiceDesc, capLenVal, titLenVal, tmplStatic, extraOutputs, imageCount, threadsBudget)
          const result = await p.generate({ model, images: resized, systemPrompt, userPrompt, platform, templateLLMFields: llmFields, extraOutputs, imageCount, threadsBudget: threadsBudget.budget })
          generationResult.value = result
          const fills = result.llmFills || {}
          assembledPost.value = assembleTemplate(activeTemplate.body, fills, snippetSelections.value)
          applyVariantExtras(result)
        }

        editTitle.value = ''
        editCaption.value = ''
        editHashtags.value = []
      } else {
        // Classic mode
        if (hasMultipleVoices) {
          // Generate variant per voice — store caption variants
          const newVariants: Record<string, VoiceVariant> = {}
          let lastResult = null
          for (const voice of activeVoices) {
            const systemPrompt = buildSystemPrompt(platform, voice.description, capLenVal, titLenVal, extraOutputs, imageCount, threadsBudget)
            const result = await p.generate({ model, images: resized, systemPrompt, userPrompt, platform, extraOutputs, imageCount, threadsBudget: threadsBudget.budget })
            newVariants[voice.id] = {
              text: result.caption,
              altText: result.altText,
              threadsPost: result.threadsPost,
            }
            lastResult = result
          }
          voiceVariants.value = newVariants
          const firstId = activeVoices[0].id
          chosenVoiceId.value = firstId
          editCaption.value = newVariants[firstId].text
          applyVariantExtras(newVariants[firstId])
          editTitle.value = lastResult?.title || ''
          editHashtags.value = lastResult?.hashtags || []
          generationResult.value = lastResult
          assembledPost.value = ''
        } else {
          const voiceDesc = activeVoices.length === 1 ? activeVoices[0].description : undefined
          const systemPrompt = buildSystemPrompt(platform, voiceDesc, capLenVal, titLenVal, extraOutputs, imageCount, threadsBudget)
          const result = await p.generate({ model, images: resized, systemPrompt, userPrompt, platform, extraOutputs, imageCount, threadsBudget: threadsBudget.budget })
          generationResult.value = result
          editTitle.value = result.title
          editCaption.value = result.caption
          editHashtags.value = result.hashtags
          applyVariantExtras(result)
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

      {/* ── Extra Outputs ── */}
      <div class="section">
        <div class="section-label">Extra Outputs</div>
        <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", marginBottom: '8px' }}>
          Generated in the same request — no extra wait.
        </div>

        <label class="template-list-item" style={{ cursor: 'pointer', marginBottom: '4px' }}>
          <input
            type="checkbox"
            checked={enableAltText.value}
            onChange={(e) => (enableAltText.value = (e.target as HTMLInputElement).checked)}
            style={{ accentColor: 'var(--accent)', marginRight: '6px' }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Alt text</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", marginTop: '3px' }}>
              One per image{images.length > 1 ? ` (${images.length} slides)` : ''} · accessibility + search
            </div>
          </div>
        </label>

        {currentPlatform.value !== 'threads' && (
          <label class="template-list-item" style={{ cursor: 'pointer', marginBottom: 0 }}>
            <input
              type="checkbox"
              checked={enableThreadsPost.value}
              onChange={(e) => (enableThreadsPost.value = (e.target as HTMLInputElement).checked)}
              style={{ accentColor: 'var(--accent)', marginRight: '6px' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Threads post</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", marginTop: '3px' }}>
                Written natively · 300–{PLATFORMS.threads.captionMaxLength} chars, no hashtags
              </div>
            </div>
          </label>
        )}
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
            {Object.entries(variants).map(([voiceId, variant]) => {
              const text = (variant as VoiceVariant).text
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
                    // Keep the extras in step with the chosen voice
                    applyVariantExtras(variant as VoiceVariant)
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

      {/* Output tab strip — only when there's more than one output to switch between */}
      {showOutputTabs && (
        <div class="section" style={{ paddingBottom: 0 }}>
          <div class="output-tabs">
            {outputTabs.map((t) => (
              <button
                key={t.id}
                class={`output-tab ${activeOutput === t.id ? 'active' : ''}`}
                onClick={() => setOutputTab(t.id)}
              >
                {t.label}
                {t.badge && (
                  <span class={`output-tab-badge ${t.warn ? 'warn' : ''}`}>{t.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Template mode: single assembled post textarea */}
      {activeOutput === 'post' && isTemplateMode && assembledPost.value && (
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
      {activeOutput === 'post' && !isTemplateMode && editCaption.value && (
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

      {/* ── Alt text (one per image) ── */}
      {activeOutput === 'alt' && hasAlt && (
        <div class="section">
          <div class="section-label">Alt Text</div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", marginBottom: '8px' }}>
            Paste into Instagram under Advanced settings → Write alt text.
          </div>
          {editAltText.value.slice(0, images.length).map((alt: string, i: number) => (
            <div key={i} class="result-field" style={{ marginBottom: '8px' }}>
              {images.length > 1 && (
                <div style={{ fontSize: '11px', color: 'var(--text2)', fontFamily: "'DM Mono', monospace", marginBottom: '3px' }}>
                  Slide {i + 1} of {images.length}
                </div>
              )}
              <textarea
                rows={2}
                value={alt}
                placeholder="Alt text for this image..."
                onInput={(e) => {
                  const next = [...editAltText.value]
                  next[i] = (e.target as HTMLTextAreaElement).value
                  editAltText.value = next
                }}
              />
              <div style={{
                marginTop: '4px', fontSize: '11px', fontFamily: "'DM Mono', monospace", textAlign: 'right',
                color: alt.length > 200 ? 'var(--red, #e5534b)' : 'var(--text3)',
              }}>
                {alt.length} chars {alt.length > 200 ? '· over 200, trim it' : '· aim ~125'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Threads post (includes the credits block, all editable) ── */}
      {activeOutput === 'threads' && hasThreads && (
        <div class="section">
          <div class="section-label">Threads Post</div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", marginBottom: '8px' }}>
            Credits included below — fill in the In Frame and Agency handles here.
          </div>
          <div class="result-field">
            <textarea
              rows={14}
              value={editThreadsPost.value}
              onInput={(e) => (editThreadsPost.value = (e.target as HTMLTextAreaElement).value)}
            />
            {(() => {
              const total = editThreadsPost.value.length
              const over = total - PLATFORMS.threads.captionMaxLength
              return (
                <div style={{
                  marginTop: '4px', fontSize: '11px', fontFamily: "'DM Mono', monospace",
                  textAlign: 'right', color: over > 0 ? 'var(--red, #e5534b)' : 'var(--text3)',
                }}>
                  {total} / {PLATFORMS.threads.captionMaxLength}
                  {over > 0 ? ` · over by ${over}` : ` · ${-over} to spare`}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </>
  )
}
