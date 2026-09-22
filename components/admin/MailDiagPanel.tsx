'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface State { resendConfigured: boolean; from: string; domain: string | null; usingFallback: boolean; domainStatus: string | null; domainError: string | null }
const DOMAIN_LABEL: Record<string, string> = { verified: 'Vérifié', pending: 'En attente', failed: 'Échec', not_started: 'Non commencé', partially_verified: 'Partiellement vérifié', partially_failed: 'Partiellement en échec' };

/** Diagnostic e-mail (Réglages > E-mails) : état de la configuration, vérification du domaine d'envoi (Resend), test d'envoi à soi-même. */
export default function MailDiagPanel({ myEmail }: { myEmail: string }) {
  const [s, setS] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try { const r = await fetch('/api/admin-gestion/mail-diag', { cache: 'no-store' }); if (r.ok) setS(await r.json()); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  async function test() {
    setBusy(true); setMsg(null);
    const r = await fetch('/api/admin-gestion/mail-diag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test' }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: `E-mail de test envoyé à ${myEmail}. Vérifie ta boîte (et les indésirables).` } : { ok: false, text: j.error ?? 'Envoi impossible.' });
  }

  return (
    <section className="glass ef-card">
      <h2>E-mails</h2>
      {loading || !s ? <p className="ef-help">Vérification…</p> : (
        <>
          <ul className="ef-list">
            <li><span>Clé Resend (RESEND_API_KEY)</span><strong>{s.resendConfigured ? 'Configurée' : 'Absente'}</strong></li>
            <li><span>Adresse d’expédition (MAIL_FROM)</span><strong>{s.from}{s.usingFallback && ' (domaine de test, non réglée)'}</strong></li>
            {s.domain && !s.usingFallback && <li><span>Domaine</span><strong>{s.domain}{s.domainStatus && ` — ${DOMAIN_LABEL[s.domainStatus] ?? s.domainStatus}`}</strong></li>}
          </ul>
          {s.domainError
            ? <p className="admin-error" role="alert">{s.domainError}</p>
            : <p className="ef-help" role="status">Configuration correcte : le domaine d’expédition est vérifié.</p>}
          {msg && <p className={msg.ok ? 'org-ok' : 'admin-error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
          <div className="ef-row">
            <button type="button" className="btn btn--amber" disabled={busy || !s.resendConfigured} onClick={test}>{busy ? 'Envoi…' : 'Envoyer un e-mail de test à mon adresse'}</button>
            <button type="button" className="btn btn--outline" onClick={load}>Revérifier</button>
          </div>
          <p className="ef-help">Les mots de passe provisoires ne s’affichent jamais ici et ne sont jamais journalisés. « Renvoyer l’invitation » sur un administrateur en attente : rubrique <Link href="/admin/gestion/administrateurs">Administrateurs</Link>.</p>
        </>
      )}
    </section>
  );
}
