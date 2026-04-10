import { useEffect, useCallback } from 'preact/hooks'
import {
  selectedProvider, selectedModel, availableModels,
  currentImages, currentNotes, currentPlatform,
  isGenerating, generationError, generationResult,
  editTitle, editCaption, editHashtags,
  activeTab, showToast,
} from '../../store'
import { getProvider, getAllProviders } from '../../providers/registry'
import { resizeForLLM } from '../../store/storage'
import { buildSystemPrompt, buildUserPrompt } from '../../utils/prompts'
import { useState } from 'preact/hooks'

export function GenerateTab() {
  const provider = selectedProvider.value
  const model = selectedModel.value
  const models = availableModels.value
  const images = currentImages.value
  const generating = isGenerating.value
  const error = generationError.value
  const [newHashtag, setNewHashtag] = useState('')

  // Load models when provider changes
  useEffect(() => {
    const p = getProvider(provider)
    if (!p) return
    p.listModels().then((m) => {
      availableModels.value = m.map((x) => ({ id: x.id, name: x.name }))
      // Auto-select first model or default
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

    try {
      // Resize images for LLM
      const resized = await Promise.all(images.map((img: { blob: Blob }) => resizeForLLM(img.blob)))

      const platform = currentPlatform.value
      const systemPrompt = buildSystemPrompt(platform)
      const userPrompt = buildUserPrompt(currentNotes.value, images.length)

      const result = await p.generate({
        model,
        images: resized,
        systemPrompt,
        userPrompt,
        platform,
      })

      generationResult.value = result
      editTitle.value = result.title
      editCaption.value = result.caption
      editHashtags.value = result.hashtags

      showToast('Draft generated!', 'success')
    } catch (e: any) {
      generationError.value = e.message || 'Generation failed'
      showToast(e.message || 'Generation failed', 'error')
    } finally {
      isGenerating.value = false
    }
  }, [provider, model, images])

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
      </div>

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

      {editCaption.value && (
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

          <div class="section">
            <div class="btn-row">
              <button
                class="btn btn-ghost btn-sm"
                onClick={() => (activeTab.value = 'preview')}
              >
                <span class="material-symbols-outlined" style={{ fontSize: '14px' }}>visibility</span>
                Preview
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
