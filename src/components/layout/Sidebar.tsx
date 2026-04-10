import { activeTab, type TabId } from '../../store'
import { ImagesTab } from '../tabs/ImagesTab'
import { GenerateTab } from '../tabs/GenerateTab'
import { TemplatesTab } from '../tabs/TemplatesTab'
import { PreviewTab } from '../tabs/PreviewTab'
import { DeliverTab } from '../tabs/DeliverTab'
import { PlanTab } from '../tabs/PlanTab'
import { SettingsTab } from '../tabs/SettingsTab'

const TABS: { id: TabId; label: string }[] = [
  { id: 'images', label: 'Images' },
  { id: 'generate', label: 'Generate' },
  { id: 'templates', label: 'Templates' },
  { id: 'preview', label: 'Preview' },
  { id: 'deliver', label: 'Deliver' },
  { id: 'plan', label: 'Plan' },
  { id: 'settings', label: 'Settings' },
]

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

      <div class={`tab-panel ${current === 'images' ? 'active' : ''}`}>
        <ImagesTab />
      </div>
      <div class={`tab-panel ${current === 'generate' ? 'active' : ''}`}>
        <GenerateTab />
      </div>
      <div class={`tab-panel ${current === 'templates' ? 'active' : ''}`}>
        <TemplatesTab />
      </div>
      <div class={`tab-panel ${current === 'preview' ? 'active' : ''}`}>
        <PreviewTab />
      </div>
      <div class={`tab-panel ${current === 'deliver' ? 'active' : ''}`}>
        <DeliverTab />
      </div>
      <div class={`tab-panel ${current === 'plan' ? 'active' : ''}`}>
        <PlanTab />
      </div>
      <div class={`tab-panel ${current === 'settings' ? 'active' : ''}`}>
        <SettingsTab />
      </div>
    </div>
  )
}
