import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { adminConfigured, isAuthed } from '@/lib/adminAuth';
import { readStore } from '@/lib/store';
import { listSupportTickets } from '@/lib/supportTickets';
import { getArtistEmails, listVerifications } from '@/lib/privateData';
import { getAllEditions } from '@/lib/content';
import { editions as staticEditions } from '@/lib/editions';
import { getBizoukEmbed } from '@/lib/bizouk';
import { normalizeArtistName } from '@/lib/artists';
import AdminLogin from '@/components/admin/AdminLogin';
import AdminDashboard, { type TabId } from '@/components/admin/AdminDashboard';
import { getAdminShellData } from '@/lib/admin/shell-data';
import { pageviewSummary } from '@/lib/pageviews';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Contenu du site · Admin · LA SUNSHINES',
  robots: { index: false, follow: false },
};

const TABS: TabId[] = ['dashboard', 'events', 'events-create', 'artists', 'verifications', 'announcements', 'tickets'];

// Ancien panneau /admin (éditions, artistes, programme, annonces, règlement, infos…) : conservé tel quel, accès par mot de passe historique ; un compte administrateur actif reçoit le même cookie automatiquement (/api/admin/grant).
export default async function AdminContentPage({ searchParams }: { searchParams: Promise<{ edit?: string | string[]; onglet?: string | string[] }> }) {
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
    if (await getAdminShellData().catch(() => null)) {
      const sp = await searchParams;
      const q = new URLSearchParams();
      for (const k of ['onglet', 'edit'] as const) { const v = Array.isArray(sp[k]) ? sp[k][0] : sp[k]; if (v && /^[a-z0-9-]{1,100}$/.test(v)) q.set(k, v); }
      redirect(`/api/admin/grant?next=${encodeURIComponent('/admin/contenu' + (q.toString() ? `?${q}` : ''))}`);
    }
    return <AdminLogin />;
  }

  const store = await readStore();
  // Les demandes de support vivent dans Supabase (privé), pas dans content.json.
  store.tickets = await listSupportTickets();
  // Idem pour les emails d'artistes et les demandes de vérification (jamais dans le dépôt public).
  const artistEmails = await getArtistEmails();
  store.artists = store.artists.map((a) => ({ ...a, email: artistEmails[a.slug] ?? '' }));
  store.verificationRequests = await listVerifications();
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
  // lien profond : /admin?edit=<slug> ouvre directement l'événement dans l'onglet Événements
  const editParam = (await searchParams).edit;
  const edit = (Array.isArray(editParam) ? editParam[0] : editParam) ?? '';

  const ongletParam = (await searchParams).onglet;
  const onglet = (Array.isArray(ongletParam) ? ongletParam[0] : ongletParam) ?? '';
  const initialTab = TABS.find((t) => t === onglet);
  const embedded = Boolean(await getAdminShellData().catch(() => null));
  return (
    <AdminDashboard
      key={`${initialTab ?? ''}|${edit}`}
      embedded={embedded}
      initialTab={initialTab}
      initialEdit={/^[a-z0-9][a-z0-9-]{0,98}$/.test(edit) ? edit : undefined}
      initialStore={store}
      editions={editions}
      analytics={analytics}
    />
  );
}
