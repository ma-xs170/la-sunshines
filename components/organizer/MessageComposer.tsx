'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Preview { count: number; sample: string[]; replyTo: string; organizerName: string; remainingToday: number; subject: string; html: string }
interface Sent { total: number; sent: number; failed: number }
export interface MessageRow { id: string; subject: string; scope: string; recipient_count: number; sent_count: number; failed_count: number; status: string; created_at: string }

const SCOPE_LABEL: Record<string, string> = { all: 'Tous', tier: 'Un tarif', selection: 'Sélection' };
const STATUS_LABEL: Record<string, string> = { sending: 'En cours', sent: 'Envoyé', partial: 'Partiel', failed: 'Échec' };

/** Message d'information aux participants : rédaction → aperçu → confirmation → envoi. Jamais de promotion, jamais de lien. */
export default function MessageComposer({ slug, tiers, selected, history, replyTo }: {
  slug: string; tiers: { id: string; name: string }[]; selected: string[]; history: MessageRow[]; replyTo: string;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [scope, setScope] = useState<'all' | 'tier' | 'selection'>('all');
  const [tierId, setTierId] = useState(tiers[0]?.id ?? '');
  const [noPromo, setNoPromo] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const payload = (action: 'preview' | 'send') => ({
    action, subject, body, scope, noPromo,
    ...(scope === 'tier' ? { tierId } : {}), ...(scope === 'selection' ? { ticketIds: selected } : {}),
    ...(action === 'send' ? { confirm: true } : {}),
  });
  async function call(action: 'preview' | 'send') {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/organisateur/events/${slug}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(action)) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? 'Action impossible.'); return; }
      if (action === 'preview') { setPreview(j as Preview); setSent(null); }
      else { setSent(j as Sent); setPreview(null); setSubject(''); setBody(''); setNoPromo(false); router.refresh(); }
    } finally { setBusy(false); }
  }

  return (
    <section className="org-composer glass" aria-labelledby="org-msg-h">
      <h2 id="org-msg-h">Écrire aux participants</h2>
      <p className="org-muted">Message d’<strong>information</strong> lié à l’événement (horaires, accès, consignes…). Aucune promotion, aucun lien. La réponse des participants arrive à <strong>{replyTo || '[À COMPLÉTER : adresse de réponse]'}</strong>. Limite : 3 messages par événement et par 24 h.</p>

      {sent && (
        <p className={sent.failed === 0 ? 'auth-ok' : 'auth-notice'} role="status" style={{ padding: 14, borderRadius: 14 }}>
          {sent.failed === 0 ? `Message envoyé à ${sent.sent} destinataire${sent.sent > 1 ? 's' : ''}.` : `${sent.sent} envoyé${sent.sent > 1 ? 's' : ''}, ${sent.failed} en échec (voir l’historique).`}
        </p>
      )}

      {!preview && (
        <form className="org-composer__form" onSubmit={(e) => { e.preventDefault(); void call('preview'); }}>
          <label className="admin-field"><span>Objet</span><input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} required /></label>
          <label className="admin-field"><span>Message ({body.length}/2000)</span><textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required /></label>
          <fieldset className="org-composer__scope">
            <legend>Destinataires</legend>
            <label><input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} /> Tous les participants</label>
            <label><input type="radio" name="scope" checked={scope === 'tier'} onChange={() => setScope('tier')} /> Un tarif
              {scope === 'tier' && <select value={tierId} onChange={(e) => setTierId(e.target.value)} aria-label="Tarif">{tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
            </label>
            <label><input type="radio" name="scope" checked={scope === 'selection'} onChange={() => setScope('selection')} /> La sélection dans le tableau ({selected.length})</label>
          </fieldset>
          <label className="org-composer__check"><input type="checkbox" checked={noPromo} onChange={(e) => setNoPromo(e.target.checked)} required />
            <span>Je confirme que ce message ne contient aucune promotion ni publicité, seulement des informations liées à cet événement.</span></label>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <div className="auth-actions"><button className="btn btn--amber" disabled={busy || (scope === 'selection' && selected.length === 0)}>{busy ? 'Préparation…' : 'Aperçu avant envoi'}</button></div>
        </form>
      )}

      {preview && (
        <div className="org-composer__preview">
          <p><strong>{preview.count}</strong> destinataire{preview.count > 1 ? 's' : ''} (acheteurs des billets concernés) — ex. {preview.sample.join(', ') || '—'}</p>
          <p className="org-muted">Expéditeur : LA SUNSHINES · Réponse à : {preview.replyTo} · Il te reste {preview.remainingToday} envoi{preview.remainingToday > 1 ? 's' : ''} sur 24 h.</p>
          <iframe title="Aperçu de l’email" className="org-composer__frame" sandbox="" srcDoc={preview.html} />
          {error && <p className="admin-error" role="alert">{error}</p>}
          <div className="auth-actions">
            <button className="btn btn--amber" disabled={busy || preview.remainingToday < 1} onClick={() => void call('send')}>{busy ? 'Envoi en cours…' : `Confirmer et envoyer à ${preview.count}`}</button>
            <button className="btn btn--outline" disabled={busy} onClick={() => { setPreview(null); setError(''); }}>Modifier</button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="org-composer__history">
          <h3>Messages envoyés</h3>
          <ul>
            {history.map((m) => (
              <li key={m.id}>
                <span><strong>{m.subject}</strong> <em>{SCOPE_LABEL[m.scope] ?? m.scope}</em></span>
                <span>{new Date(m.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Guadeloupe' })} · {m.sent_count}/{m.recipient_count} envoyé{m.sent_count > 1 ? 's' : ''}{m.failed_count > 0 ? ` · ${m.failed_count} en échec` : ''} · {STATUS_LABEL[m.status] ?? m.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
