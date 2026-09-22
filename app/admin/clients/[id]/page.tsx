import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import ClientDetailView from '@/components/admin/clients/ClientDetail';
import { requireClientsPage } from '@/lib/admin/clients/access';
import type { ClientDetail } from '@/lib/admin/clients/detail';
import { adminRpc } from '@/lib/adminSpace';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Fiche client · Administration', robots: { index: false, follow: false, nocache: true } };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const a = await requireClientsPage();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const r = await adminRpc<ClientDetail>('admin_customer_detail', { p_actor: a.userId, p_id: id });
  if (!r.ok) { if (r.status === 404 || r.status === 403) notFound(); return <div className="glass org-empty" role="alert"><h3>Impossible de charger cette fiche</h3><p>{r.message}</p></div>; }
  return <ClientDetailView id={id} initial={r.data} isSuper={a.isSuper} />;
}
