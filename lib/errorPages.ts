// Cible du bouton « Retour à mon espace » des pages d'erreur : null si personne n'est connecté.
import 'server-only';
import { getOrgSession } from '@/lib/organizer/access';
import { getSession } from '@/lib/auth/roles';

export async function homeSpaceFor(): Promise<{ href: string; connected: boolean }> {
  try {
    const s = await getSession();
    if (!s) return { href: '/compte', connected: false };
    if (s.profile.role === 'admin') return { href: '/admin/gestion', connected: true };
    const o = await getOrgSession();
    return { href: o?.hasAccess ? '/organisateur' : '/compte', connected: true };
  } catch {
    return { href: '/compte', connected: false }; // base injoignable : la page d'erreur doit s'afficher quand même
  }
}
