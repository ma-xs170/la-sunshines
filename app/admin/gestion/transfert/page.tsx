import type { Metadata } from 'next';
import TransferForm from '@/components/admin/TransferForm';
import { adminRpc, requireAdminPage } from '@/lib/adminSpace';
import { one } from '@/lib/organizer/event-data';
import { getAllEditions } from '@/lib/content';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Transfert d’évènement · Gestion', robots: { index: false, follow: false } };

export default async function TransferPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireAdminPage('/admin/gestion/transfert');
  const sp = await searchParams;
  const r = await adminRpc<{ slug: string; organizer: string; organizer_id: string }[]>('admin_all_events', { p_actor: s.userId });
  const names = new Map(getAllEditions({ includeHidden: true }).map((e) => [e.slug, e.name]));
  const from = one(sp.from);
  const events = (r.ok ? r.data : []).filter((e) => !from || e.organizer_id === from).map((e) => ({ slug: e.slug, label: `${names.get(e.slug) ?? e.slug} — ${e.organizer}` }));
  return (<><h1 className="org-head__title">Transfert d’évènement</h1><TransferForm events={events} initial={one(sp.slug)} /></>);
}
