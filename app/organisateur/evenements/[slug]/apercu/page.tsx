import type { Metadata } from 'next';
import Image from 'next/image';
import { emptyDetails, loadEventPage } from '@/lib/organizer/event-page-data';
import { orgRpc, type OrgTiers } from '@/lib/organizer/data';
import { eventLinks } from '@/lib/organizer/event-links';
import { getAllEditions } from '@/lib/content';
import CopyLink from '@/components/organizer/CopyLink';
import FreeBadge from '@/components/ticketing/FreeBadge';
import { formatEuro, formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Aperçu · Espace organisateur', robots: { index: false, follow: false } };

/** Aperçu PRIVÉ d'un évènement (brouillon ou non) : accessible seulement aux membres de l'organisation et aux admins (contrôle SQL org_event_details), jamais indexé. */
export default async function PreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { s, data, title, flyer } = await loadEventPage(slug, `/organisateur/evenements/${slug}/apercu`);
  const d = { ...emptyDetails(), ...(data.details ?? {}) };
  const links = eventLinks(slug, data.event.status === 'published', getAllEditions().some((e) => e.slug === slug));
  const tr = await orgRpc<OrgTiers>('org_tiers', { p_actor: s.userId, p_slug: slug });
  const tiers = tr.ok ? tr.data.tiers.filter((t) => !t.archived && t.is_active) : [];
  const venue = data.venues.find((v) => v.id === data.sessions[0]?.venue_id) ?? data.venues[0];
  return (
    <main className="org org-page">
      <p className="org__back"><a href={`/organisateur/evenements/${slug}`}>← Retour au tableau de bord</a></p>
      <p><span className="preview-badge">Aperçu</span> <span className="org-muted">Visible seulement des membres de l’organisation et des admins. Le public ne voit rien tant que l’évènement n’est pas publié.</span></p>
      <h1 className="org-head__title">{title}</h1>
      {d.subtitle && <p className="script">{d.subtitle}</p>}
      <p className="org-muted">{formatGp(data.event.starts_at)}{venue ? ` · ${venue.name}${venue.city ? ', ' + venue.city : ''}` : ''}</p>
      {flyer && <Image src={flyer} alt={`Affiche de ${title}`} width={480} height={600} style={{ maxWidth: '100%', height: 'auto', borderRadius: 12 }} unoptimized />}
      {d.description ? <section className="glass org-panel"><h2>Description</h2><p style={{ whiteSpace: 'pre-wrap' }}>{d.description}</p></section> : <section className="glass org-empty"><h3>Pas encore de description</h3><p><a href={`/organisateur/evenements/${slug}/description`}>Ajouter une description</a></p></section>}
      <section className="glass org-panel">
        <h2>Billets</h2>
        {tiers.length === 0 ? <p className="org-muted">Aucun tarif en vente pour le moment.</p> : (
          <ul>{tiers.map((t) => <li key={t.id}><strong>{t.name}</strong> — {t.price_cents === 0 ? <FreeBadge /> : formatEuro(t.price_cents)}{t.description ? ` · ${t.description}` : ''}</li>)}</ul>
        )}
      </section>
      <section className="glass evlink">
        <div><h2>Lien public</h2><p><code>{links.publicUrl}</code></p>{!links.live && <p className="org-muted">Ce lien sera actif après publication.</p>}</div>
        <div className="evlink__row"><CopyLink value={links.publicUrl} />{!links.live && <CopyLink value={links.previewUrl} label="Copier le lien d’aperçu" />}</div>
      </section>
    </main>
  );
}
