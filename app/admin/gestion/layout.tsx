import type { ReactNode } from 'react';
import GlobalSearch from '@/components/admin/GlobalSearch';
import { requireAdminPage } from '@/lib/adminSpace';
import '../../organizer-shell.css';

export const dynamic = 'force-dynamic';

// Espace de gestion réservé aux administrateurs (chaque page revérifie aussi l'accès : un layout n'est pas rejoué à chaque navigation).
export default async function GestionLayout({ children }: { children: ReactNode }) {
  await requireAdminPage('/admin/gestion');
  return (
    <div className="agest">
      <header className="agest__bar">
        <nav className="agest__nav" aria-label="Gestion">
          <a href="/admin/gestion/organisateurs">Organisateurs</a><a href="/admin/gestion/evenements">Évènements</a><a href="/admin/gestion/calendrier">Calendrier</a><a href="/admin/gestion/support">Support</a><a href="/admin/gestion/transfert">Transfert</a>
          <a href="/admin/gestion/administrateurs">Administrateurs</a><a href="/admin/billetterie">Billetterie</a><a href="/admin">Contenu du site</a>
        </nav>
        <GlobalSearch />
      </header>
      <div className="org org-page" style={{ padding: 0 }}>{children}</div>
    </div>
  );
}
