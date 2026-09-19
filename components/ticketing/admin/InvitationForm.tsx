'use client';

import { useEffect, useState } from 'react';
import type { AdminEventView } from '@/lib/ticketing/admin';

export default function InvitationForm({ events }: { events: { slug: string; name: string }[] }) {
  const [slug, setSlug] = useState(events[0]?.slug ?? '');
  const [tiers, setTiers] = useState<AdminEventView['tiers']>([]);
  const [tier, setTier] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<{ email: string; ok: boolean; error?: string; email_status?: string }[] | null>(null);

  async function loadTiers(s: string) {
    setSlug(s); setTier(''); setTiers([]);
    if (!s) return;
    const r = await fetch(`/api/billetterie/admin/events/${s}`);
    const j = await r.json().catch(() => ({}));
    if (r.ok) { const t = (j.tiers as AdminEventView['tiers']).filter((x) => !x.archived_at); setTiers(t); setTier(t[0]?.id ?? ''); }
  }
  // charge les tarifs du 1er événement à l'ouverture
  useEffect(() => { if (events[0]) loadTiers(events[0].slug); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setRes(null);
    // une ligne par invité : email ; prénom ; nom ; quantité (facultative)
    const guests = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [email, first_name, last_name, q] = l.split(/[;,\t]/).map((x) => x.trim());
      return { email, first_name, last_name, quantity: q ? Number(q) : 1 };
    });
    if (!slug || !tier || guests.length === 0) return setErr('Choisis un événement, un tarif et ajoute au moins un invité.');
    if (!window.confirm(`Créer ${guests.reduce((n, g) => n + (g.quantity || 1), 0)} billet(s) SANS paiement et envoyer les emails ?`)) return;
    setBusy(true);
    const r = await fetch('/api/billetterie/admin/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, tier_id: tier, guests }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok && !j.results) return setErr(j.error ?? 'Envoi impossible.');
    setRes(j.results);
  }

  return (
    <form onSubmit={send} className="admin-panel glass tb-form">
      <div className="tb-grid">
        <label className="admin-field"><span>Événement</span><select value={slug} onChange={(e) => loadTiers(e.target.value)}>{events.map((e) => <option key={e.slug} value={e.slug}>{e.name}</option>)}</select></label>
        <label className="admin-field"><span>Tarif (les invitations comptent dans le stock)</span><select value={tier} onChange={(e) => setTier(e.target.value)}>{tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      </div>
      <label className="admin-field"><span>Invités — une ligne par personne : <code>email ; prénom ; nom ; quantité</code> (quantité facultative)</span>
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'marie@exemple.fr ; Marie ; Dupont\nlucas@exemple.fr ; Lucas ; Martin ; 2'} /></label>
      {err && <p className="admin-error" role="alert">{err}</p>}
      <div className="admin-form__actions"><button className="btn btn--amber" disabled={busy}>{busy ? 'Envoi…' : 'Créer les invitations'}</button></div>
      {res && (
        <ul className="admin-list">
          {res.map((r, i) => <li key={i} className="admin-list__item">{r.email} — {r.ok ? `créée${r.email_status === 'sent' ? ', email envoyé' : r.email_status === 'failed' ? ', EMAIL EN ÉCHEC (renvoyer depuis la commande)' : ''}` : <span className="admin-error">{r.error}</span>}</li>)}
        </ul>
      )}
    </form>
  );
}
