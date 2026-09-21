'use client';

import { useState } from 'react';

interface Guest { first_name: string; last_name: string; email: string; quantity: number }
const blank = (): Guest => ({ first_name: '', last_name: '', email: '', quantity: 1 });

/** Envoi d'invitations gratuites : chaque invité reçoit ses billets par e-mail. Vérification côté serveur (stock, rôle, organisation). */
export default function InvitationForm({ slug, tiers }: { slug: string; tiers: { id: string; name: string }[] }) {
  const [tier, setTier] = useState(tiers[0]?.id ?? ''); const [guests, setGuests] = useState<Guest[]>([blank()]);
  const [busy, setBusy] = useState(false); const [out, setOut] = useState<{ email: string; ok: boolean; error?: string; email_status?: string }[] | null>(null); const [err, setErr] = useState('');
  const set = (i: number, p: Partial<Guest>) => setGuests(guests.map((g, j) => (j === i ? { ...g, ...p } : g)));

  async function send() {
    if (!window.confirm(`Envoyer ${guests.reduce((n, g) => n + g.quantity, 0)} billet(s) gratuit(s) par e-mail ?`)) return;
    setBusy(true); setErr(''); setOut(null);
    const res = await fetch(`/api/organisateur/events/${slug}/invitations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier_id: tier, guests }) });
    const j = await res.json().catch(() => ({})); setBusy(false);
    if (!res.ok && !j.results) { setErr(j.error || 'Envoi impossible.'); return; }
    setOut(j.results); if (j.ok) setGuests([blank()]);
  }
  if (tiers.length === 0) return <p className="ef-help">Crée d’abord un tarif pour cet évènement (menu Billetterie › Tarifs) : les invitations en dépendent.</p>;
  return (
    <div className="ef">
      <section className="glass ef-card"><h2>Nouvelle invitation</h2>
        <div className="ef-field"><label htmlFor="i-t">Tarif du billet</label><select id="i-t" value={tier} onChange={(e) => setTier(e.target.value)}>{tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <p className="ef-help">Les invitations comptent dans le stock du tarif et ne génèrent aucune recette.</p></div>
        {guests.map((g, i) => (
          <div className="ef-q" key={i}><div className="ef-grid">
            <div className="ef-field"><label htmlFor={`g-f${i}`}>Prénom</label><input id={`g-f${i}`} value={g.first_name} onChange={(e) => set(i, { first_name: e.target.value })} /></div>
            <div className="ef-field"><label htmlFor={`g-l${i}`}>Nom</label><input id={`g-l${i}`} value={g.last_name} onChange={(e) => set(i, { last_name: e.target.value })} /></div>
            <div className="ef-field"><label htmlFor={`g-e${i}`}>E-mail</label><input id={`g-e${i}`} type="email" value={g.email} onChange={(e) => set(i, { email: e.target.value })} /></div>
            <div className="ef-field"><label htmlFor={`g-q${i}`}>Billets</label><input id={`g-q${i}`} inputMode="numeric" value={g.quantity} onChange={(e) => set(i, { quantity: Math.min(20, Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1)) })} /></div></div>
            {guests.length > 1 && <button type="button" className="ef-link" onClick={() => setGuests(guests.filter((_, j) => j !== i))}>Retirer</button>}</div>))}
        <div className="ef-row"><button type="button" className="btn btn--outline" disabled={guests.length >= 20} onClick={() => setGuests([...guests, blank()])}>Ajouter un invité</button>
          <button type="button" className="btn btn--amber" disabled={busy} onClick={send}>{busy ? 'Envoi…' : 'Envoyer les invitations'}</button></div>
        {err && <p className="ef-err" role="alert">{err}</p>}
        {out && <ul className="ef-list" role="status">{out.map((r, i) => <li key={i}><span>{r.email}</span><span className={r.ok ? '' : 'ef-err'}>{r.ok ? (r.email_status === 'sent' ? 'Envoyée' : 'Créée, e-mail à renvoyer') : r.error}</span></li>)}</ul>}
      </section>
    </div>
  );
}
