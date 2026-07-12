import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { activeTab, type TabId } from '../../store'
import { ImagesTab } from '../tabs/ImagesTab'
import { GenerateTab } from '../tabs/GenerateTab'
import { TemplatesTab } from '../tabs/TemplatesTab'
import { DeliverTab } from '../tabs/DeliverTab'
import { PlanTab } from '../tabs/PlanTab'
import { SettingsTab } from '../tabs/SettingsTab'

const TABS: { id: TabId; label: string }[] = [
  { id: 'images', label: 'Images' },
  { id: 'generate', label: 'Generate' },
  { id: 'templates', label: 'Templates' },
  { id: 'deliver', label: 'Deliver' },
  { id: 'plan', label: 'Plan' },
  { id: 'settings', label: 'Settings' },
]

/** Near the top (scrollTop within this many px) the jump button points down; past it, up. */
const SCROLL_THRESHOLD = 300
/** Only show the jump button when the panel can scroll at least this far. */
const MIN_SCROLLABLE = 200

function TabPanel({ id, children }: { id: TabId; children: ComponentChildren }) {
  const active = activeTab.value === id
  const ref = useRef<HTMLDivElement>(null)
  // show = panel is scrollable; atTop = near the top (button points down to jump to bottom)
  const [jump, setJump] = useState<{ show: boolean; atTop: boolean }>({ show: false, atTop: true })

  const recompute = () => {
    const el = ref.current
    if (!el) return
    const show = el.scrollHeight - el.clientHeight > MIN_SCROLLABLE
    const atTop = el.scrollTop <= SCROLL_THRESHOLD
    setJump((prev) => (prev.show === show && prev.atTop === atTop ? prev : { show, atTop }))
  }

  // Reset scroll to the top whenever this panel becomes the active tab.
  useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollTop = 0
      recompute()
    }
  }, [active])

  // Keep the jump button in sync with content size (async draft loads) and window resize.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    const mo = new MutationObserver(recompute)
    mo.observe(el, { childList: true, subtree: true })
    return () => { ro.disconnect(); mo.disconnect() }
  }, [])

  const onJump = () => {
    const el = ref.current
    if (!el) return
    el.scrollTo({ top: jump.atTop ? el.scrollHeight : 0, behavior: 'instant' })
  }

  return (
    <div ref={ref} class={`tab-panel ${active ? 'active' : ''}`} onScroll={recompute}>
      {children}
      {active && jump.show && (
        <button
          class="scroll-jump"
          title={jump.atTop ? 'Jump to bottom' : 'Back to top'}
          aria-label={jump.atTop ? 'Jump to bottom' : 'Back to top'}
          onClick={onJump}
        >
          <span class="material-symbols-outlined">{jump.atTop ? 'arrow_downward' : 'arrow_upward'}</span>
        </button>
      )}
    </div>
  )
}

export function Sidebar() {
  const current = activeTab.value

  return (
    <div class="sidebar">
      <div class="sidebar-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            class={`tab-btn ${current === tab.id ? 'active' : ''}`}
            onClick={() => (activeTab.value = tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <TabPanel id="images"><ImagesTab /></TabPanel>
      <TabPanel id="generate"><GenerateTab /></TabPanel>
      <TabPanel id="templates"><TemplatesTab /></TabPanel>
      <TabPanel id="deliver"><DeliverTab /></TabPanel>
      <TabPanel id="plan"><PlanTab /></TabPanel>
      <TabPanel id="settings"><SettingsTab /></TabPanel>
    </div>
  )
}
