'use client';

import { useState } from 'react';

interface Preview { from: { name: string; reference: string }; to: { name: string; reference: string }; orders: number; tickets: number; tiers: number; sold: number }

/** Transfert d'un évènement à la demande d'un organisateur : récapitulatif clair, confirmation par saisie de la référence de destination, exécution atomique. */
export default function TransferForm({ events, initial }: { events: { slug: string; label: string }[]; initial: string }) {
  const [slug, setSlug] = useState(events.some((e) => e.slug === initial) ? initial : events[0]?.slug ?? ''); const [to, setTo] = useState('');
  const [pv, setPv] = useState<Preview | null>(null); const [confirm, setConfirm] = useState(''); const [msg, setMsg] = useState(''); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  async function call(body: Record<string, string>) { setBusy(true); setMsg(''); const r = await fetch('/api/admin-gestion/transfert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); setBusy(false); return { ok: r.ok, j }; }
  async function preview() { const { ok, j } = await call({ slug, to }); if (!ok) { setPv(null); setMsg(j.error || 'Impossible.'); return; } setPv(j); setConfirm(''); }
  async function run() { const { ok, j } = await call({ slug, to, confirm }); if (!ok) { setMsg(j.error || 'Transfert impossible.'); return; } setDone(true); setMsg(`Transfert effectué. E-mails envoyés : ${j.mails}/2. Pour revenir en arrière, une nouvelle demande de transfert est nécessaire.`); }
  if (events.length === 0) return <div className="glass org-empty"><h3>Aucun évènement à transférer</h3><p>Il n’y a aucun évènement de billetterie pour ce choix.</p></div>;
  return (
    <div className="ef">
      <section className="glass ef-card"><h2>1. Évènement et destination</h2>
        <div className="ef-grid"><div className="ef-field"><label htmlFor="t-e">Évènement</label><select id="t-e" value={slug} disabled={done} onChange={(e) => { setSlug(e.target.value); setPv(null); }}>{events.map((e) => <option key={e.slug} value={e.slug}>{e.label}</option>)}</select></div>
          <div className="ef-field"><label htmlFor="t-r">Référence de l’organisation de destination</label><input id="t-r" value={to} disabled={done} placeholder="ORG.20374728" onChange={(e) => { setTo(e.target.value.toUpperCase()); setPv(null); }} /></div></div>
        <button className="btn btn--outline" disabled={busy || done || !to} onClick={preview}>Voir le récapitulatif</button>
      </section>
      {pv && !done && (
        <section className="glass ef-card"><h2>2. Récapitulatif</h2>
          <p>De <strong>{pv.from.name}</strong> ({pv.from.reference}) vers <strong>{pv.to.name}</strong> ({pv.to.reference}).</p>
          <p>Conservés intacts : {pv.orders} commande(s), {pv.tickets} billet(s) (QR inchangés), {pv.tiers} tarif(s), {pv.sold} participant(s), historique complet.</p>
          <div className="ef-field"><label htmlFor="t-c">Pour confirmer, saisis la référence de destination : <code>{pv.to.reference}</code></label><input id="t-c" value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} /></div>
          <button className="btn btn--amber" disabled={busy || confirm !== pv.to.reference} onClick={run}>Transférer l’évènement</button>
        </section>)}
      {msg && <p className={done ? 'ef-help' : 'ef-err'} role="status">{msg}</p>}
    </div>
  );
}
