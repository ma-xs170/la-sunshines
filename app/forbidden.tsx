import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { homeSpaceFor } from '@/lib/errorPages';

export const dynamic = 'force-dynamic';

// Affichée par forbidden() : le rôle du compte ne permet pas cette page (les données d'un autre organisateur restent en 404).
export default async function Forbidden() {
  const { href, connected } = await homeSpaceFor();
  return (
    <>
      <Nav />
      <main className="content-page">
        <PageHero
          eyebrow="Erreur 403"
          title="Accès refusé"
          lead={connected ? 'Ton compte n’a pas les droits nécessaires pour ouvrir cette page. Tu peux changer de compte si tu en as un autre.' : 'Cette page demande de se connecter avec un compte autorisé.'}
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a className="btn btn--amber" href="/connexion">{connected ? 'Changer de compte' : 'Se connecter'}</a>
          {connected && <a className="btn btn--outline" href={href}>Retour à mon espace</a>}
          <a className="btn btn--outline" href="/">Retour à l’accueil</a>
        </div>
      </main>
      <Footer />
    </>
  );
}
