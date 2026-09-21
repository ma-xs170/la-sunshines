import FreeBadge from '@/components/ticketing/FreeBadge';
import { progress, tierAlert, tierStatus, TIER_STATUS_LABEL, type TierGaugeInput } from '@/lib/organizer/status';
import { formatEuro } from '@/lib/ticketing/time';

export interface TierGaugeData extends TierGaugeInput { id: string; name: string; price_cents: number; revenue_cents: number }

/** Corps d'une jauge de tarif : vendus / stock, pourcentage, places restantes, chiffre d'affaires, statut ; alerte quand le stock est bas ou épuisé. */
export function TierGaugeBody({ tier }: { tier: TierGaugeData }) {
  const st = tierStatus(tier);
  const alert = tierAlert(tier);
  const p = progress(tier.sold, tier.reserved, tier.quantity_total);
  const left = Math.max(tier.quantity_total - tier.sold - tier.reserved, 0);
  const text = `${tier.sold} / ${tier.quantity_total} vendus · ${p.totalPct} %`;
  return (
    <>
      <div className="tgauge__top">
        <strong className="tgauge__name">{tier.name}</strong>
        <span className="tgauge__price">{tier.price_cents === 0 ? <FreeBadge /> : formatEuro(tier.price_cents)}</span>
        <span className={`tgauge__status tgauge__status--${st}`}>{TIER_STATUS_LABEL[st]}</span>
      </div>
      <div className="org-bar org-bar--compact">
        <div className="org-bar__track" role="progressbar" aria-valuemin={0} aria-valuemax={tier.quantity_total} aria-valuenow={tier.sold} aria-label={`${tier.name} : ${text}`}>
          <span className="org-bar__sold" style={{ width: `${p.soldPct}%` }} />
          <span className="org-bar__reserved" style={{ width: `${p.reservedPct}%` }} />
        </div>
      </div>
      <dl className="tgauge__nums">
        <div><dt>Vendus</dt><dd>{tier.sold} / {tier.quantity_total} · {p.totalPct} %</dd></div>
        <div><dt>Restantes</dt><dd>{left}{tier.reserved > 0 ? ` (+${tier.reserved} en cours)` : ''}</dd></div>
        <div><dt>Chiffre d’affaires</dt><dd>{formatEuro(tier.revenue_cents)}</dd></div>
      </dl>
      {alert === 'low' && <p className="tgauge__alert" role="status">Stock bas : plus que {left} place{left > 1 ? 's' : ''}.</p>}
      {alert === 'out' && st !== 'closed' && <p className="tgauge__alert" role="status">Épuisé.</p>}
    </>
  );
}

export const gaugeClass = (t: TierGaugeInput) => `glass tgauge tgauge--${tierAlert(t)}`;

export default function TierGauge({ tier }: { tier: TierGaugeData }) {
  return <li className={gaugeClass(tier)} data-tier-gauge={tier.id}><TierGaugeBody tier={tier} /></li>;
}
