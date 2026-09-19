// Garde et coque communes des pages /admin/billetterie/* : compte Supabase de rôle ADMIN
// (le mot de passe /admin historique ne suffit pas).
import 'server-only';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/roles';
import { supabaseConfigured } from '@/lib/supabase/config';
import { supabaseAdminConfigured } from '@/lib/supabase/admin';

export async function BilletterieShell({ title, next, children, back = '/admin/billetterie', backLabel = '← Billetterie' }: {
  title: string; next: string; children: ReactNode; back?: string; backLabel?: string;
}) {
  const shell = (body: ReactNode) => (
    <main className="admin-shell admin-shell--wide">
      <div className="admin-top">
        <h1>{title}</h1>
        <div className="admin-top__actions"><a className="admin-link" href={back}>{backLabel}</a></div>
      </div>
      {body}
    </main>
  );
  if (!supabaseConfigured() || !supabaseAdminConfigured()) {
    return shell(<p className="admin-hint">Supabase n’est pas (entièrement) configuré : variables d’environnement manquantes.</p>);
  }
  const session = await getSession();
  if (!session) redirect(`/connexion?next=${encodeURIComponent(next)}`);
  if (session.profile.role !== 'admin') return shell(<p className="admin-hint">Accès refusé : ton compte n’a pas le rôle « admin ».</p>);
  return shell(children);
}
