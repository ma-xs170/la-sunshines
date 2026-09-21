'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PublicTier, SaleState } from '@/lib/ticketing/events';
import { computeFee, formatEuro, formatGp } from '@/lib/ticketing/time';
import FreeBadge from '@/components/ticketing/FreeBadge';
import { useAuthUser } from '@/components/auth/useAuthUser';

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
  const { ready, user } = useAuthUser();
  const [people, setPeople] = useState<Record<string, { first_name: string; last_name: string }[]>>({});
  const [terms, setTerms] = useState(false);
  const [guardian, setGuardian] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
    // stock à la seconde près (2 s), en pause quand l'onglet est masqué, immédiat au retour
    let id: number | undefined;
    const start = () => { if (id === undefined) id = window.setInterval(refresh, 2000); };
    const stop = () => { if (id !== undefined) { window.clearInterval(id); id = undefined; } };
    const onVisible = () => { if (document.visibilityState === 'visible') { refresh(); start(); } else stop(); };
    onVisible();
    document.addEventListener('visibilitychange', onVisible);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisible); };
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

  // 0 € : aucun frais (ni % ni frais fixe) ; panier mixte : frais sur la seule partie payante
  const fee = computeFee(subtotal, feePercent, feeFixedCents);
  const isFreeOrder = count > 0 && subtotal === 0;
  const step = (t: PublicTier, d: number) =>
    setQty((q) => {
      const max = Math.min(t.maxPerOrder, t.remaining);
      return { ...q, [t.id]: Math.max(0, Math.min(max, (q[t.id] ?? 0) + d)) };
    });

  // un champ nom / prénom par billet choisi
  useEffect(() => {
    setPeople((cur) => {
      const next: typeof cur = {};
      for (const t of tiers) {
        const n = qty[t.id] ?? 0;
        if (n > 0) next[t.id] = Array.from({ length: n }, (_, i) => cur[t.id]?.[i] ?? { first_name: '', last_name: '' });
      }
      return next;
    });
  }, [qty, tiers]);

  const setPerson = (tid: string, i: number, k: 'first_name' | 'last_name', v: string) =>
    setPeople((cur) => ({ ...cur, [tid]: (cur[tid] ?? []).map((p, j) => (j === i ? { ...p, [k]: v } : p)) }));

  async function pay() {
    setError('');
    const items = tiers
      .filter((t) => (qty[t.id] ?? 0) > 0)
      .map((t) => ({ tier_id: t.id, quantity: qty[t.id], participants: people[t.id] ?? [] }));
    if (items.some((it) => it.participants.some((p) => !p.first_name.trim() || !p.last_name.trim()))) {
      return setError('Indique le prénom et le nom de chaque participant.');
    }
    if (!terms) return setError('Accepte les CGV et la politique de remboursement.');
    if (!guardian) return setError('Confirme avoir 18 ans ou l’autorisation de ton représentant légal.');
    setBusy(true);
    try {
      // AUCUN prix envoyé : le serveur relit tout en base
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, items, accept_terms: terms, guardian_consent: guardian }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.free && data.redirect) {
        // commande gratuite : déjà confirmée, aucun paiement
        window.location.assign(data.redirect);
        return;
      }
      if (!res.ok || !data.url) {
        setError(data.error ?? (isFreeOrder ? 'La réservation n’a pas pu aboutir. Réessaie.' : 'Le paiement n’a pas pu démarrer. Réessaie.'));
        refresh();
        setBusy(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError('Connexion impossible. Vérifie ton réseau.');
      setBusy(false);
    }
  }

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
                <p className="tp__price">{t.priceCents === 0 ? <FreeBadge /> : formatEuro(t.priceCents)}</p>
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
          {count > 0 && (
            <div className="tp__people">
              <p className="tp__h">Participants</p>
              {tiers.filter((t) => (qty[t.id] ?? 0) > 0).flatMap((t) =>
                (people[t.id] ?? []).map((p, i) => (
                  <div className="tp__person" key={t.id + i}>
                    <span className="tp__who">{t.name} · billet {i + 1}</span>
                    <input placeholder="Prénom" value={p.first_name} maxLength={60} autoComplete="off"
                      onChange={(e) => setPerson(t.id, i, 'first_name', e.target.value)} aria-label={`Prénom — ${t.name} ${i + 1}`} />
                    <input placeholder="Nom" value={p.last_name} maxLength={60} autoComplete="off"
                      onChange={(e) => setPerson(t.id, i, 'last_name', e.target.value)} aria-label={`Nom — ${t.name} ${i + 1}`} />
                  </div>
                )),
              )}
            </div>
          )}
          <dl>
            <div><dt>Sous-total</dt><dd>{formatEuro(subtotal)}</dd></div>
            {fee > 0 && <div><dt>Frais de service</dt><dd>{formatEuro(fee)}</dd></div>}
            <div className="tp__grand"><dt>Total</dt><dd>{subtotal + fee === 0 ? <FreeBadge /> : formatEuro(subtotal + fee)}</dd></div>
          </dl>
          {count > 0 && (
            <div className="tp__consent">
              <label><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                <span>J’accepte les <a href="/cgv" target="_blank" rel="noopener">CGV</a> et la <a href="/remboursement" target="_blank" rel="noopener">politique de remboursement</a>.</span></label>
              <label><input type="checkbox" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} />
                <span>J’ai 18 ans ou l’autorisation de mon représentant légal.</span></label>
            </div>
          )}
          {error && <p className="tp__error" role="alert">{error}</p>}
          {ready && !user ? (
            <a className="btn btn--amber" href={`/connexion?next=${encodeURIComponent(`/editions/${slug}`)}`}>
              Se connecter pour réserver
            </a>
          ) : (
            <button type="button" className="btn btn--amber" disabled={count === 0 || busy || !ready} onClick={pay}>
              {busy ? (isFreeOrder ? 'Réservation en cours…' : 'Redirection vers le paiement…') : count === 0 ? 'Choisis tes billets' : isFreeOrder ? 'Réserver gratuitement' : `Payer ${formatEuro(subtotal + fee)}`}
            </button>
          )}
          <p className="tp__note">{isFreeOrder ? 'Billets gratuits : aucun paiement demandé, e-mail de ton compte confirmé requis. ' : 'Paiement sécurisé par Stripe. '}TVA non applicable, art. 293 B du CGI. {!isFreeOrder && 'Places réservées 15 minutes pendant le paiement.'} <a href="/mentions-legales" target="_blank" rel="noopener">Mentions légales</a> · <a href="/cgv" target="_blank" rel="noopener">CGV</a> · <a href="/remboursement" target="_blank" rel="noopener">Remboursement</a></p>
        </div>
      )}
    </div>
  );
}
