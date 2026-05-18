import { useState, useEffect, useRef } from 'react'
import { useAccount } from '@/contexts/AccountContext'
import { useAppStore } from '@/stores/appStore'
import { User, ChevronDown, CheckCircle2, RefreshCw } from 'lucide-react'

export function AccountSelector() {
  const { activeProvider, setActiveProvider } = useAppStore()
  const { activeAccount, accounts, loading, switchAccount, refreshAccounts } = useAccount()
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAccountDropdown(false)
        setShowProviderDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function switchProvider(providerId: string) {
    setActiveProvider(providerId)
    setShowProviderDropdown(false)
    // Refresh accounts for the new provider
    refreshAccounts()
  }

  const activeProviderName = activeProvider.charAt(0).toUpperCase() + activeProvider.slice(1)

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30" ref={dropdownRef}>
      <div className="relative">
        <button
          onClick={() => { setShowProviderDropdown(!showProviderDropdown); setShowAccountDropdown(false) }}
          className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md hover:bg-muted transition-colors"
        >
          <span className="font-medium text-foreground">{activeProviderName}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
        {showProviderDropdown && (
          <div className="absolute top-full left-0 mt-1 py-1 bg-popover border border-border rounded-md shadow-md z-50 min-w-[140px]">
            {['gemini', 'openai', 'claude'].map(p => (
              <button
                key={p}
                onClick={() => switchProvider(p)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors ${
                  activeProvider === p ? 'text-primary font-medium' : 'text-foreground'
                }`}
              >
                {activeProvider === p && <CheckCircle2 className="w-3 h-3" />}
                <span className={activeProvider === p ? '' : 'ml-5'}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <span className="text-xs text-muted-foreground">|</span>

      <div className="relative">
        <button
          onClick={() => { setShowAccountDropdown(!showAccountDropdown); setShowProviderDropdown(false) }}
          className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md hover:bg-muted transition-colors min-w-0"
          disabled={loading || accounts.length === 0}
        >
          <User className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span className="truncate max-w-[150px] text-foreground">
            {activeAccount ? (activeAccount.email || activeAccount.name || 'Account') : loading ? 'Loading...' : 'No account'}
          </span>
          <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        </button>
        {showAccountDropdown && accounts.length > 0 && (
          <div className="absolute top-full left-0 mt-1 py-1 bg-popover border border-border rounded-md shadow-md z-50 min-w-[220px] max-h-[200px] overflow-auto">
            <div className="px-3 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">Switch Account</div>
            {accounts.map(acc => {
              const isActive = acc.id === activeAccount?.id
              return (
                <button
                  key={acc.id}
                  onClick={() => switchAccount(acc.id)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors ${
                    isActive ? 'text-primary font-medium' : 'text-foreground'
                  }`}
                >
                  {isActive && <CheckCircle2 className="w-3 h-3 flex-shrink-0" />}
                  <span className={`truncate ${isActive ? '' : 'ml-5'}`}>
                    {acc.email || acc.name || acc.id}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <button
        onClick={refreshAccounts}
        disabled={loading}
        className="ml-auto p-1 rounded hover:bg-muted transition-colors"
        title="Refresh accounts"
      >
        <RefreshCw className={`w-3 h-3 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  )
}
