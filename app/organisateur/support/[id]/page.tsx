import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import SupportChat from '@/components/support/SupportChat';
import { getOrgContext } from '@/lib/organizer/context';
import { supportRpc } from '@/lib/supportServer';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ticket · Espace organisateur', robots: { index: false, follow: false } };

export default async function SupportThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { s } = await getOrgContext();
  if (!s) redirect(`/connexion?next=/organisateur/support/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const r = await supportRpc<React.ComponentProps<typeof SupportChat>['initial']>('support_get', { p_actor: s.userId, p_id: id });
  if (!r.ok) notFound();   // pas participant : introuvable, jamais « interdit »
  return (<main className="org org-page"><p className="org__back"><Link href="/organisateur/support">← Historique du support</Link></p><SupportChat initial={r.data} /></main>);
}
