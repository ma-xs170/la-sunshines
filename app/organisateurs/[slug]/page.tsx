import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import FollowButton from '@/components/FollowButton';
import OrganizerAvatar from '@/components/OrganizerAvatar';
import { ArtistNameList } from '@/components/ArtistName';
import { getEditionBySlug } from '@/lib/content';
import { getPublicOrganizer } from '@/lib/publicOrganizer';
import { formatEditionDate } from '@/lib/format';
import { NETWORKS } from '@/lib/socialLinks';

export const revalidate = 60;   // filet de sécurité : l'invalidation réelle est immédiate (revalidatePublicSite)
type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const o = await getPublicOrganizer((await params).slug);
  if (!o) return { title: 'Organisateur · LA SUNSHINES', robots: { index: false } };
  return { title: `${o.name} · LA SUNSHINES`, description: o.description.slice(0, 160) || `Les évènements de ${o.name} sur LA SUNSHINES.`, alternates: { canonical: `/organisateurs/${o.slug}` } };
}

export default async function OrganizerPublicPage({ params }: { params: Promise<Params> }) {
  const o = await getPublicOrganizer((await params).slug);
  if (!o) notFound();
  const eds = o.events.map((e) => ({ ...e, ed: getEditionBySlug(e.slug) })).filter((e) => e.ed);
  const upcoming = eds.filter((e) => e.upcoming).reverse(); const past = eds.filter((e) => !e.upcoming);
  // artistes déjà programmés : liens automatiques vers leurs pages (noms en MAJUSCULES et gras, comme partout sur le site)
  const artists = [...new Set(eds.flatMap((e) => [...(e.ed!.headliner ? e.ed!.headliner.split('·').map((x) => x.trim()) : []), ...(e.ed!.lineup ?? [])]).filter(Boolean))].slice(0, 40);
  const ld = { '@context': 'https://schema.org', '@type': 'Organization', name: o.name, description: o.description || undefined, url: o.website || undefined, logo: o.logo_url || undefined, sameAs: Object.values(o.socials) };
  return (
    <>
      <Nav />
      <main className="content-page opage">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
        <header className="opage__head" style={o.banner_url ? { backgroundImage: `linear-gradient(rgba(25,20,16,.25),rgba(25,20,16,.55)), url(${o.banner_url})` } : undefined}>
          <OrganizerAvatar name={o.name} src={o.logo_url} size={96} />
          <div><h1>{o.name}</h1><p className="script">Organisateur</p></div>
          <FollowButton slug={o.slug} />
        </header>
        {o.description && <p className="opage__desc">{o.description}</p>}
        <p className="opage__links">{o.website && <a href={o.website} target="_blank" rel="noopener noreferrer">Site web</a>}{NETWORKS.filter((n) => o.socials[n.id]).map((n) => <a key={n.id} href={o.socials[n.id]} target="_blank" rel="noopener noreferrer">{n.label}</a>)}</p>
        <section aria-labelledby="up"><h2 id="up">Évènements à venir</h2>
          {upcoming.length === 0 ? <p className="org-muted">Aucun évènement annoncé pour l’instant.</p> : <ul className="opage__list">{upcoming.map((e) => <li key={e.slug}><Link href={`/editions/${e.slug}`}><strong>{e.ed!.name}</strong><span>{formatEditionDate(e.ed!.dateISO)}</span></Link></li>)}</ul>}</section>
        <section aria-labelledby="past"><h2 id="past">Évènements passés</h2>
          {past.length === 0 ? <p className="org-muted">Pas encore d’évènement passé sur le site.</p> : <ul className="opage__list">{past.map((e) => <li key={e.slug}><Link href={`/editions/${e.slug}`}><strong>{e.ed!.name}</strong><span>{formatEditionDate(e.ed!.dateISO)}</span></Link></li>)}</ul>}</section>
        {artists.length > 0 && <section aria-labelledby="art"><h2 id="art">Artistes et DJs programmés</h2><p className="opage__artists"><ArtistNameList value={artists.join(' · ')} /></p></section>}
      </main>
      <Footer />
    </>
  );
}
