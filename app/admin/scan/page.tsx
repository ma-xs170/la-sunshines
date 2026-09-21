import type { Metadata } from 'next';
import { forbidden, redirect } from 'next/navigation';
import { getSession, hasRole } from '@/lib/auth/roles';
import { supabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { getAllEditions } from '@/lib/content';
import Scanner from '@/components/ticketing/Scanner';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Scan · LA SUNSHINES', robots: { index: false, follow: false } };

// Réservé au STAFF et aux ADMINS Supabase (le personnel de porte n'a pas le mot de passe /admin).
export default async function ScanPage() {
  const wrap = (body: React.ReactNode) => <main className="scan-page">{body}</main>;
  if (!supabaseConfigured() || !supabaseAdminConfigured()) return wrap(<p className="admin-hint">Supabase n’est pas configuré.</p>);
  const session = await getSession();
  if (!session) redirect('/connexion?next=/admin/scan');
  if (!hasRole(session.profile.role, 'staff')) forbidden();

  const db = createSupabaseAdminClient();
  const { data } = await db
    .from('ticketed_events')
    .select('id, event_slug, starts_at')
    .eq('status', 'published')
    .gte('starts_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .order('starts_at');
  const names = new Map(getAllEditions({ includeHidden: true }).map((e) => [e.slug, e.name]));
  const events = (data ?? []).map((e) => ({ id: e.id as string, name: names.get(e.event_slug) ?? e.event_slug, startsAt: e.starts_at as string }));

  return wrap(<Scanner events={events} />);
}
