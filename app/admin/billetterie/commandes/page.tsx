import type { Metadata } from 'next';
import { BilletterieShell } from '@/lib/ticketing/admin-page';
import { getAllEditions } from '@/lib/content';
import OrdersList from '@/components/ticketing/admin/OrdersList';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Commandes · Billetterie', robots: { index: false, follow: false } };

export default async function CommandesPage() {
  const events = getAllEditions({ includeHidden: true }).map((e) => ({ slug: e.slug, name: e.name }));
  return <BilletterieShell title="Commandes" next="/admin/billetterie/commandes"><OrdersList events={events} /></BilletterieShell>;
}
