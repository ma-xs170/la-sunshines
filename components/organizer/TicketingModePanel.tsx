'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BIZOUK_SANDBOX, bizoukSrc, parseBizoukCode } from '@/lib/bizoukEmbed';
import { MODE_LABEL, type TicketingMode } from '@/lib/organizer/create-event';
import './wizard.css';

const TEXT: Record<TicketingMode, string> = {
  internal: 'Billetterie interne : tarifs, stock, billets QR et PDF, paiement par carte (Stripe). Les tarifs gratuits sont possibles.',
  bizouk: 'Le widget Bizouk s’affiche sur la page de l’évènement. Les ventes restent gérées par Bizouk : elles n’apparaissent pas dans les statistiques internes.',
  none: 'Évènement à titre d’information. Tu pourras ajouter une billetterie plus tard.',
};

/** Méthode de billetterie d'un évènement (menu Billetterie) : cartes, code Bizouk analysé, aperçu, remplacement / retrait. */
export default function TicketingModePanel({ slug, mode: initial, bizoukId, locked }: { slug: string; mode: TicketingMode; bizoukId: string | null; locked: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<TicketingMode>(initial);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const parsed = mode === 'bizouk' && code.trim() ? parseBizoukCode(code) : null;
  const previewId = parsed?.ok ? parsed.eventId : mode === 'bizouk' ? bizoukId : null;

  async function save(next: TicketingMode, withCode: string | undefined) {
    setBusy(true); setErr(''); setMsg('');
    const r = await fetch(`/api/organisateur/events/${slug}/ticketing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: next, bizouk_code: withCode }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setErr(j.error ?? 'Enregistrement impossible.'); return; }
    setMsg('Méthode de billetterie enregistrée.'); setCode(''); router.refresh();
  }

  return (
    <div className="wiz">
      <div className="wiz__picks" role="radiogroup" aria-label="Méthode de billetterie">
        {(Object.keys(MODE_LABEL) as TicketingMode[]).map((m) => (
          <label key={m} className={'wiz__pick' + (mode === m ? ' is-selected' : '') + (locked && m !== initial ? ' is-disabled' : '')}>
            <input type="radio" name="mode" value={m} checked={mode === m} disabled={locked && m !== initial} onChange={() => { setMode(m); setErr(''); setMsg(''); }} />
            <strong>{MODE_LABEL[m]}</strong><span className="wiz__hint">{TEXT[m]}</span>
          </label>
        ))}
      </div>
      {locked && <p className="ef-warn">Des billets ont déjà été vendus : la méthode de billetterie ne peut plus être changée.</p>}
      {mode === 'bizouk' && (
        <section className="wiz__card glass">
          <div className="wiz__field"><label htmlFor="bz">{bizoukId ? 'Remplacer le code d’intégration Bizouk' : 'Code d’intégration Bizouk'}</label>
            <textarea id="bz" rows={4} spellCheck={false} value={code} onChange={(e) => { setCode(e.target.value); setErr(''); }} placeholder='<iframe src="https://www.bizouk.com/stores/reservation/place?event=…"></iframe>' aria-describedby="bz-h" />
            <p className="wiz__hint" id="bz-h">Seul l’identifiant de l’évènement est conservé : le code collé n’est jamais copié tel quel sur le site.</p></div>
          {parsed && !parsed.ok && <p className="wiz__err" role="alert">{parsed.message}</p>}
          {previewId && (<div className="wiz__field"><p className="wiz__hint"><strong>Aperçu du widget</strong> (évènement Bizouk n° {previewId})</p>
            <iframe title="Aperçu du widget Bizouk" src={bizoukSrc(previewId)} sandbox={BIZOUK_SANDBOX} referrerPolicy="strict-origin-when-cross-origin" loading="lazy" style={{ width: '100%', height: 420, border: '1px solid var(--panel-border)', borderRadius: 12, background: '#fff' }} /></div>)}
        </section>
      )}
      {err && <p className="wiz__err" role="alert">{err}</p>}
      {msg && <p role="status" className="wiz__hint">{msg}</p>}
      <div className="wiz__nav">
        <span />
        <div className="ef-row">
          {initial === 'bizouk' && mode === 'bizouk' && <button type="button" className="btn btn--outline" disabled={busy || locked} onClick={() => save('none', undefined)}>Retirer le widget</button>}
          <button type="button" className="btn btn--amber" disabled={busy || locked || (mode === initial && !(mode === 'bizouk' && parsed?.ok)) || (mode === 'bizouk' && !parsed?.ok && initial !== 'bizouk')} onClick={() => save(mode, mode === 'bizouk' ? code : undefined)}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  );
}
