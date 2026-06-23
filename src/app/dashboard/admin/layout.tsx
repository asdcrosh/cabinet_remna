import { requireStaffPage } from '@/lib/auth/admin-page'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireStaffPage()
  return children
}
