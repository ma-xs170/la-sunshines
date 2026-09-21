import type { Metadata } from 'next';
import FlyerFormats from '@/components/organizer/event/FlyerFormats';
import { loadEventPage } from '@/lib/organizer/event-page-data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Décliner le flyer · Espace organisateur', robots: { index: false, follow: false } };

export default async function FlyerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { title, flyer } = await loadEventPage(slug, `/organisateur/evenements/${slug}/flyer`);
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Décliner le flyer</h1><p className="script">{title}</p>
      {flyer ? <FlyerFormats src={flyer} name={slug} /> : <p className="org-muted">Aucune affiche pour cet évènement : ajoute-la d’abord, puis reviens ici pour générer les formats Story, Carré et Bannière.</p>}
    </main>
  );
}
