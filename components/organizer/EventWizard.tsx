'use client';

import { useEffect, useRef, useState } from 'react';
import { Field, Stepper } from './WizardBits';
import { BIZOUK_SANDBOX, parseBizoukCode } from '@/lib/bizoukEmbed';
import { EVENT_TYPES, MODE_LABEL, ORG_BLOCK_NOTE, ORG_STATUS_LABEL, infoErrors, selectable, type OrgCard, type TicketingMode } from '@/lib/organizer/create-event';
import { REGIONS, REGION_LABEL } from '@/lib/calendar';

const STEPS = ['Organisation', 'Billetterie', 'Informations'];
const KEY = 'sun_event_wizard_v1';
interface Info { title: string; event_type: string; date: string; time: string; venue_name: string; city: string; region: string; visibility: string }
const EMPTY: Info = { title: '', event_type: '', date: '', time: '', venue_name: '', city: '', region: '', visibility: 'public' };
const MODES: { id: TicketingMode; title: string; text: string }[] = [
  { id: 'internal', title: 'Vente sur le site', text: 'Billetterie interne : tarifs, stock, billets QR et PDF, paiement par carte (Stripe). Les tarifs gratuits sont possibles.' },
  { id: 'bizouk', title: 'Code d’intégration Bizouk', text: 'Tu colles le code fourni par Bizouk : son widget s’affiche sur la page de l’évènement. ' },
  { id: 'none', title: 'Pas de billetterie pour l’instant', text: 'Évènement à titre d’information. Tu pourras ajouter une billetterie plus tard.' },
];

/** Meilleure lecture possible des textes du flyer (l'IA renvoie du texte libre) : l'organisateur relit toujours. */
function readDate(s: string): string { const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(s); if (iso) return iso[0]; const fr = /(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(s); return fr ? `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}` : ''; }
function readTime(s: string): string { const m = /(\d{1,2})\s*[h:]\s*(\d{2})?/i.exec(s); return m ? `${m[1].padStart(2, '0')}:${m[2] ?? '00'}` : ''; }

/** Création d'évènement guidée en 3 étapes. Le serveur revérifie TOUT (organisation, approbation, code Bizouk) : ce formulaire n'est qu'une aide à la saisie. */
export default function EventWizard({ orgs: initialOrgs, isAdmin, aiAvailable, defaultOrg }: { orgs: OrgCard[]; isAdmin: boolean; aiAvailable: boolean; defaultOrg: string | null }) {
  const [orgs, setOrgs] = useState(initialOrgs);
  const [step, setStep] = useState(0);
  const [org, setOrg] = useState<string>(defaultOrg && initialOrgs.some((o) => o.id === defaultOrg && selectable(o)) ? defaultOrg : '');
  const [mode, setMode] = useState<TicketingMode | ''>('');
  const [code, setCode] = useState('');
  const [info, setInfo] = useState<Info>(EMPTY);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  const [ref, setRef] = useState(''); const [refMsg, setRefMsg] = useState('');
  const [ai, setAi] = useState('');
  const head = useRef<HTMLHeadingElement>(null);

  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (v) { if (v.info) setInfo((x) => ({ ...x, ...v.info })); if (v.mode) setMode(v.mode); if (typeof v.code === 'string') setCode(v.code); if (v.org && initialOrgs.some((o) => o.id === v.org && selectable(o))) setOrg(v.org); } } catch { /* stockage indisponible */ } }, [initialOrgs]);
  useEffect(() => { const t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ info, mode, code, org })); } catch { /* ignore */ } }, 500); return () => clearTimeout(t); }, [info, mode, code, org]);
  useEffect(() => { head.current?.focus(); }, [step]);

  const parsed = mode === 'bizouk' && code.trim() ? parseBizoukCode(code) : null;
  const setI = (k: keyof Info, v: string) => setInfo((x) => ({ ...x, [k]: v }));
  const checkInfo = (k: string) => setErrs((x) => { const e = infoErrors(info); const n = { ...x }; if (e[k]) n[k] = e[k]; else delete n[k]; return n; });
  const inp = (k: keyof Info) => ({ value: info[k], onChange: (e: { target: { value: string } }) => setI(k, e.target.value), onBlur: () => checkInfo(k) });

  function next() {
    if (step === 0 && !org) { setErrs({ org: 'Choisis une organisation approuvée pour continuer.' }); return; }
    if (step === 1) {
      if (!mode) { setErrs({ mode: 'Choisis une méthode de billetterie.' }); return; }
      if (mode === 'bizouk') { const p = parseBizoukCode(code); if (!p.ok) { setErrs({ bizouk_code: p.message }); document.getElementById('bizouk_code')?.focus(); return; } }
    }
    setErrs({}); setStep((n) => n + 1);
  }

  async function findOrg() {
    setRefMsg('');
    const r = await fetch(`/api/organisateur/orgs?ref=${encodeURIComponent(ref.trim())}`); const j = await r.json().catch(() => ({}));
    if (!r.ok) { setRefMsg(j.error ?? 'Recherche impossible.'); return; }
    setOrgs((x) => (x.some((o) => o.id === j.id) ? x : [...x, { id: j.id, name: j.name, reference: j.reference, siret: j.siret, status: j.status, events: j.events }]));
    if (j.status === 'approved') setOrg(j.id); else setRefMsg('Cette organisation n’est pas approuvée : on ne peut pas créer d’évènement dessus.');
  }

  async function prefill(f: File | undefined) {
    if (!f) return; setAi('Analyse du flyer…');
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 4 * 1048576) { setAi('Choisis un flyer JPEG, PNG ou WebP de 4 Mo maximum.'); return; }
    const image = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
    const r = await fetch('/api/organisateur/flyer-analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }) }); const j = await r.json().catch(() => ({}));
    if (!r.ok) { setAi(j.error ?? 'Analyse impossible.'); return; }
    const d = j.data as { headliner: string; date: string; heure: string; lieu: string };
    setInfo((x) => ({ ...x, title: x.title || d.headliner || '', date: x.date || readDate(d.date), time: x.time || readTime(d.heure), venue_name: x.venue_name || d.lieu || '' }));
    setAi('Champs pré-remplis : relis et corrige avant de valider.');
  }

  async function submit() {
    const e = infoErrors(info); setErrs(e);
    if (Object.keys(e).length) { document.getElementById(Object.keys(e)[0])?.focus(); return; }
    setBusy(true); setFail('');
    const r = await fetch('/api/organisateur/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org, mode, bizouk_code: mode === 'bizouk' ? code : undefined, ...info }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setBusy(false); setFail(j.error ?? 'Création impossible. Réessaie.'); if (j.field) setErrs({ [j.field]: j.error }); return; }
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    window.location.assign(`/organisateur/evenements/${j.slug}?nouveau=1`);
  }

  return (
    <div className="wiz">
      <Stepper steps={STEPS} current={step} />
      <section className="wiz__card glass" aria-labelledby="wiz-h">
        <h2 id="wiz-h" ref={head} tabIndex={-1}>{['Pour quelle organisation ?', 'Comment vends-tu tes billets ?', 'Les informations essentielles'][step]}</h2>

        {step === 0 && (
          <>
            <p className="wiz__lead">L’évènement sera rattaché à l’organisation choisie. Seules les organisations approuvées sont sélectionnables.</p>
            <div className="wiz__picks" role="radiogroup" aria-label="Organisation">
              {orgs.map((o) => {
                const ok = selectable(o);
                return (
                  <label key={o.id} className={'wiz__pick' + (org === o.id ? ' is-selected' : '') + (ok ? '' : ' is-disabled')}>
                    <input type="radio" name="org" value={o.id} checked={org === o.id} disabled={!ok} onChange={() => { setOrg(o.id); setErrs({}); }} aria-describedby={ok ? undefined : `org-note-${o.id}`} />
                    <strong>{o.name}</strong>
                    <span className="org-muted">{o.reference ?? 'Référence attribuée à l’approbation'}{o.siret ? ` · SIRET ${o.siret}` : ''}</span>
                    <span className={'wiz__badge ' + (o.status === 'approved' ? 'wiz__badge--ok' : o.status === 'pending' ? 'wiz__badge--warn' : 'wiz__badge--ko')}>{ORG_STATUS_LABEL[o.status]}</span>
                    <span className="org-muted">{o.events} évènement{o.events > 1 ? 's' : ''}</span>
                    {!ok && <span className="wiz__hint" id={`org-note-${o.id}`}>{ORG_BLOCK_NOTE[o.status as 'pending' | 'suspended']}</span>}
                  </label>
                );
              })}
              <a className="wiz__pick wiz__pick--new" href="/devenir-organisateur"><strong>+ Nouvelle organisation</strong><span className="wiz__hint">Dépose le dossier de ta structure. Elle devra être approuvée par l’équipe avant de créer un évènement.</span></a>
            </div>
            {errs.org && <p className="wiz__err" role="alert">{errs.org}</p>}
            {isAdmin && (
              <div className="wiz__field"><label htmlFor="ref">Administrateur : chercher une organisation par sa référence</label>
                <div className="ef-row"><input id="ref" type="text" placeholder="ORG.12345678" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={12} style={{ maxWidth: 220 }} /><button type="button" className="btn btn--outline" onClick={findOrg}>Chercher</button></div>
                {refMsg && <p className="wiz__err" role="alert">{refMsg}</p>}
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <div className="wiz__picks" role="radiogroup" aria-label="Méthode de billetterie">
              {MODES.map((m) => (
                <label key={m.id} className={'wiz__pick' + (mode === m.id ? ' is-selected' : '')}>
                  <input type="radio" name="mode" value={m.id} checked={mode === m.id} onChange={() => { setMode(m.id); setErrs({}); }} />
                  <strong>{m.title}</strong><span className="wiz__hint">{m.text}</span>
                </label>
              ))}
            </div>
            {errs.mode && <p className="wiz__err" role="alert">{errs.mode}</p>}
            {mode === 'bizouk' && (
              <>
                <Field id="bizouk_code" label="Code d’intégration Bizouk" error={errs.bizouk_code} hint="Colle le code « intégrer » de ta page Bizouk. Seul l’identifiant de l’évènement est conservé : ton code n’est jamais copié tel quel sur le site.">{(p) => <textarea {...p} rows={4} spellCheck={false} value={code} onChange={(e) => { setCode(e.target.value); setErrs({}); }} placeholder='<iframe src="https://www.bizouk.com/stores/reservation/place?event=…"></iframe>' />}</Field>
                {parsed && !parsed.ok && !errs.bizouk_code && <p className="wiz__err" role="alert">{parsed.message}</p>}
                {parsed?.ok && (
                  <div className="wiz__field"><p className="wiz__hint"><strong>Aperçu du widget</strong> (évènement Bizouk n° {parsed.eventId}). <button type="button" className="ef-link" onClick={() => setCode('')}>Retirer ou remplacer le code</button></p>
                    <iframe title="Aperçu du widget Bizouk" src={parsed.src} sandbox={BIZOUK_SANDBOX} referrerPolicy="strict-origin-when-cross-origin" loading="lazy" style={{ width: '100%', height: 420, border: '1px solid var(--panel-border)', borderRadius: 12, background: '#fff' }} />
                  </div>
                )}
                <p className="ef-warn">Les ventes réalisées via Bizouk restent gérées par Bizouk : elles n’apparaissent pas dans les statistiques internes (participants, revenus, finance) de ton espace.</p>
              </>
            )}
            {mode && <p className="wiz__hint">Ce choix est enregistré pour cet évènement et modifiable ensuite dans le menu « Billetterie ».</p>}
          </>
        )}

        {step === 2 && (
          <>
            {aiAvailable && (
              <div className="wiz__file"><label htmlFor="flyer-ai"><strong>Pré-remplir depuis mon flyer</strong></label>
                <input id="flyer-ai" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => prefill(e.target.files?.[0])} />
                {ai && <span role="status" className="wiz__hint">{ai}</span>}
              </div>
            )}
            <div className="wiz__grid">
              <Field id="title" label="Titre de l’évènement" error={errs.title}>{(p) => <input {...p} type="text" maxLength={120} {...inp('title')} />}</Field>
              <Field id="event_type" label="Type d’évènement" error={errs.event_type}>{(p) => <select {...p} value={info.event_type} onChange={(e) => setI('event_type', e.target.value)} onBlur={() => checkInfo('event_type')}><option value="">Choisir…</option>{EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>}</Field>
              <Field id="date" label="Date" error={errs.date}>{(p) => <input {...p} type="date" {...inp('date')} />}</Field>
              <Field id="time" label="Heure de début" error={errs.time}>{(p) => <input {...p} type="time" {...inp('time')} />}</Field>
              <Field id="venue_name" label="Lieu" error={errs.venue_name}>{(p) => <input {...p} type="text" maxLength={120} {...inp('venue_name')} />}</Field>
              <Field id="city" label="Ville" error={errs.city}>{(p) => <input {...p} type="text" maxLength={80} {...inp('city')} />}</Field>
              <Field id="region" label="Région" error={errs.region}>{(p) => <select {...p} value={info.region} onChange={(e) => setI('region', e.target.value)} onBlur={() => checkInfo('region')}><option value="">Choisir…</option>{REGIONS.map((r) => <option key={r} value={r}>{REGION_LABEL[r]}</option>)}</select>}</Field>
              <Field id="visibility" label="Visibilité" error={errs.visibility} hint="Privé : l’évènement n’est pas listé publiquement.">{(p) => <select {...p} value={info.visibility} onChange={(e) => setI('visibility', e.target.value)}><option value="public">Public</option><option value="private">Privé</option></select>}</Field>
            </div>
            <p className="wiz__hint">L’évènement est créé en brouillon : il n’est pas visible du public. Tu compléteras ensuite la description, le dresscode, le flyer et les tarifs.</p>
            {fail && <p className="wiz__err" role="alert">{fail}</p>}
          </>
        )}

        <div className="wiz__nav">
          {step > 0 ? <button type="button" className="btn btn--outline" onClick={() => { setErrs({}); setStep((n) => n - 1); }}>← Retour</button> : <a className="btn btn--outline" href="/organisateur/evenements">Annuler</a>}
          <span className="wiz__saved" aria-live="polite">Brouillon enregistré sur cet appareil.</span>
          {step < 2 ? <button type="button" className="btn btn--amber" onMouseDown={(e) => e.preventDefault()} onClick={next}>Continuer</button> : <button type="button" className="btn btn--amber" onMouseDown={(e) => e.preventDefault()} onClick={submit} disabled={busy}>{busy ? 'Création…' : 'Créer le brouillon'}</button>}
        </div>
      </section>
    </div>
  );
}
