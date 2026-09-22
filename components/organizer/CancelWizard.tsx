'use client';

import { useEffect, useRef, useState } from 'react';
import { Stepper } from './WizardBits';
import { buildDefaultMessage, isReasonCode, REASON_OPTIONS, step1Errors, step3Errors, type CancelContext, type CancelMode, type ReasonCode } from '@/lib/organizer/cancellation';
import { formatEuro, formatGp } from '@/lib/ticketing/time';
import './wizard.css';

const STEPS = ['Mode', 'Impact', 'Raison et message'];

/** Annulation d'un évènement en 3 étapes : mode (annuler seul / remplacer), impact et confirmation, raison obligatoire
 *  + message d'excuse pré-rempli (éditable, aperçu avant envoi). Irréversible : la dernière étape exige de retaper
 *  l'adresse de l'évènement. Le serveur revérifie TOUT (rôle, évènement annulable, raison, message). */
export default function CancelWizard({ slug, ctx }: { slug: string; ctx: CancelContext }) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<CancelMode | ''>('');
  const [replacement, setReplacement] = useState('');
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState<ReasonCode | ''>('');
  const [detail, setDetail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [confirmSlug, setConfirmSlug] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  const head = useRef<HTMLHeadingElement>(null);

  useEffect(() => { head.current?.focus(); }, [step]);

  const rep = ctx.replacements.find((r) => r.slug === replacement) ?? null;

  function pickReason(r: ReasonCode) {
    setReason(r);
    const filled = buildDefaultMessage(ctx.templates[r], ctx.event, mode === 'replace' ? rep : null);
    setSubject(filled.subject); setBody(filled.body);
  }

  function next() {
    if (step === 0) { const e = step1Errors(mode, replacement, ctx.replacements.length > 0); setErrs(e); if (Object.keys(e).length) return; }
    if (step === 1 && !ack) { setErrs({ ack: 'Confirme que tu as pris connaissance de l’impact avant de continuer.' }); return; }
    setErrs({}); setStep((n) => n + 1);
  }

  async function submit() {
    const e = step3Errors(reason, detail, subject, body); setErrs(e);
    if (Object.keys(e).length) return;
    if (confirmSlug !== slug) { setErrs({ confirm: 'Recopie exactement l’adresse de l’évènement pour confirmer.' }); return; }
    if (!isReasonCode(reason)) return;
    setBusy(true); setFail('');
    const r = await fetch(`/api/organisateur/events/${slug}/cancellation`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, replacement: mode === 'replace' ? replacement : undefined, reason, detail, subject, body }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setBusy(false); setFail(j.error ?? 'Annulation impossible. Réessaie.'); return; }
    window.location.reload();
  }

  return (
    <div className="wiz">
      <Stepper steps={STEPS} current={step} />
      <section className="wiz__card glass" aria-labelledby="cnc-h">
        <h2 id="cnc-h" ref={head} tabIndex={-1}>{['Comment veux-tu annuler ?', 'Ce que ça va changer', 'Explique et préviens les participants'][step]}</h2>

        {step === 0 && (
          <>
            <p className="wiz__lead">« {ctx.event.title} », le {formatGp(ctx.event.starts_at)}{ctx.event.venue ? ` · ${ctx.event.venue}` : ''}. Cette action est <strong>irréversible</strong>.</p>
            <div className="wiz__picks">
              <label className={'wiz__pick' + (mode === 'cancel' ? ' is-selected' : '')}>
                <input type="radio" name="mode" checked={mode === 'cancel'} onChange={() => { setMode('cancel'); setReplacement(''); }} />
                <strong>Annuler simplement</strong><span>Les participants sont remboursés, aucun autre évènement n’est proposé.</span>
              </label>
              <label className={'wiz__pick' + (mode === 'replace' ? ' is-selected' : '') + (ctx.replacements.length === 0 ? ' is-disabled' : '')}>
                <input type="radio" name="mode" disabled={ctx.replacements.length === 0} checked={mode === 'replace'} onChange={() => setMode('replace')} />
                <strong>Remplacer par un autre évènement</strong><span>{ctx.replacements.length === 0 ? 'Aucun autre évènement publié disponible.' : 'Le message mentionnera le nouvel évènement ; les participants sont tout de même remboursés.'}</span>
              </label>
            </div>
            {mode === 'replace' && ctx.replacements.length > 0 && (
              <div className="wiz__field"><label htmlFor="cnc-rep">Évènement de remplacement</label>
                <select id="cnc-rep" value={replacement} onChange={(e) => setReplacement(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {ctx.replacements.map((r) => <option key={r.slug} value={r.slug}>{r.title} — {formatGp(r.starts_at)}</option>)}
                </select>
              </div>
            )}
            {errs.mode && <p className="wiz__err" role="alert">{errs.mode}</p>}
            {errs.replacement && <p className="wiz__err" role="alert">{errs.replacement}</p>}
          </>
        )}

        {step === 1 && (
          <>
            <dl className="wiz__recap">
              <dt>Billets valides annulés</dt><dd>{ctx.impact.valid_tickets}</dd>
              <dt>Commandes payées à rembourser</dt><dd>{ctx.impact.paid_orders} (jusqu’à {formatEuro(ctx.impact.refund_cents)}, remboursement automatique via Stripe)</dd>
              <dt>Paiements en cours coupés</dt><dd>{ctx.impact.pending_orders}</dd>
              <dt>Participants prévenus par e-mail</dt><dd>{ctx.impact.recipients}</dd>
            </dl>
            <p className="wiz__hint">La billetterie se ferme immédiatement. Les remboursements et l’envoi du message se font juste après, automatiquement ; si l’un d’eux échoue, tu pourras le relancer depuis cette page.</p>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 600 }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>J’ai compris l’impact ci-dessus et je veux continuer vers l’annulation.</span>
            </label>
            {errs.ack && <p className="wiz__err" role="alert">{errs.ack}</p>}
          </>
        )}

        {step === 2 && (
          <>
            <div className="wiz__field"><label htmlFor="cnc-reason">Raison de l’annulation</label>
              <select id="cnc-reason" value={reason} onChange={(e) => pickReason(e.target.value as ReasonCode)}>
                <option value="">— Choisir —</option>
                {REASON_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="wiz__hint">Enregistrée dans le journal, visible par l’administration ; jamais montrée telle quelle aux participants.</p>
            </div>
            {errs.reason && <p className="wiz__err" role="alert">{errs.reason}</p>}
            {reason === 'other' && (
              <div className="wiz__field"><label htmlFor="cnc-detail">Précise la raison</label>
                <textarea id="cnc-detail" rows={2} maxLength={500} value={detail} onChange={(e) => setDetail(e.target.value)} />
                {errs.detail && <p className="wiz__err" role="alert">{errs.detail}</p>}
              </div>
            )}
            {reason && (
              <>
                <div className="wiz__field"><label htmlFor="cnc-subject">Objet du message aux participants</label>
                  <input id="cnc-subject" value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} />
                  {errs.subject && <p className="wiz__err" role="alert">{errs.subject}</p>}
                </div>
                <div className="wiz__field"><label htmlFor="cnc-body">Message (pré-rempli, modifiable)</label>
                  <textarea id="cnc-body" rows={10} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
                  <p className="wiz__hint">{body.length}/2000 · <button type="button" className="ef-link" onClick={() => pickReason(reason)}>Revenir au message pré-rempli</button></p>
                  {errs.body && <p className="wiz__err" role="alert">{errs.body}</p>}
                </div>
                <details className="ef-card" style={{ padding: 12 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Aperçu de l’e-mail envoyé aux {ctx.impact.recipients} participant(s)</summary>
                  <p style={{ marginTop: 10 }}><strong>Objet :</strong> {subject}</p>
                  <p style={{ whiteSpace: 'pre-line' }}>{body}</p>
                </details>
                <div className="wiz__field"><label htmlFor="cnc-confirm">Pour confirmer cette action irréversible, retape l’adresse de l’évènement : <code>{slug}</code></label>
                  <input id="cnc-confirm" value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} />
                  {errs.confirm && <p className="wiz__err" role="alert">{errs.confirm}</p>}
                </div>
              </>
            )}
          </>
        )}

        {fail && <p className="wiz__err" role="alert">{fail}</p>}
        <div className="wiz__nav">
          {step > 0 && <button type="button" className="btn btn--outline" disabled={busy} onClick={() => setStep((n) => n - 1)}>Précédent</button>}
          {step < 2
            ? <button type="button" className="btn btn--amber" onClick={next}>Continuer</button>
            : <button type="button" className="btn btn--amber" disabled={busy || confirmSlug !== slug} onClick={submit}>{busy ? 'Annulation en cours…' : 'Annuler l’évènement'}</button>}
        </div>
      </section>
    </div>
  );
}
