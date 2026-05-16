import { create } from 'zustand'
import { testCapability } from '@/lib/messaging'

export type SyncMode = 'sync-all' | 'sync-latest' | 'auto-sync' | 'manual-only'

interface SettingsState {
  manualSync: boolean
  syncMode: SyncMode
  syncLastN: number
  summaryOrgId: string
  batchSize: number
  maxLimit: number
  maxPages: number
  rateLimitWindowMs: number
  rateLimitMaxRequests: number
  rateLimitMinGapMs: number
  rateLimitAutoResetMs: number
  isLoaded: boolean

  setManualSync: (v: boolean) => void
  setSyncMode: (v: SyncMode) => void
  setSyncLastN: (v: number) => void
  setSummaryOrgId: (v: string) => void
  setBatchSize: (v: number) => void
  setMaxLimit: (v: number) => void
  setMaxPages: (v: number) => void
  setRateLimitWindowMs: (v: number) => void
  setRateLimitMaxRequests: (v: number) => void
  setRateLimitMinGapMs: (v: number) => void
  setRateLimitAutoResetMs: (v: number) => void
  loadSettings: () => Promise<void>
  saveSettings: () => Promise<void>
}

const defaults = {
  manualSync: false,
  syncMode: 'auto-sync' as SyncMode,
  syncLastN: 50,
  summaryOrgId: '',
  batchSize: 100,
  maxLimit: 500,
  maxPages: 50,
  rateLimitWindowMs: 10000,
  rateLimitMaxRequests: 5,
  rateLimitMinGapMs: 1000,
  rateLimitAutoResetMs: 300000,
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,
  isLoaded: false,

  setManualSync: (v) => set({ manualSync: v }),
  setSyncMode: (v) => set({ syncMode: v }),
  setSyncLastN: (v) => set({ syncLastN: v }),
  setSummaryOrgId: (v) => set({ summaryOrgId: v }),
  setBatchSize: (v) => set({ batchSize: v }),
  setMaxLimit: (v) => set({ maxLimit: v }),
  setMaxPages: (v) => set({ maxPages: v }),
  setRateLimitWindowMs: (v) => set({ rateLimitWindowMs: v }),
  setRateLimitMaxRequests: (v) => set({ rateLimitMaxRequests: v }),
  setRateLimitMinGapMs: (v) => set({ rateLimitMinGapMs: v }),
  setRateLimitAutoResetMs: (v) => set({ rateLimitAutoResetMs: v }),

  loadSettings: async () => {
    const settings = await testCapability('GET_SETTINGS')
    if (settings) {
      set({
        manualSync: settings['settings.general.manualSync'] ?? defaults.manualSync,
        syncMode: settings['settings.sync.mode'] ?? defaults.syncMode,
        syncLastN: settings['settings.sync.lastN'] ?? defaults.syncLastN,
        summaryOrgId: settings['settings.summary.orgId'] ?? defaults.summaryOrgId,
        batchSize: settings['settings.pagination.batchSize'] ?? defaults.batchSize,
        maxLimit: settings['settings.pagination.maxLimit'] ?? defaults.maxLimit,
        maxPages: settings['settings.pagination.maxPages'] ?? defaults.maxPages,
        rateLimitWindowMs: settings['settings.rateLimit.windowMs'] ?? defaults.rateLimitWindowMs,
        rateLimitMaxRequests: settings['settings.rateLimit.maxRequests'] ?? defaults.rateLimitMaxRequests,
        rateLimitMinGapMs: settings['settings.rateLimit.minGapMs'] ?? defaults.rateLimitMinGapMs,
        rateLimitAutoResetMs: settings['settings.rateLimit.autoResetMs'] ?? defaults.rateLimitAutoResetMs,
        isLoaded: true,
      })
    }
  },

  saveSettings: async () => {
    const state = get()
    const settings = {
      'settings.general.manualSync': state.manualSync,
      'settings.sync.mode': state.syncMode,
      'settings.sync.lastN': state.syncLastN,
      'settings.summary.orgId': state.summaryOrgId,
      'settings.pagination.batchSize': state.batchSize,
      'settings.pagination.maxLimit': state.maxLimit,
      'settings.pagination.maxPages': state.maxPages,
      'settings.rateLimit.windowMs': state.rateLimitWindowMs,
      'settings.rateLimit.maxRequests': state.rateLimitMaxRequests,
      'settings.rateLimit.minGapMs': state.rateLimitMinGapMs,
      'settings.rateLimit.autoResetMs': state.rateLimitAutoResetMs,
    }
    await testCapability('SET_SETTINGS', { settings })
  },
}))
