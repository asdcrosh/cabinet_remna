'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { PublicBrandSettings } from '@/lib/branding'

const defaultSettings: PublicBrandSettings = {
  logoUrl: null,
  accentColor: '#d832d4',
  accentSecondaryColor: '#5424bc',
}

const BrandingContext = createContext<PublicBrandSettings>(defaultSettings)

export function BrandingProvider({ settings, children }: { settings: PublicBrandSettings; children: ReactNode }) {
  return <BrandingContext.Provider value={settings}>{children}</BrandingContext.Provider>
}

export function useBranding() {
  return useContext(BrandingContext)
}
