'use client'

// Поиск ⌘K в боковом меню админки нового дизайна.

import { useMemo } from 'react'
import type { FeatureFlags } from '@/lib/feature-flags'
import type { UserRole } from '@/components/dashboard/dashboard-nav-config'
import { getAdminCommandItems, getAdminSectionsV2 } from '@/components/dashboard/dashboard-nav-v2-config'
import { AdminCommandPalette } from './admin-command-palette'

export function AdminSidebarSearch({ role, features }: { role: UserRole; features: FeatureFlags }) {
  const items = useMemo(() => getAdminCommandItems(getAdminSectionsV2(role, features)), [role, features])
  // Поиск клиентов и платежей доступен только администраторам: модераторам API отвечает 403.
  const canSearch = role === 'ADMIN' || role === 'SUPER_ADMIN'
  return <AdminCommandPalette items={items} canSearch={canSearch} />
}
