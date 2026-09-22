'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../Icon';
import { fmtBirth, fmtDate, fmtDateTime, fmtEuros, fullName, NOT_SET, orderStatusLabel, TICKET_STATUS, upperName } from '@/lib/admin/clients/format';
import { formatPhone } from '@/lib/admin/clients/phone';
import { STATUSES } from '@/lib/admin/clients/query';
import { validateEditForm, type ClientDetail, type ClientHistoryEntry, type ClientOrder, type EditForm } from '@/lib/admin/clients/detail';

const TABS = [
  { id: 'info', label: 'Informations' }, { id: 'events', label: 'Évènements' }, { id: 'orders', label: 'Commandes et billets' },
  { id: 'consents', label: 'Autorisations et consentements' }, { id: 'history', label: 'Historique' }, { id: 'security', label: 'Sécurité et RGPD' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const ACTION_LABEL: Record<string, string> = {
  'customer.view': 'Consultation de la fiche', 'customer.update': 'Modification des informations', 'customer.suspend': 'Compte suspendu', 'customer.reactivate': 'Compte réactivé',
  'customer.sessions_revoked': 'Sessions déconnectées', 'customer.password_reset': 'E-mail de réinitialisation du mot de passe', 'customer.email_notice': 'Notification de changement d’e-mail',
  'customer.email_sync_failed': 'Échec de synchronisation de l’identifiant', 'customer.anonymize': 'Compte anonymisé', 'customer.export': 'Export des données du compte',
};
const FIELD_LABEL: Record<string, string> = { first_name: 'Prénom', last_name: 'Nom', phone: 'Téléphone', phone2: 'Téléphone secondaire', email: 'E-mail', birth_date: 'Date de naissance', status: 'Statut' };
const fmtValue = (k: string, v: unknown): string => {
  if (v === null || v === undefined || v === '') return NOT_SET;
  if (k === 'birth_date') return fmtBirth(String(v));
  if (k === 'phone' || k === 'phone2') return formatPhone(String(v));
  if (k === 'status') return STATUSES[v as keyof typeof STATUSES] ?? String(v);
  return String(v);
};

const call = async (url: string, method: string, body?: unknown) => { const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }); return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }; };

/** Fiche client : en-tête, onglets. Chaque action revérifie le droit côté serveur ; ceci n'est qu'une commodité d'affichage. */
export default function ClientDetailView({ id, initial, isSuper }: { id: string; initial: ClientDetail; isSuper: boolean }) {
  const [d, setD] = useState(initial);
  const [tab, setTab] = useState<TabId>('info');
  const refresh = useCallback(async () => { const r = await call(`/api/admin-clients/${id}?silent=1`, 'GET'); if (r.ok) setD(r.data); }, [id]);
  const p = d.profile;

  return (
    <div className="clients-detail">
      <a className="ef-link" href="/admin/clients">← Retour à la liste</a>
      <header className="clients-detail__head glass">
        <div>
          <h1 className="org-head__title">{fullName(p.first_name, p.last_name)}</h1>
          <p className="clients-detail__ref"><code>{p.reference}</code> · Inscrit le {fmtDate(p.created_at)} · Dernière connexion {p.last_sign_in_at ? fmtDateTime(p.last_sign_in_at) : 'jamais'}</p>
        </div>
        <div className="clients-badges clients-badges--lg">
          <span className={'ef-pill' + (p.status === 'active' ? ' ef-pill--ready' : p.status === 'suspended' ? ' ef-pill--failed' : '')}>{STATUSES[p.status]}</span>
          {p.is_minor && <span className="ef-pill ef-pill--processing">Mineur{p.age !== null ? ` · ${p.age} ans` : ''}</span>}
          {p.role === 'admin' && <span className="ef-pill">Administrateur</span>}
          {p.role === 'staff' && <span className="ef-pill">Équipe scan</span>}
          {d.organizations.length > 0 && <span className="ef-pill">Organisateur</span>}
        </div>
      </header>

      <div className="org-tabs clients-detail__tabs" role="tablist" aria-label="Sections de la fiche">
        {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={'org-tab' + (tab === t.id ? ' is-active' : '')} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      {tab === 'info' && <InfoTab id={id} profile={p} onSaved={refresh} />}
      {tab === 'events' && <EventsTab orders={d.orders} />}
      {tab === 'orders' && <OrdersTab orders={d.orders} />}
      {tab === 'consents' && <ConsentsTab orders={d.orders} isMinor={p.is_minor} />}
      {tab === 'history' && <HistoryTab history={d.history} />}
      {tab === 'security' && <SecurityTab id={id} profile={p} isSuper={isSuper} onChanged={refresh} />}
    </div>
  );
}

// --------------------------------------------------------------------- Informations
function InfoTab({ id, profile, onSaved }: { id: string; profile: ClientDetail['profile']; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<EditForm>({ first_name: profile.first_name, last_name: profile.last_name, phone: profile.phone, phone2: profile.phone2, email: profile.email, birth_date: profile.birth_date ?? '', reason: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof EditForm, string>>>({});
  const [confirm, setConfirm] = useState<{ before: Record<string, unknown>; after: Record<string, unknown>; ageWarning: boolean } | null>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const confirmRef = useRef<HTMLDialogElement>(null);
  // <dialog>.showModal() : piège du focus, fermeture au clavier (Échap) et fond du site rendu inerte — pas un simple <dialog open>.
  useEffect(() => { const d = confirmRef.current; if (!d) return; if (confirm && !d.open) d.showModal(); if (!confirm && d.open) d.close(); }, [confirm]);

  function startEdit() { setF({ first_name: profile.first_name, last_name: profile.last_name, phone: profile.phone, phone2: profile.phone2, email: profile.email, birth_date: profile.birth_date ?? '', reason: '' }); setErrors({}); setErr(''); setMsg(''); setEditing(true); }

  async function review() {
    const v = validateEditForm(f, { email: profile.email, birth_date: profile.birth_date });
    if (!v.ok) { setErrors(v.errors); return; }
    setErrors({}); setBusy(true); setErr('');
    const r = await call(`/api/admin-clients/${id}/check`, 'POST', { ...f, expected_updated_at: profile.updated_at });
    setBusy(false);
    if (!r.ok) { setErr(r.status === 409 ? 'Ce compte a été modifié entre-temps : recharge la page avant de réessayer.' : r.data.error || 'Vérification impossible.'); return; }
    if (Object.keys(r.data.after ?? {}).length === 0) { setErr('Aucune modification à enregistrer.'); return; }
    setConfirm(r.data);
  }
  async function commit() {
    setBusy(true); setErr('');
    const r = await call(`/api/admin-clients/${id}`, 'PATCH', { ...f, expected_updated_at: profile.updated_at });
    setBusy(false); setConfirm(null);
    if (!r.ok) { setErr(r.status === 409 ? 'Ce compte a été modifié entre-temps : recharge la page avant de réessayer.' : r.data.error || 'Enregistrement impossible.'); return; }
    setEditing(false);
    setMsg(r.data.warnings?.length ? `Enregistré. ${r.data.warnings.join(' ')}` : 'Modifications enregistrées.');
    onSaved();
  }

  const rows: [string, keyof EditForm, string][] = [['Prénom', 'first_name', 'text'], ['Nom', 'last_name', 'text'], ['Téléphone', 'phone', 'tel'], ['Téléphone secondaire', 'phone2', 'tel'], ['E-mail', 'email', 'email'], ['Date de naissance', 'birth_date', 'date']];
  const sensitiveChanged = f.email.trim().toLowerCase() !== profile.email.toLowerCase() || (f.birth_date || null) !== profile.birth_date;

  return (
    <section className="glass ef-card">
      {!editing ? (
        <>
          <h2>Informations</h2>
          <dl className="clients-dl">
            <div><dt>Prénom</dt><dd>{profile.first_name || NOT_SET}</dd></div>
            <div><dt>Nom</dt><dd>{profile.last_name ? upperName(profile.last_name) : NOT_SET}</dd></div>
            <div><dt>Téléphone</dt><dd>{profile.phone ? formatPhone(profile.phone) : NOT_SET}</dd></div>
            <div><dt>Téléphone secondaire</dt><dd>{profile.phone2 ? formatPhone(profile.phone2) : NOT_SET}</dd></div>
            <div><dt>E-mail</dt><dd>{profile.email || NOT_SET}</dd></div>
            <div><dt>Date de naissance</dt><dd>{profile.birth_date ? <>{fmtBirth(profile.birth_date)}{profile.age !== null && ` (${profile.age} ans)`}</> : NOT_SET}</dd></div>
          </dl>
          {profile.status === 'anonymized' ? <p className="ef-help">Compte anonymisé : l’identité ne peut plus être modifiée.</p> : <button type="button" className="btn btn--outline" onClick={startEdit}>Modifier</button>}
          {msg && <p className="ef-help" role="status">{msg}</p>}
        </>
      ) : (
        <>
          <h2>Modifier les informations</h2>
          <div className="ef-grid">
            {rows.map(([label, key, type]) => (
              <div className="ef-field" key={key}>
                <label htmlFor={`in-${key}`}>{label}</label>
                <input id={`in-${key}`} type={type} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
                {errors[key] && <span className="ef-err">{errors[key]}</span>}
              </div>
            ))}
            {sensitiveChanged && <div className="ef-field" style={{ gridColumn: '1/-1' }}>
              <label htmlFor="in-reason">Motif (obligatoire pour l’e-mail ou la date de naissance)</label>
              <input id="in-reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
              {errors.reason && <span className="ef-err">{errors.reason}</span>}
            </div>}
          </div>
          {err && <p className="ef-err" role="alert">{err}</p>}
          <div className="ef-row">
            <button type="button" className="btn btn--amber" disabled={busy} onClick={review}>Vérifier et enregistrer</button>
            <button type="button" className="ef-link" onClick={() => setEditing(false)}>Annuler</button>
          </div>
        </>
      )}
      <dialog ref={confirmRef} className="clients-dialog" aria-labelledby="conf-title" onClose={() => setConfirm(null)}>
        {confirm && (
          <>
            <h2 id="conf-title">Confirmer les modifications</h2>
            <table className="clients-diff"><thead><tr><th>Champ</th><th>Avant</th><th>Après</th></tr></thead>
              <tbody>{Object.keys(confirm.after).map((k) => <tr key={k}><td>{FIELD_LABEL[k] ?? k}</td><td>{fmtValue(k, confirm.before[k])}</td><td><strong>{fmtValue(k, confirm.after[k])}</strong></td></tr>)}</tbody></table>
            {confirm.ageWarning && <p className="ef-warn" role="alert">Attention : l’âge obtenu avec cette date de naissance sort de la fourchette 12–100 ans. Vérifie la saisie avant de continuer.</p>}
            <div className="ef-row">
              <button type="button" className="btn btn--amber" disabled={busy} onClick={commit}>{busy ? 'Enregistrement…' : 'Confirmer'}</button>
              <button type="button" className="ef-link" onClick={() => setConfirm(null)}>Retour</button>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}

// --------------------------------------------------------------------- Évènements
function orderRow(o: ClientOrder) {
  const qty = o.items.reduce((n, i) => n + i.quantity, 0);
  return (
    <tr key={o.id}>
      <td data-label="Évènement"><a href={`/editions/${o.event_slug}`}>{o.event_title}</a></td>
      <td data-label="Date">{fmtDate(o.starts_at)}</td>
      <td data-label="Tarif">{o.items.map((i) => i.tier_name).join(', ') || NOT_SET}</td>
      <td data-label="Billets" className="clients-num">{qty}</td>
      <td data-label="Commande">{o.source === 'web' ? <a href={`/admin/billetterie/commandes/${o.id}`}><code>{o.order_number}</code></a> : <code>{o.order_number}</code>}</td>
      <td data-label="Statut">{orderStatusLabel(o.status, o.total_cents)}</td>
      <td data-label="Montant">{fmtEuros(o.total_cents)}</td>
    </tr>
  );
}
function OrdersTable({ orders, empty }: { orders: ClientOrder[]; empty: string }) {
  if (orders.length === 0) return <p className="clients-empty">{empty}</p>;
  return <div className="org-table clients-table"><table><thead><tr><th>Évènement</th><th>Date</th><th>Tarif</th><th>Billets</th><th>Commande</th><th>Statut</th><th>Montant</th></tr></thead><tbody>{orders.map(orderRow)}</tbody></table></div>;
}
function EventsTab({ orders }: { orders: ClientOrder[] }) {
  const now = Date.now();
  const upcoming = orders.filter((o) => new Date(o.starts_at).getTime() >= now);
  const past = orders.filter((o) => new Date(o.starts_at).getTime() < now);
  return (
    <section className="glass ef-card">
      <h2>À venir</h2><OrdersTable orders={upcoming} empty="Aucun évènement à venir." />
      <h2 style={{ marginTop: 'var(--s-24)' }}>Passés</h2><OrdersTable orders={past} empty="Aucun évènement passé." />
    </section>
  );
}

// --------------------------------------------------------------------- Commandes et billets
function OrdersTab({ orders }: { orders: ClientOrder[] }) {
  if (orders.length === 0) return <section className="glass org-empty"><h3>Aucune commande</h3><p>Ce compte n’a passé aucune commande.</p></section>;
  return (
    <section className="glass ef-card">
      <h2>Commandes et billets</h2>
      {orders.map((o) => (
        <div key={o.id} className="clients-order">
          <h3>{o.order_number} <span className="ef-pill">{orderStatusLabel(o.status, o.total_cents)}</span></h3>
          <p className="ef-help">{o.event_title} · {fmtDate(o.starts_at)} · {fmtEuros(o.total_cents)}{o.refunded_cents > 0 && ` (dont ${fmtEuros(o.refunded_cents)} remboursés)`}</p>
          {o.tickets.length === 0 ? <p className="clients-empty">Aucun billet.</p> : (
            <ul className="ef-list">{o.tickets.map((t) => <li key={t.reference}><code>{t.reference}</code> · {t.tier_name} · {t.holder || NOT_SET} · {TICKET_STATUS[t.status] ?? t.status}</li>)}</ul>
          )}
        </div>
      ))}
    </section>
  );
}

// --------------------------------------------------------------------- Autorisations et consentements
function ConsentsTab({ orders, isMinor }: { orders: ClientOrder[]; isMinor: boolean }) {
  const withConsent = orders.filter((o) => o.guardian_consent_at || o.terms_accepted_at || o.consents.length > 0);
  return (
    <section className="glass ef-card">
      <h2>Autorisations parentales et consentements</h2>
      {isMinor && <p className="ef-warn">Compte mineur : collecte minimale, aucune donnée au-delà de ce qui est affiché ici.</p>}
      {withConsent.length === 0 ? <p className="clients-empty">Aucune autorisation ni consentement enregistré.</p> : (
        <div className="org-table clients-table"><table><thead><tr><th>Commande</th><th>Autorisation parentale</th><th>CGV acceptées</th><th>Consentements</th></tr></thead>
          <tbody>{withConsent.map((o) => (
            <tr key={o.id}>
              <td data-label="Commande"><code>{o.order_number}</code></td>
              <td data-label="Autorisation parentale">{o.guardian_consent_at ? fmtDateTime(o.guardian_consent_at) : NOT_SET}</td>
              <td data-label="CGV acceptées">{o.terms_accepted_at ? `${fmtDateTime(o.terms_accepted_at)}${o.terms_version ? ` (${o.terms_version})` : ''}` : NOT_SET}</td>
              <td data-label="Consentements">{o.consents.length === 0 ? NOT_SET : <ul className="ef-list">{o.consents.map((c) => <li key={c.key}>{c.accepted ? '✔' : '✘'} {c.label} — {fmtDateTime(c.at)}</li>)}</ul>}</td>
            </tr>))}</tbody></table></div>
      )}
    </section>
  );
}

// --------------------------------------------------------------------- Historique
function diffLine(e: ClientHistoryEntry) {
  if (!e.before && !e.after) return null;
  const keys = new Set([...Object.keys(e.before ?? {}), ...Object.keys(e.after ?? {})]);
  if (keys.size === 0) return null;
  return <ul className="ef-list clients-histdiff">{[...keys].map((k) => <li key={k}>{FIELD_LABEL[k] ?? k} : {fmtValue(k, e.before?.[k])} → <strong>{fmtValue(k, e.after?.[k])}</strong></li>)}</ul>;
}
function HistoryTab({ history }: { history: ClientHistoryEntry[] }) {
  if (history.length === 0) return <section className="glass org-empty"><h3>Aucune activité</h3><p>Aucune consultation ni modification n’a encore été journalisée.</p></section>;
  return (
    <section className="glass ef-card">
      <h2>Historique</h2>
      <ul className="ef-list clients-hist">{history.map((e) => (
        <li key={e.id}>
          <p><strong>{ACTION_LABEL[e.action] ?? e.action}</strong> · {fmtDateTime(e.created_at)} · {e.actor_name || (e.actor_id ? 'Administrateur' : 'Système')}</p>
          {e.reason && <p className="ef-help">Motif : {e.reason}</p>}
          {diffLine(e)}
        </li>))}</ul>
    </section>
  );
}

// --------------------------------------------------------------------- Sécurité et RGPD
function SecurityTab({ id, profile, isSuper, onChanged }: { id: string; profile: ClientDetail['profile']; isSuper: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const [reason, setReason] = useState(''); const [showSuspend, setShowSuspend] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(''); const [showAnon, setShowAnon] = useState(false);
  const anonDialog = useRef<HTMLDivElement>(null);

  async function run(key: string, fn: () => Promise<{ ok: boolean; status: number; data: { error?: string; sent?: boolean; orders_kept?: number } }>, okMsg: (d: { sent?: boolean; orders_kept?: number }) => string) {
    setBusy(key); setErr(''); setMsg('');
    const r = await fn(); setBusy('');
    if (!r.ok) { setErr(r.data.error || 'Action impossible.'); return; }
    setMsg(okMsg(r.data)); onChanged();
  }

  const anonymized = profile.status === 'anonymized';

  return (
    <section className="glass ef-card">
      <h2>Sécurité</h2>
      {anonymized ? <p className="ef-help">Compte anonymisé : les actions de sécurité ne s’appliquent plus.</p> : (
        <div className="ef-row">
          <button type="button" className="btn btn--outline" disabled={!!busy} onClick={() => run('pwd', () => call(`/api/admin-clients/${id}/password-reset`, 'POST'), (d) => d.sent ? 'E-mail de réinitialisation envoyé.' : 'Compte sans e-mail : envoi impossible.')}>Envoyer un e-mail de réinitialisation</button>
          <button type="button" className="btn btn--outline" disabled={!!busy} onClick={() => { if (window.confirm('Déconnecter toutes les sessions actives de ce compte ?')) run('sess', () => call(`/api/admin-clients/${id}/revoke-sessions`, 'POST'), () => 'Sessions déconnectées.'); }}>Déconnecter toutes les sessions</button>
          {profile.status === 'active'
            ? <button type="button" className="btn btn--outline" disabled={!!busy} onClick={() => { setShowSuspend(true); setReason(''); }}>Suspendre le compte</button>
            : <button type="button" className="btn btn--outline" disabled={!!busy} onClick={() => { setShowSuspend(true); setReason(''); }}>Réactiver le compte</button>}
        </div>
      )}
      {showSuspend && (
        <div className="clients-inline glass">
          <label htmlFor="susp-reason">Motif ({profile.status === 'active' ? 'suspension' : 'réactivation'}, 5 caractères minimum)</label>
          <input id="susp-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="ef-row">
            <button type="button" className="btn btn--amber" disabled={reason.trim().length < 5 || !!busy}
              onClick={() => run('status', () => call(`/api/admin-clients/${id}/status`, 'POST', { status: profile.status === 'active' ? 'suspended' : 'active', reason }), () => { setShowSuspend(false); return profile.status === 'active' ? 'Compte suspendu.' : 'Compte réactivé.'; })}>Confirmer</button>
            <button type="button" className="ef-link" onClick={() => setShowSuspend(false)}>Annuler</button>
          </div>
        </div>
      )}
      {msg && <p className="ef-help" role="status">{msg}</p>}
      {err && <p className="ef-err" role="alert">{err}</p>}

      <h2 style={{ marginTop: 'var(--s-24)' }}>RGPD</h2>
      <div className="ef-row">
        <a className="btn btn--outline" href={`/api/admin-clients/${id}/export`} target="_blank" rel="noreferrer" aria-disabled={!isSuper} onClick={(e) => { if (!isSuper) e.preventDefault(); }}>Exporter les données du compte (JSON)</a>
      </div>
      {!isSuper && <p className="ef-help">Réservé au super-administrateur.</p>}
      {isSuper && !anonymized && (
        <div className="ef-row" style={{ marginTop: 'var(--s-16)' }}>
          <button type="button" className="btn btn--outline" onClick={() => { setShowAnon(true); setConfirmEmail(''); setErr(''); }}>Anonymiser le compte</button>
        </div>
      )}
      {showAnon && (
        <div className="clients-inline glass" ref={anonDialog}>
          <p className="ef-warn" role="alert">Action irréversible. L’identité (nom, prénom, e-mail, téléphones, date de naissance) sera retirée ; les commandes restent pour la comptabilité. Refusé s’il reste un billet valide pour un évènement à venir.</p>
          <label htmlFor="anon-email">Retape l’adresse e-mail du compte pour confirmer ({profile.email || NOT_SET})</label>
          <input id="anon-email" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoComplete="off" />
          <div className="ef-row">
            <button type="button" className="btn btn--amber" disabled={!confirmEmail || !!busy}
              onClick={() => run('anon', () => call(`/api/admin-clients/${id}/anonymize`, 'POST', { confirm_email: confirmEmail }), (d) => { setShowAnon(false); return `Compte anonymisé (${d.orders_kept ?? 0} commande(s) conservée(s) pour la comptabilité).`; })}>Anonymiser définitivement</button>
            <button type="button" className="ef-link" onClick={() => setShowAnon(false)}>Annuler</button>
          </div>
        </div>
      )}
    </section>
  );
}
