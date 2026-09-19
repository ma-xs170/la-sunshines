import type { Metadata } from 'next';
import { z } from 'zod';
import { notFound } from 'next/navigation';
import { BilletterieShell } from '@/lib/ticketing/admin-page';
import OrderDetail from '@/components/ticketing/admin/OrderDetail';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Commande · Billetterie', robots: { index: false, follow: false } };

export default async function CommandePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return (
    <BilletterieShell title="Commande" next={`/admin/billetterie/commandes/${id}`} back="/admin/billetterie/commandes" backLabel="← Commandes">
      <OrderDetail id={id} />
    </BilletterieShell>
  );
}
