'use client';

import { useState } from 'react';

export interface DayPoint { day: string; sold: number; revenue_cents: number }

const fmtDay = (d: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const euro = (c: number) => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

/**
 * Évolution des ventes : billets vendus par jour (barres fines, bouts arrondis, couleurs de la marque). Une seule mesure,
 * un seul axe, pas de légende (le titre nomme la série). Infobulle au survol / focus ; vue tableau pour l'accessibilité.
 */
export default function SalesChart({ series }: { series: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (series.length === 0) {
    return <p className="org-muted">Aucune vente pour l’instant : le graphique apparaîtra dès le premier billet vendu.</p>;
  }
  const W = 640, H = 200, PL = 30, PB = 26, PT = 14, PR = 6;
  const max = Math.max(...series.map((p) => p.sold), 1);
  const top = Math.ceil(max / (max > 6 ? 5 : 1)) * (max > 6 ? 5 : 1);
  const step = (W - PL - PR) / series.length;
  const bw = Math.max(4, Math.min(28, step - 6));
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / top);
  const ticks = [0, Math.round(top / 2), top].filter((v, i, a) => a.indexOf(v) === i);
  const every = Math.ceil(series.length / 7);
  const h = hover !== null ? series[hover] : null;
  const total = series.reduce((s, p) => s + p.sold, 0);

  return (
    <div className="org-chart">
      <div className="org-chart__plot" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Billets vendus par jour, ${total} au total sur ${series.length} jour${series.length > 1 ? 's' : ''}`}>
          <defs>
            <linearGradient id="orgbar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFB238" /><stop offset="100%" stopColor="#FF6B5B" /></linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="rgba(25,20,16,0.10)" strokeWidth="1" strokeDasharray={t === 0 ? undefined : '3 4'} />
              <text x={PL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="rgba(25,20,16,0.64)">{t}</text>
            </g>
          ))}
          {series.map((p, i) => {
            const x = PL + step * i + (step - bw) / 2;
            const bh = Math.max(3, y(0) - y(p.sold));
            return (
              <g key={p.day}>
                <rect x={PL + step * i} y={PT} width={step} height={H - PT - PB} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${fmtDay(p.day)} : ${p.sold} billet${p.sold > 1 ? 's' : ''}`} />
                <rect x={x} y={y(p.sold)} width={bw} height={bh} rx="4" ry="4" fill="url(#orgbar)" opacity={hover === null || hover === i ? 1 : 0.45} pointerEvents="none" />
                {(i % every === 0 || i === series.length - 1) && <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="rgba(25,20,16,0.64)">{fmtDay(p.day)}</text>}
              </g>
            );
          })}
        </svg>
        {h && (
          <div className="org-chart__tip" role="status" style={{ left: `${((PL + step * (hover! + 0.5)) / W) * 100}%` }}>
            <strong>{fmtDay(h.day)}</strong>
            <span>{h.sold} billet{h.sold > 1 ? 's' : ''}</span>
            <span>{euro(h.revenue_cents)}</span>
          </div>
        )}
      </div>
      <details className="org-chart__table">
        <summary>Voir les chiffres en tableau</summary>
        <table>
          <thead><tr><th>Jour</th><th>Billets</th><th>Montant</th></tr></thead>
          <tbody>{series.map((p) => <tr key={p.day}><td>{fmtDay(p.day)}</td><td>{p.sold}</td><td>{euro(p.revenue_cents)}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}
