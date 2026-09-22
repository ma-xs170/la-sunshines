/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // forbidden() + app/forbidden.tsx : page « Accès refusé » (403) au lieu d'un 404 quand le rôle ne suffit pas.
  experimental: { authInterrupts: true },

  // Dossier de sortie séparé pour les builds lancés à la main (NEXT_DIST_DIR=.next-build),
  // afin de ne jamais corrompre le .next du serveur de dev. Par défaut (Vercel) : .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',

  // data/content.json est lu à l'exécution via un chemin calculé
  // (path.join(process.cwd(), 'data', 'content.json')) que le file-tracer de
  // Next ne détecte pas seul. On force son inclusion dans TOUTES les fonctions
  // serverless → readStore()/readStoreSync() fonctionnent aussi pour le rendu à
  // la demande (nouvelles éditions /editions/[slug], API /admin) sans attendre
  // un rebuild qui rebundlerait le fichier.
  // Page « Clients » : jamais de cache, jamais indexée, aucun référent envoyé (les URL portent la recherche : nom, e-mail, téléphone).
  async headers() {
    const priv = [
      { key: 'Cache-Control', value: 'no-store, max-age=0' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
    ];
    return [{ source: '/admin/clients/:path*', headers: priv }, { source: '/admin/clients', headers: priv }, { source: '/api/admin-clients/:path*', headers: priv }, { source: '/api/admin-clients', headers: priv }];
  },

  outputFileTracingIncludes: {
    '/**': ['./data/content.json'],
    // billets PDF : polices du site (assets/fonts), logo et flyers lus à l'exécution (chemins calculés, invisibles du tracer)
    '/api/tickets/**': ['./assets/fonts/**', './public/images/logo-dark.png', './public/images/editions/**'],
    '/api/orders/**': ['./assets/fonts/**', './public/images/logo-dark.png', './public/images/editions/**'],
    '/api/stripe/webhook': ['./assets/fonts/**', './public/images/logo-dark.png', './public/images/editions/**'],
    '/api/billetterie/**': ['./assets/fonts/**', './public/images/logo-dark.png', './public/images/editions/**'],
    '/api/organisateur/**': ['./assets/fonts/**', './public/images/logo-dark.png', './public/images/editions/**'],
  },
};

export default nextConfig;
