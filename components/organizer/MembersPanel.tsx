'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface Member { user_id: string; role: 'owner' | 'manager' | 'staff'; since: string; first_name: string; last_name: string; email: string }
const ROLES: [Member['role'], string, string][] = [
  ['owner', 'Propriétaire', 'Tout, y compris les informations légales, les paiements et les membres.'],
  ['manager', 'Gestionnaire', 'Évènements, billetterie, participants, messages. Pas les informations légales ni les paiements.'],
  ['staff', 'Staff', 'Scan des billets à l’entrée uniquement.'],
];
const LABEL = Object.fromEntries(ROLES.map(([k, v]) => [k, v]));

/** Membres de l'organisation : ajout par e-mail (compte existant), changement de rôle, retrait. Le dernier propriétaire est protégé (refus côté base). */
export default function MembersPanel({ org, members, me }: { org: string; members: Member[]; me: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Member['role']>('staff');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(body: Record<string, unknown>, ok: string) {
    setBusy(true); setMsg(null);
    const r = await fetch('/api/organisateur/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org, ...body }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false); setConfirm(null);
    if (!r.ok) { setMsg({ ok: false, text: j.error ?? 'Échec.' }); return false; }
    setMsg({ ok: true, text: ok }); router.refresh(); return true;
  }

  return (
    <div className="members">
      <form className="glass ef-card" onSubmit={async (e) => { e.preventDefault(); if (await call({ action: 'add', email: email.trim(), role }, 'Membre ajouté.')) setEmail(''); }}>
        <h2>Ajouter un membre</h2>
        <p className="org-muted">La personne doit déjà avoir un compte sur le site (inscription avec cette adresse e-mail).</p>
        <div className="org-settings__grid">
          <label className="admin-field"><span>Adresse e-mail du compte</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} /></label>
          <label className="admin-field"><span>Rôle</span><select value={role} onChange={(e) => setRole(e.target.value as Member['role'])}>{ROLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>
        <p className="org-muted">{ROLES.find(([k]) => k === role)?.[2]}</p>
        <div className="org-settings__foot"><button className="btn btn--amber" disabled={busy}>Ajouter</button></div>
      </form>

      {msg && <p className={msg.ok ? 'org-ok' : 'admin-error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}

      <section className="glass ef-card">
        <h2>Membres <span className="org-count">{members.length}</span></h2>
        <div className="org-table"><table>
          <thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th /></tr></thead>
          <tbody>{members.map((m) => (
            <tr key={m.user_id}>
              <td data-label="Nom">{[m.first_name, m.last_name].filter(Boolean).join(' ') || '—'}{m.user_id === me && <em className="org-muted"> (toi)</em>}</td>
              <td data-label="E-mail">{m.email}</td>
              <td data-label="Rôle"><select value={m.role} disabled={busy} aria-label={`Rôle de ${m.email}`} onChange={(e) => call({ action: 'role', user: m.user_id, role: e.target.value }, `Rôle de ${m.email} : ${LABEL[e.target.value]}.`)}>{ROLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
              <td data-label="">{confirm === m.user_id
                ? <><button type="button" className="btn btn--amber" disabled={busy} onClick={() => call({ action: 'remove', user: m.user_id }, 'Membre retiré.')}>Confirmer le retrait</button> <button type="button" className="btn btn--ghost" onClick={() => setConfirm(null)}>Annuler</button></>
                : <button type="button" className="btn btn--ghost" onClick={() => setConfirm(m.user_id)}>Retirer</button>}</td>
            </tr>))}</tbody>
        </table></div>
      </section>
    </div>
  );
}
