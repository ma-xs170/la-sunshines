'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface OrgFields { id: string; name: string; legal_form: string; siret: string; responsible_name: string; address: string; contact_email: string }

/** Informations légales de l'organisation (bloc « organisateur » du billet PDF) et adresse d'envoi des emails. */
export default function OrgSettingsForm({ org }: { org: OrgFields }) {
  const router = useRouter();
  const [v, setV] = useState(org);
  const [st, setSt] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');
  const on = (k: keyof OrgFields) => (e: React.ChangeEvent<HTMLInputElement>) => { setV({ ...v, [k]: e.target.value }); setSt('idle'); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSt('busy'); setMsg('');
    const r = await fetch('/api/organisateur/organisation', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setSt('ok'); router.refresh(); } else { setSt('err'); setMsg(j.error ?? 'Échec de l’enregistrement.'); }
  }

  return (
    <form className="org-settings" onSubmit={save}>
      <section className="glass org-panel" id="legal">
        <h2>Informations légales</h2>
        <p className="org-muted">Elles figurent dans le bloc « organisateur » de chaque billet PDF. Renseigne le SIRET, ou à défaut le nom et le prénom du responsable.</p>
        <div className="org-settings__grid">
          <label className="admin-field"><span>Nom de la structure</span><input value={v.name} onChange={on('name')} required maxLength={120} /></label>
          <label className="admin-field"><span>Forme juridique</span><input value={v.legal_form} onChange={on('legal_form')} maxLength={120} placeholder="Association loi 1901…" /></label>
          <label className="admin-field"><span>SIRET (14 chiffres)</span><input value={v.siret} onChange={on('siret')} inputMode="numeric" maxLength={20} /></label>
          <label className="admin-field"><span>Nom et prénom du responsable</span><input value={v.responsible_name} onChange={on('responsible_name')} maxLength={120} /></label>
          <label className="admin-field org-settings__wide"><span>Adresse</span><input value={v.address} onChange={on('address')} maxLength={250} /></label>
        </div>
      </section>
      <section className="glass org-panel" id="email">
        <h2>Adresse d’envoi des emails</h2>
        <p className="org-muted">Les participants répondent à cette adresse quand tu leur écris depuis ton espace.</p>
        <label className="admin-field"><span>Adresse email</span><input type="email" value={v.contact_email} onChange={on('contact_email')} maxLength={254} /></label>
      </section>
      <div className="org-settings__foot">
        <button className="btn btn--amber" disabled={st === 'busy'}>{st === 'busy' ? 'Enregistrement…' : 'Enregistrer'}</button>
        {st === 'ok' && <span className="org-ok" role="status">Enregistré ✓</span>}
        {st === 'err' && <span className="admin-error" role="alert">{msg}</span>}
      </div>
    </form>
  );
}
