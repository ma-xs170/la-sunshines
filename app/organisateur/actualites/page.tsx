import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import NewsFeed from '@/components/organizer/NewsFeed';
import { getOrgContext } from '@/lib/organizer/context';
import { newsFor } from '@/lib/organizer/news';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Actualités · Espace organisateur', robots: { index: false, follow: false } };

// Nouveautés du site, envoyées par l'équipe. Les organisateurs ne peuvent que lire (publication : /admin/actualites).
export default async function NewsPage() {
  const { s, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur/actualites');
  if (!s.hasAccess || !current) redirect('/organisateur');
  const items = await newsFor(s.userId);
  return (
    <main className="org org-page">
      <div className="org-head">
        <div>
          <h1 className="org-head__title">Actualités</h1>
          <p className="script">Ce qui change sur le site.</p>
        </div>
      </div>
      {items === null ? <p className="admin-error" role="alert">Impossible de charger les actualités pour l’instant.</p> : <NewsFeed items={items} />}
    </main>
  );
}
