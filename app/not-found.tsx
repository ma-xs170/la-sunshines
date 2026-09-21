import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { homeSpaceFor } from '@/lib/errorPages';

export const dynamic = 'force-dynamic';

export default async function NotFound() {
  const { href, connected } = await homeSpaceFor();
  return (
    <>
      <Nav />
      <main className="content-page">
        <PageHero
          eyebrow="Erreur 404"
          title="Page introuvable"
          lead="Cette page n’existe pas ou a été déplacée. Vérifie l’adresse, ou repars de l’accueil."
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a className="btn btn--amber" href="/">Retour à l’accueil</a>
          {connected && <a className="btn btn--outline" href={href}>Retour à mon espace</a>}
        </div>
      </main>
      <Footer />
    </>
  );
}
