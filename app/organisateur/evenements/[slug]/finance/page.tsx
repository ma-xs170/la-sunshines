import type { Metadata } from 'next';
import { orgEventRpc } from '@/lib/organizer/event-data';
import { formatEuro } from '@/lib/ticketing/time';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Finance · Espace organisateur', robots: { index: false, follow: false } };
export interface Finance { gross_cents: number; fees_cents: number; refunded_cents: number; net_cents: number; paid_out_cents: number; remaining_cents: number; payouts: { amount_cents: number; paid_on: string; note: string }[] }

export default async function FinancePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: f, title } = await orgEventRpc<Finance>(slug, `/organisateur/evenements/${slug}/finance`, 'org_finance');
  const cards: [string, number, string][] = [['Recette brute', f.gross_cents, 'payée par les acheteurs, frais compris'], ['Frais de service', f.fees_cents, 'part de la plateforme'], ['Remboursements', f.refunded_cents, 'rendus aux acheteurs'],
    ['Recette nette', f.net_cents, 'pour l’organisation'], ['Déjà versé', f.paid_out_cents, 'virements enregistrés'], ['Reste à verser', f.remaining_cents, 'à recevoir']];
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Récapitulatif financier</h1><p className="script">{title}</p>
      <section className="org-kpis" aria-label="Chiffres financiers">{cards.map(([k, v, s]) => <div className="glass org-kpi" key={k}><span className="kicker">{k}</span><strong>{formatEuro(v)}</strong><span>{s}</span></div>)}</section>
      <p className="org-muted">Les versements sont faits à la main par l’équipe LA SUNSHINES, jamais automatiquement. Les invitations n’ont aucune recette. <a href={`/api/organisateur/events/${slug}/finance`}>Exporter en CSV</a> · <Link href={`/organisateur/evenements/${slug}/finance/versements`}>Voir les versements</Link></p>
    </main>
  );
}
