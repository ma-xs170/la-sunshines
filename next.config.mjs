/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // data/content.json est lu à l'exécution via un chemin calculé
  // (path.join(process.cwd(), 'data', 'content.json')) que le file-tracer de
  // Next ne détecte pas seul. On force son inclusion dans TOUTES les fonctions
  // serverless → readStore()/readStoreSync() fonctionnent aussi pour le rendu à
  // la demande (nouvelles éditions /editions/[slug], API /admin) sans attendre
  // un rebuild qui rebundlerait le fichier.
  outputFileTracingIncludes: {
    '/**': ['./data/content.json'],
  },
};

export default nextConfig;
