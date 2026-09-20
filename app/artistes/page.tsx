import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { getArtistProfiles } from '@/lib/artistProfiles';

export const metadata: Metadata = {
  title: 'Artistes · LA SUNSHINES',
  robots: { index: false, follow: true },
};

const NOTICE: Record<string, string> = {
  expire:
    'Ce lien de connexion a expiré ou a déjà été utilisé. Ouvre ta page artiste ci-dessous et clique sur « Vous êtes cet artiste ? » pour recevoir un nouveau lien.',
  invalide: 'Ce lien de connexion n’est pas valide. Ouvre ta page artiste ci-dessous pour en demander un nouveau.',
};

// Point d'arrivée après un lien de connexion artiste refusé (/api/artist/login redirige ici) et index des profils.
export default async function ArtistsPage({ searchParams }: { searchParams: Promise<{ login?: string }> }) {
  const { login } = await searchParams;
  const notice = login ? NOTICE[login] : undefined;
  const artists = [...getArtistProfiles()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return (
    <>
      <Nav />
      <main className="legal content-page">
        <PageHero eyebrow="Les artistes" title="Nos artistes" lead="Retrouve la page de chaque artiste des soirées LA SUNSHINES." />
        <div className="legal__body glass">
          {notice && <p role="alert"><strong>{notice}</strong></p>}
          {artists.length === 0 ? (
            <p>Les pages artistes arrivent bientôt.</p>
          ) : (
            <ul>
              {artists.map((a) => (
                <li key={a.slug}><a href={`/artistes/${a.slug}`}>{a.name}</a></li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
