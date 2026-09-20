'use client';

import { useState } from 'react';

export interface OrganizerInfo { id: string; name: string; legal_form: string; siret: string; responsible_name: string; address: string; contact_email: string }

// Informations de l'organisateur : lues par le billet PDF (bloc « Organisateur ») et par les messages (adresse de réponse).
export default function OrganizerForm({ initial }: { initial: OrganizerInfo }) {
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof OrganizerInfo) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('');
    const { id, ...body } = f;
    const r = await fetch(`/api/billetterie/admin/organizers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    setMsg(r.ok ? 'Informations enregistrées.' : (await r.json().catch(() => ({}))).error ?? 'Enregistrement impossible.');
  }
  const missing = !f.siret && !f.responsible_name;
  return (
    <form onSubmit={save} className="admin-panel glass admin-panel--wide">
      <h2>Organisateur : {initial.name}</h2>
      <p className="admin-hint">Ces informations apparaissent sur chaque billet PDF (bloc « Organisateur »). Renseigne le <strong>SIRET</strong>, ou à défaut le <strong>nom et prénom du responsable</strong>. L’adresse de réponse est celle des messages envoyés aux participants.</p>
      {missing && <p className="admin-error" role="alert">[À COMPLÉTER] : ni SIRET ni responsable — le billet affichera « [À COMPLÉTER] ».</p>}
      <div className="tb-grid" style={{ marginTop: 16 }}>
        <label className="admin-field"><span>Nom de la structure</span><input value={f.name} onChange={set('name')} maxLength={120} required /></label>
        <label className="admin-field"><span>Forme juridique</span><input value={f.legal_form} onChange={set('legal_form')} maxLength={120} placeholder="Association loi 1901" /></label>
        <label className="admin-field"><span>SIRET (14 chiffres)</span><input value={f.siret} onChange={set('siret')} inputMode="numeric" maxLength={20} /></label>
        <label className="admin-field"><span>Responsable (nom et prénom)</span><input value={f.responsible_name} onChange={set('responsible_name')} maxLength={120} /></label>
        <label className="admin-field"><span>Adresse</span><input value={f.address} onChange={set('address')} maxLength={250} /></label>
        <label className="admin-field"><span>Email de réponse aux participants</span><input type="email" value={f.contact_email} onChange={set('contact_email')} maxLength={254} /></label>
      </div>
      <div className="admin-form__actions"><button className="btn btn--amber" disabled={busy}>{busy ? '…' : 'Enregistrer'}</button></div>
      {msg && <p className="admin-note" role="status">{msg}</p>}
    </form>
  );
}
