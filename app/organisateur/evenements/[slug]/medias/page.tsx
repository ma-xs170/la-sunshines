import type { Metadata } from 'next';
import VideoUpload from '@/components/organizer/event/VideoUpload';
import { loadEventPage } from '@/lib/organizer/event-page-data';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Médias · Espace organisateur', robots: { index: false, follow: false } };

export default async function MediaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data, title, flyer } = await loadEventPage(slug, `/organisateur/evenements/${slug}/medias`);
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Médias</h1><p className="script">{title}</p>
      <section className="glass ef-card">
        <h2>Affiche</h2>
        {flyer ? <p>Une affiche est enregistrée pour cet évènement. <Link href={`/organisateur/evenements/${slug}/flyer`}>Décliner l’affiche</Link></p> : <p className="org-muted">Aucune affiche. <Link href={`/organisateur/evenements/${slug}/flyer`}>Ajouter une affiche</Link></p>}
      </section>
      <section className="glass ef-card">
        <h2>Vidéo de l’affiche</h2>
        <VideoUpload slug={slug} media={data.media} />
      </section>
    </main>
  );
}
