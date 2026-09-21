import type { Metadata } from 'next';
import AdminsPanel, { type AdminRow } from '@/components/admin/AdminsPanel';
import { adminRpc, requireAdminPage } from '@/lib/adminSpace';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Administrateurs · Gestion', robots: { index: false, follow: false } };

export default async function AdminsPage() {
  const s = await requireAdminPage('/admin/gestion/administrateurs');
  const r = await adminRpc<AdminRow[]>('admin_accounts_list', { p_actor: s.userId });
  return (
    <>
      <h1 className="org-head__title">Administrateurs</h1>
      {r.ok ? <AdminsPanel initial={r.data} me={s.userId} /> : <div className="glass org-empty"><h3>Réservé au super-administrateur</h3><p>Seul un super-administrateur peut créer et gérer les comptes administrateurs.</p></div>}
    </>
  );
}
