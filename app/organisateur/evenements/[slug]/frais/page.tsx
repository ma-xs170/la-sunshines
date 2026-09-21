import type { Metadata } from 'next';
import FeesForm from '@/components/organizer/event/FeesForm';
import { canManage } from '@/lib/organizer/access';
import { type OrgTiers } from '@/lib/organizer/data';
import { orgEventRpc } from '@/lib/organizer/event-data';
import { getTicketingSettings } from '@/lib/ticketing/settings';
import { effectiveRates, type FeeMode } from '@/lib/ticketing/fees';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Frais et paiement · Espace organisateur', robots: { index: false, follow: false } };

interface FeeSettings { mode: FeeMode; min_order_cents: number; event_percent: number | null; event_fixed: number | null; org_percent: number | null; org_fixed: number | null }

export default async function FeesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const next = `/organisateur/evenements/${slug}/frais`;
  const [{ s, data: f, title }, { data: tiers }, global] = await Promise.all([orgEventRpc<FeeSettings>(slug, next, 'org_fee_settings'), orgEventRpc<OrgTiers>(slug, next, 'org_tiers'), getTicketingSettings(false)]);
  const pct = f.event_percent ?? f.org_percent, fixed = f.event_fixed ?? f.org_fixed;
  const rates = effectiveRates({ percent: pct, fixed }, global);
  const source = f.event_percent !== null || f.event_fixed !== null ? 'réglage propre à cet évènement' : f.org_percent !== null || f.org_fixed !== null ? 'réglage propre à ton organisation' : 'réglage général de la plateforme';
  const paid = tiers.tiers.filter((t) => !t.archived && t.price_cents > 0).map((t) => t.price_cents);
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Frais et paiement</h1><p className="script">{title}</p>
      <FeesForm slug={slug} initial={{ mode: f.mode, minOrderCents: f.min_order_cents }} rates={{ percent: rates.percent, fixedCents: rates.fixedCents }} sourceLabel={source} samplePriceCents={paid.length ? Math.min(...paid) : 1500} canEdit={canManage(s, 'manager')} />
    </main>
  );
}
