import type { Metadata } from 'next';
import { adminConfigured, isAuthed } from '@/lib/adminAuth';
import { readStore } from '@/lib/store';
import { getAllEditions } from '@/lib/content';
import { editions as staticEditions } from '@/lib/editions';
import { getBizoukEmbed } from '@/lib/bizouk';
import { normalizeArtistName } from '@/lib/artists';
import AdminLogin from '@/components/admin/AdminLogin';
import AdminDashboard from '@/components/admin/AdminDashboard';
import { pageviewSummary } from '@/lib/pageviews';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin · LA SUNSHINES',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  if (!adminConfigured()) {
    return (
      <main className="admin-shell">
        <div className="admin-card glass">
          <h1>Administration</h1>
          <p className="admin-hint">
            Définis <code>ADMIN_PASSWORD</code> dans <code>.env.local</code> puis
            redémarre le serveur pour activer l’accès.
          </p>
        </div>
      </main>
    );
  }

  if (!(await isAuthed())) {
    return <AdminLogin />;
  }

  const store = await readStore();
  const staticSlugs = new Set(staticEditions.map((e) => e.slug));
  const eventBySlug = new Map(store.events.map((e) => [e.slug, e]));

  // Liste fusionnée (statiques + admin) : sert au dropdown « gérer un événement »
  // (pré-remplissage du formulaire) ET à la gestion des galeries par slug.
  const editions = getAllEditions({ includeHidden: true }).map((e) => {
    const se = eventBySlug.get(e.slug);
    const hl = (e.headliner ?? '')
      .split(/\s*·\s*/)
      .map((n) => normalizeArtistName(n))
      .filter(Boolean);
    return {
      slug: e.slug,
      name: e.name,
      emoji: e.emoji,
      gallery: e.gallery ?? [],
      isStatic: staticSlugs.has(e.slug),
      storeId: se?.id ?? null,
      hidden: e.hidden === true,
      archived: e.archived === true,
      schedule: Array.isArray(e.schedule) ? e.schedule : [],
      description: se?.description ?? e.tagline ?? '',
      // valeurs de pré-remplissage du formulaire d'édition
      date: se ? se.date : (e.dateISO ?? ''),
      time: se ? (se.time ?? '') : (e.timeLabel ?? ''),
      venue: e.venue ?? '',
      dresscode: e.dresscode ?? '',
      headliner: e.headliner ?? '',
      // le line-up du formulaire = artistes secondaires (hors têtes d'affiche)
      lineup: (e.lineup ?? []).filter(
        (n) => !hl.includes(normalizeArtistName(n)),
      ),
      bizoukEmbed: se ? (se.bizoukEmbed ?? '') : (getBizoukEmbed(e.slug) ?? ''),
      flyer: e.flyer ?? '',
      flyerW: e.flyerSize?.w ?? 0,
      flyerH: e.flyerSize?.h ?? 0,
      dominantColor: e.dominantColor ?? null,
      palette: e.palette ?? [],
    };
  });
  const analytics = await pageviewSummary(7, 10);

  return (
    <AdminDashboard
      initialStore={store}
      editions={editions}
      analytics={analytics}
    />
  );
}
