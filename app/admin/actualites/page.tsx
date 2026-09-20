import type { Metadata } from 'next';
import { BilletterieShell } from '@/lib/ticketing/admin-page';
import NewsAdmin, { type AdminPost } from '@/components/admin/NewsAdmin';
import { getSession } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Actualités · Admin', robots: { index: false, follow: false } };

// Publication des actualités destinées aux organisateurs. Réservée au rôle « admin » (la coque redirige / refuse sinon).
export default async function NewsAdminPage() {
  return (
    <BilletterieShell title="Actualités" next="/admin/actualites" back="/admin" backLabel="← Admin">
      <Body />
    </BilletterieShell>
  );
}

async function Body() {
  const s = await getSession();
  const { data, error } = await createSupabaseAdminClient().rpc('news_admin_list', { p_actor: s?.userId });
  if (error) return <p className="admin-error" role="alert">Impossible de charger les actualités (la migration 012 est-elle appliquée ?).</p>;
  return <NewsAdmin posts={data as AdminPost[]} />;
}
