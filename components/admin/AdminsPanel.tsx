'use client';

import { useState } from 'react';

export type ClientPermission = 'clients.lire' | 'clients.modifier';
export interface AdminRow { user_id: string; reference: string; level: 'super' | 'admin'; active: boolean; first_name: string; last_name: string; email: string; invitation_status: 'pending' | 'sent' | 'failed'; invitation_error: string; must_change_password: boolean; locked: boolean; permissions: ClientPermission[] }
const INV = { sent: 'Invitation envoyée', failed: 'Invitation non envoyée', pending: 'Invitation en attente' } as const;

/** Administrateurs : création (mot de passe provisoire envoyé par e-mail, jamais affiché), désactivation, réinitialisation, renvoi de l'invitation. */
export default function AdminsPanel({ initial, me }: { initial: AdminRow[]; me: string }) {
  const [rows, setRows] = useState(initial); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ first_name: '', last_name: '', email: '', phone: '', level: 'admin' as 'admin' | 'super' });
  const reload = async () => { const r = await fetch('/api/admin-gestion/administrateurs', { cache: 'no-store' }); if (r.ok) setRows(await r.json()); };

  async function create() {
    setBusy(true); setMsg('');
    const r = await fetch('/api/admin-gestion/administrateurs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg(j.error || 'Création impossible.'); return; }
    setMsg(j.invitation === 'sent' ? `Compte créé (${j.reference}) : l’invitation est partie par e-mail.` : `Compte créé (${j.reference}), mais l’invitation n’est pas partie : utilise « Renvoyer l’invitation » une fois le domaine d’envoi vérifié.`);
    setF({ first_name: '', last_name: '', email: '', phone: '', level: 'admin' }); await reload();
  }
  async function act(user_id: string, action: 'disable' | 'enable' | 'reset' | 'resend', confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setMsg(''); const r = await fetch('/api/admin-gestion/administrateurs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id, action: action === 'resend' ? 'reset' : action }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'Action impossible.'); return; }
    if (j.invitation) setMsg(j.invitation === 'sent' ? 'Nouvelle invitation envoyée (nouveau mot de passe provisoire).' : 'Mot de passe réinitialisé, mais l’e-mail n’est pas parti (domaine d’envoi à vérifier).');
    await reload();
  }
  async function togglePermission(a: AdminRow, perm: ClientPermission) {
    const next = a.permissions.includes(perm) ? a.permissions.filter((p) => p !== perm) : [...a.permissions, perm];
    setRows(rows.map((x) => (x.user_id === a.user_id ? { ...x, permissions: next } : x)));   // optimiste : la case ne doit pas revenir en arrière pendant la requête
    const r = await fetch('/api/admin-gestion/administrateurs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: a.user_id, action: 'permissions', permissions: next }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg(j.error || 'Action impossible.'); setRows(rows); return; }
    await reload();
  }
  return (
    <div className="ef">
      <section className="glass ef-card"><h2>Comptes administrateurs</h2>
        <ul className="ef-list">{rows.map((a) => (
          <li key={a.user_id}><div><code>{a.reference}</code> <strong>{a.first_name} {a.last_name}</strong> · {a.level === 'super' ? 'Super-administrateur' : 'Administrateur'}{!a.active && ' · désactivé'}{a.locked && ' · verrouillé'}<br />
            <span className="ef-help">{a.email} · {INV[a.invitation_status]}{a.invitation_error && ` (${a.invitation_error})`}{a.must_change_password && ' · mot de passe provisoire à changer'}</span>
            {a.level !== 'super' && <div className="ef-row" style={{ marginTop: 6 }}>
              <label className="ef-check"><input type="checkbox" checked={a.permissions.includes('clients.lire')} onChange={() => togglePermission(a, 'clients.lire')} />Voir la page Clients</label>
              <label className="ef-check"><input type="checkbox" checked={a.permissions.includes('clients.modifier')} onChange={() => togglePermission(a, 'clients.modifier')} />Modifier les clients</label>
            </div>}</div>
            {a.user_id !== me && <div className="ef-row">
              <button className="ef-link" onClick={() => act(a.user_id, 'resend', 'Générer un nouveau mot de passe provisoire et le renvoyer par e-mail ?')}>{a.invitation_status === 'failed' ? 'Renvoyer l’invitation' : 'Réinitialiser le mot de passe'}</button>
              <button className="ef-link" onClick={() => act(a.user_id, a.active ? 'disable' : 'enable', a.active ? 'Désactiver cet administrateur ? Il perd tout accès immédiatement.' : undefined)}>{a.active ? 'Désactiver' : 'Réactiver'}</button></div>}</li>))}</ul>
        {msg && <p className="ef-help" role="status">{msg}</p>}
      </section>
      <section className="glass ef-card"><h2>Nouvel administrateur</h2>
        <div className="ef-grid">
          {([['first_name', 'Prénom'], ['last_name', 'Nom'], ['email', 'E-mail'], ['phone', 'Téléphone']] as const).map(([k, l]) => <div className="ef-field" key={k}><label htmlFor={`ad-${k}`}>{l}</label><input id={`ad-${k}`} value={f[k]} type={k === 'email' ? 'email' : 'text'} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>)}
          <div className="ef-field"><label htmlFor="ad-level">Niveau</label><select id="ad-level" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value as 'admin' | 'super' })}><option value="admin">Administrateur</option><option value="super">Super-administrateur</option></select></div>
        </div>
        <p className="ef-help">Un mot de passe aléatoire de 20 caractères est généré et envoyé par e-mail à l’administrateur : il n’est jamais affiché ici. Il devra le changer à sa première connexion.</p>
        <button className="btn btn--amber" disabled={busy || !f.first_name || !f.last_name || !f.email} onClick={create}>{busy ? 'Création…' : 'Créer l’administrateur'}</button>
      </section>
    </div>
  );
}
