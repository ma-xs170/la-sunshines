'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PublicTier, SaleState } from '@/lib/ticketing/events';
import { computeFee, formatEuro, formatGp } from '@/lib/ticketing/time';

interface Props {
  slug: string;
  tiers: PublicTier[];
  feePercent: number;
  feeFixedCents: number;
}

const BADGE: Record<Exclude<SaleState, 'on_sale'>, string> = {
  upcoming: 'Bientôt disponible',
  sold_out: 'Épuisé',
  closed: 'Vente terminée',
};

// Sélection des billets d'un événement (billetterie native). Le stock affiché est
// indicatif et rafraîchi régulièrement ; la RÉSERVATION (phase 3) est atomique côté
// serveur et reste seule juge — le prix n'est jamais lu depuis le navigateur.
export default function TicketPanel({ slug, tiers: initial, feePercent, feeFixedCents }: Props) {
  const [tiers, setTiers] = useState(initial);
  const [qty, setQty] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/billetterie/${slug}/disponibilite`, { cache: 'no-store' });
      if (!res.ok) return;
      const { tiers: live } = (await res.json()) as { tiers: { id: string; remaining: number; state: SaleState }[] };
      const byId = new Map(live.map((t) => [t.id, t]));
      setTiers((cur) =>
        cur.map((t) => {
          const l = byId.get(t.id);
          return l ? { ...t, remaining: l.remaining, state: l.state } : t;
        }),
      );
    } catch {
      /* silencieux : on garde l'affichage courant */
    }
  }, [slug]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 15000);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // une quantité choisie ne doit jamais dépasser ce qui reste
  useEffect(() => {
    setQty((q) => {
      let changed = false;
      const next = { ...q };
      for (const t of tiers) {
        const max = t.state === 'on_sale' ? Math.min(t.maxPerOrder, t.remaining) : 0;
        if ((next[t.id] ?? 0) > max) {
          next[t.id] = max;
          changed = true;
        }
      }
      return changed ? next : q;
    });
  }, [tiers]);

  const { count, subtotal } = useMemo(() => {
    let c = 0;
    let s = 0;
    for (const t of tiers) {
      const n = qty[t.id] ?? 0;
      c += n;
      s += n * t.priceCents;
    }
    return { count: c, subtotal: s };
  }, [tiers, qty]);

  const fee = computeFee(subtotal, feePercent, feeFixedCents);
  const step = (t: PublicTier, d: number) =>
    setQty((q) => {
      const max = Math.min(t.maxPerOrder, t.remaining);
      return { ...q, [t.id]: Math.max(0, Math.min(max, (q[t.id] ?? 0) + d)) };
    });

  const allClosed = tiers.every((t) => t.state !== 'on_sale' && t.state !== 'upcoming' && t.state !== 'sold_out');

  return (
    <div className="tp glass">
      <ul className="tp__list">
        {tiers.map((t) => {
          const n = qty[t.id] ?? 0;
          const buyable = t.state === 'on_sale';
          return (
            <li key={t.id} className={'tp__tier' + (buyable ? '' : ' is-off')}>
              <div className="tp__info">
                <p className="tp__name">{t.name}</p>
                {t.description && <p className="tp__desc">{t.description}</p>}
                <p className="tp__stock">
                  {buyable
                    ? t.remaining <= 10
                      ? `Plus que ${t.remaining} place${t.remaining > 1 ? 's' : ''}`
                      : `${t.remaining} places restantes`
                    : t.state === 'upcoming' && t.salesStart
                      ? `Ouverture des ventes : ${formatGp(t.salesStart)}`
                      : ''}
                </p>
              </div>
              <div className="tp__side">
                <p className="tp__price">{formatEuro(t.priceCents)}</p>
                {buyable ? (
                  <div className="tp__stepper" role="group" aria-label={`Quantité — ${t.name}`}>
                    <button type="button" onClick={() => step(t, -1)} disabled={n === 0} aria-label="Retirer un billet">−</button>
                    <span aria-live="polite">{n}</span>
                    <button type="button" onClick={() => step(t, 1)} disabled={n >= Math.min(t.maxPerOrder, t.remaining)} aria-label="Ajouter un billet">+</button>
                  </div>
                ) : (
                  <span className={`tp__badge tp__badge--${t.state}`}>{BADGE[t.state as keyof typeof BADGE]}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!allClosed && (
        <div className="tp__total">
          <dl>
            <div><dt>Sous-total</dt><dd>{formatEuro(subtotal)}</dd></div>
            {fee > 0 && <div><dt>Frais de service</dt><dd>{formatEuro(fee)}</dd></div>}
            <div className="tp__grand"><dt>Total</dt><dd>{formatEuro(subtotal + fee)}</dd></div>
          </dl>
          <button type="button" className="btn btn--amber" disabled title="Le paiement en ligne arrive bientôt">
            {count > 0 ? `Réserver ${count} billet${count > 1 ? 's' : ''}` : 'Choisis tes billets'}
          </button>
          <p className="tp__note">Paiement en ligne bientôt disponible.</p>
        </div>
      )}
    </div>
  );
}
