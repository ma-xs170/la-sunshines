'use client';

import { useState } from 'react';

interface Org { id: string; status: 'pending' | 'approved' | 'suspended'; name: string; legal_form: string; siret: string; responsible_name: string; address: string; contact_email: string }

/** Actions admin sur une organisation : approuver / suspendre / réactiver (avec confirmation), modifier le contact, transférer un évènement. */
export default function OrgAdminActions({ org, events }: { org: Org; events: string[] }) {
  const [f, setF] = useState({ name: org.name, legal_form: org.legal_form, siret: org.siret, responsible: org.responsible_name, address: org.address, email: org.contact_email });
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  async function post(body: Record<string, unknown>, ok: string) {
    setBusy(true); setMsg('');
    const r = await fetch(`/api/admin-gestion/organisateurs/${org.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg(j.error || 'Action impossible.'); return; }
    setMsg(ok); if (body.action !== 'contact') window.location.reload();
  }
  const status = (action: 'approve' | 'suspend' | 'reactivate', q: string, ok: string) => { if (window.confirm(q)) void post({ action }, ok); };
  return (
    <div className="ef">
      <section className="glass ef-card"><h2>Statut du compte</h2>
        <div className="ef-row">
          {org.status === 'pending' && <button className="btn btn--amber" disabled={busy} onClick={() => status('approve', `Approuver « ${org.name} » ? Sa référence ORG est créée.`, 'Approuvé.')}>Approuver</button>}
          {org.status === 'approved' && <button className="btn btn--outline" disabled={busy} onClick={() => status('suspend', `Suspendre « ${org.name} » ? Elle ne pourra plus vendre ni publier.`, 'Suspendu.')}>Suspendre</button>}
          {org.status === 'suspended' && <button className="btn btn--amber" disabled={busy} onClick={() => status('reactivate', `Réactiver « ${org.name} » ?`, 'Réactivé.')}>Réactiver</button>}
          {events.length > 0 && <a className="btn btn--outline" href={`/admin/gestion/transfert?from=${org.id}`}>Transférer un évènement</a>}
        </div>
        {msg && <p className="ef-help" role="status">{msg}</p>}
      </section>
      <section className="glass ef-card"><h2>Contact de la structure</h2>
        <div className="ef-grid">
          {([['name', 'Structure'], ['legal_form', 'Forme juridique'], ['siret', 'SIRET (14 chiffres)'], ['responsible', 'Responsable'], ['address', 'Adresse'], ['email', 'E-mail']] as const).map(([k, l]) => (
            <div className="ef-field" key={k}><label htmlFor={`oa-${k}`}>{l}</label><input id={`oa-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>))}
        </div>
        <button className="btn btn--amber" disabled={busy} onClick={() => post({ action: 'contact', ...f }, 'Contact enregistré.')}>Enregistrer le contact</button>
      </section>
    </div>
  );
}
