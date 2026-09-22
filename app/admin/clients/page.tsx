import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import ClientsList from '@/components/admin/clients/ClientsList';
import { requireClientsPage } from '@/lib/admin/clients/access';
import { pageCount } from '@/lib/admin/clients/pagination';
import { PAGE_SIZE, clientsHref, parseClientsQuery, rpcArgs, type ClientsPage } from '@/lib/admin/clients/query';
import { adminRpc } from '@/lib/adminSpace';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Clients · Administration', robots: { index: false, follow: false, nocache: true } };

// Recherche, filtres, tri, pagination et total sont calculés par la base (admin_list_customers) : jamais dans le navigateur. Le texte cherché n'est jamais journalisé.
export default async function ClientsPageRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const a = await requireClientsPage();
  const query = parseClientsQuery(await searchParams);
  const r = await adminRpc<ClientsPage>('admin_list_customers', { p_actor: a.userId, ...rpcArgs(query) });
  if (r.ok) { const last = pageCount(r.data.total, PAGE_SIZE); if (last > 0 && query.page > last) redirect(clientsHref({ ...query, page: last })); }
  return <ClientsList query={query} data={r.ok ? r.data : null} error={r.ok ? null : r.message} isSuper={a.isSuper} />;
}
