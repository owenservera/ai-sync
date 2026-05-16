import { useEffect, useState } from 'react'
import { OverviewPanel } from '@/components/OverviewPanel'
import { ConversationsPanel } from '@/components/ConversationsPanel'
import { CapabilitiesPanel } from '@/components/CapabilitiesPanel'
import { SettingsPanel } from '@/components/SettingsPanel'
import { NetworkLogPanel } from '@/components/NetworkLogPanel'
import { useAppStore } from '@/stores/appStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { LayoutDashboard, MessageSquare, TestTube2, Settings, Network, ChevronLeft, ChevronRight } from 'lucide-react'

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'conversations', label: 'Conversations', icon: MessageSquare },
  { id: 'capabilities', label: 'Test', icon: TestTube2 },
  { id: 'network', label: 'Network', icon: Network },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function App() {
  const { activeTab, setActiveTab } = useAppStore()
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const activeItem = NAV_ITEMS.find(i => i.id === activeTab)
  const ActiveIcon = activeItem?.icon || LayoutDashboard

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <nav className={`flex-shrink-0 border-r border-border bg-card transition-all duration-200 ${sidebarOpen ? 'w-48' : 'w-12'}`}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          {sidebarOpen && <span className="text-sm font-semibold truncate">Conversation Archive</span>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 rounded hover:bg-muted">
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
        <div className="py-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
                  activeTab === item.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </button>
            )
          })}
        </div>
      </nav>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-2">
            <ActiveIcon className="w-4 h-4 text-muted-foreground" />
            <h1 className="text-sm font-semibold">{activeItem?.label}</h1>
          </div>
          <span className="text-xs text-muted-foreground">v0.2.0</span>
        </header>

        <div className="flex-1 overflow-auto">
          {activeTab === 'overview' && <OverviewPanel />}
          {activeTab === 'conversations' && <ConversationsPanel />}
          {activeTab === 'capabilities' && <CapabilitiesPanel />}
          {activeTab === 'network' && <NetworkLogPanel />}
          {activeTab === 'settings' && <SettingsPanel />}
        </div>
      </main>
    </div>
  )
}
