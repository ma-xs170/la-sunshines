import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SupportChat from '@/components/support/SupportChat';
import { requireAdminPage } from '@/lib/adminSpace';
import { supportRpc } from '@/lib/supportServer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ticket · Gestion', robots: { index: false, follow: false } };

export default async function AdminSupportThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const s = await requireAdminPage(`/admin/gestion/support/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [r, quick, adm] = await Promise.all([supportRpc<React.ComponentProps<typeof SupportChat>['initial']>('support_get', { p_actor: s.userId, p_id: id }), supportRpc<{ id: string; title: string; body: string }[]>('support_quick_replies', { p_actor: s.userId }),
    supportRpc<{ user_id: string; first_name: string; last_name: string; active: boolean }[]>('admin_accounts_list', { p_actor: s.userId })]);
  if (!r.ok) notFound();
  const admins = adm.ok ? adm.data.filter((a) => a.active && a.user_id !== s.userId).map((a) => ({ id: a.user_id, name: `${a.first_name} ${a.last_name}`.trim() })) : [];
  return (<><p className="org__back"><a href="/admin/gestion/support">← Tous les tickets</a></p><SupportChat initial={r.data} admins={admins} quick={quick.ok ? quick.data : []} /></>);
}
