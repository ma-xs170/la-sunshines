import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import NewTicketForm from '@/components/support/NewTicketForm';
import { getOrgContext } from '@/lib/organizer/context';
import { one } from '@/lib/organizer/event-data';
import { can } from '@/lib/organizer/roles';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Créer un ticket · Espace organisateur', robots: { index: false, follow: false } };

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { s, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur/support/nouveau');
  if (!s.hasAccess || !current || !can(current.my_role, 'manage')) redirect('/organisateur');
  const page = one((await searchParams).page); const safe = page.startsWith('/organisateur') ? page.slice(0, 200) : '';
  return (<main className="org org-page"><h1 className="org-head__title">Créer un ticket</h1><p className="script">{current.name}</p><NewTicketForm org={current.id} reference={current.reference} page={safe} /></main>);
}
