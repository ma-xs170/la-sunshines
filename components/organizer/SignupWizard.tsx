'use client';

import Link from 'next/link';

import { useEffect, useRef, useState } from 'react';
import { Field, Stepper } from './WizardBits';
import { DOC_KINDS, DOC_MAX_BYTES, LEGAL_FORMS, LEGAL_FORM_LABEL, REGIONS_ORG, docOk, stepErrors, submitSchema, type SignupData } from '@/lib/organizer/signup';

interface Doc { kind: 'identity' | 'legal' | 'other'; path: string; name: string; size: number; mime: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' }
const STEPS = ['Structure', 'Responsable', 'Pièces', 'Activité', 'Envoi'];
const KEY = 'sun_org_signup_v1';
const EMPTY: Partial<SignupData> = { name: '', legal_form: undefined, siret: '', address: '', postal_code: '', city: '', responsible_first: '', responsible_last: '', contact_email: '', phone: '', website: '', description: '', regions: [], events_per_year: undefined, accept_terms: undefined };
const KEYS_BY_STEP: Record<number, string[]> = { 0: ['name', 'legal_form', 'siret', 'address', 'postal_code', 'city'], 1: ['responsible_first', 'responsible_last', 'contact_email', 'phone', 'website'], 3: ['description', 'regions', 'events_per_year', 'accept_terms'] };
const STEP_SCHEMA = { 0: 'structure', 1: 'contact', 3: 'activity' } as const;

/** Inscription d'une organisation en 5 pages : validation champ par champ, brouillon enregistré dans ce navigateur (jamais les fichiers), pièces envoyées dans un stockage privé. */
export default function SignupWizard({ email, firstName }: { email: string; firstName: string }) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Partial<SignupData>>({ ...EMPTY, contact_email: email, responsible_first: firstName });
  const [docs, setDocs] = useState<Doc[]>([]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState<string>('');
  const [fail, setFail] = useState('');
  const [done, setDone] = useState<{ reference: string | null } | null>(null);
  const [saved, setSaved] = useState('');
  const head = useRef<HTMLHeadingElement>(null);

  useEffect(() => { try { const raw = localStorage.getItem(KEY); if (raw) { const v = JSON.parse(raw); if (v?.d) setD((x) => ({ ...x, ...v.d })); if (Array.isArray(v?.docs)) setDocs(v.docs); if (typeof v?.step === 'number') setStep(Math.min(4, v.step)); } } catch { /* stockage indisponible */ } }, []);
  useEffect(() => { const t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ d, docs, step })); setSaved('Brouillon enregistré sur cet appareil.'); } catch { /* ignore */ } }, 500); return () => clearTimeout(t); }, [d, docs, step]);
  useEffect(() => { head.current?.focus(); }, [step]);

  const set = <K extends keyof SignupData>(k: K, v: SignupData[K]) => setD((x) => ({ ...x, [k]: v }));
  const check = (k: string) => { const s = STEP_SCHEMA[step as 0 | 1 | 3]; if (!s) return; const e = stepErrors(s, d); setErrs((x) => { const n = { ...x }; if (e[k]) n[k] = e[k]; else delete n[k]; return n; }); };
  const text = (k: keyof SignupData) => ({ value: (d[k] as string | undefined) ?? '', onChange: (e: { target: { value: string } }) => set(k, e.target.value as never), onBlur: () => check(k as string) });

  function next() {
    const s = STEP_SCHEMA[step as 0 | 1 | 3];
    if (s) { const e = stepErrors(s, d); setErrs(e); if (Object.keys(e).length) { document.getElementById(Object.keys(e)[0])?.focus(); return; } }
    if (step === 2) {
      if (!docs.some((x) => x.kind === 'identity') || !docs.some((x) => x.kind === 'legal')) { setErrs({ docs: 'Dépose la pièce d’identité et le justificatif de la structure pour continuer.' }); return; }
    }
    setErrs({}); setStep((n) => Math.min(4, n + 1));
  }

  async function upload(kind: Doc['kind'], f: File | undefined) {
    if (!f) return;
    if (!docOk(f.type, f.size)) { setErrs((x) => ({ ...x, [`file-${kind}`]: `Fichier refusé : PDF, JPEG, PNG ou WebP, ${DOC_MAX_BYTES / 1048576} Mo maximum.` })); return; }
    setUp(kind); setErrs((x) => { const n = { ...x }; delete n[`file-${kind}`]; delete n.docs; return n; });
    const fd = new FormData(); fd.append('file', f);
    const r = await fetch('/api/organisateur/inscription/upload', { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    setUp('');
    if (!r.ok) { setErrs((x) => ({ ...x, [`file-${kind}`]: j.error ?? 'Envoi impossible.' })); return; }
    setDocs((x) => [...x.filter((y) => y.kind !== kind), { kind, path: j.path, name: j.name, size: j.size, mime: j.mime }]);
  }

  async function submit() {
    setFail('');
    const parsed = submitSchema.safeParse({ data: d, docs });
    if (!parsed.success) { setFail(parsed.error.issues[0]?.message ?? 'Formulaire incomplet.'); return; }
    setBusy(true);
    const r = await fetch('/api/organisateur/inscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setFail(j.error ?? 'Envoi impossible. Réessaie.'); return; }
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    setDone({ reference: j.reference ?? null });
  }

  if (done) {
    return (
      <section className="wiz wiz__card glass" role="status">
        <h2 ref={head} tabIndex={-1}>Dossier envoyé</h2>
        <p className="wiz__lead">Merci ! L’équipe LA SUNSHINES examine ton dossier. Ta référence ORG.XXXXXXXX te sera attribuée à l’approbation. Tant que l’organisation n’est pas approuvée, tu peux préparer ton espace mais tu ne peux pas créer d’évènement.</p>
        <div className="wiz__nav"><Link className="btn btn--amber" href="/organisateur">Ouvrir mon espace organisateur</Link></div>
      </section>
    );
  }

  const legal = (LEGAL_FORM_LABEL[d.legal_form ?? ''] ?? '—');
  return (
    <div className="wiz">
      <Stepper steps={STEPS} current={step} />
      <section className="wiz__card glass" aria-labelledby="wiz-h">
        <h2 id="wiz-h" ref={head} tabIndex={-1}>{['Ta structure', 'Responsable et contact', 'Pièces justificatives', 'Ton activité', 'Relis et envoie'][step]}</h2>

        {step === 0 && (
          <>
            <p className="wiz__lead">Ces informations figureront sur les billets et les factures de tes évènements.</p>
            <div className="wiz__grid">
              <Field id="name" label="Nom de la structure" error={errs.name}>{(p) => <input {...p} type="text" autoComplete="organization" maxLength={120} {...text('name')} />}</Field>
              <Field id="legal_form" label="Forme juridique" error={errs.legal_form}>{(p) => <select {...p} value={d.legal_form ?? ''} onChange={(e) => set('legal_form', e.target.value as never)} onBlur={() => check('legal_form')}><option value="">Choisir…</option>{LEGAL_FORMS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Field>
              <Field id="siret" label="SIRET (14 chiffres)" error={errs.siret} hint="Facultatif pour une association sans SIRET.">{(p) => <input {...p} type="text" inputMode="numeric" autoComplete="off" maxLength={17} {...text('siret')} />}</Field>
              <Field id="address" label="Adresse" error={errs.address}>{(p) => <input {...p} type="text" autoComplete="street-address" maxLength={200} {...text('address')} />}</Field>
              <Field id="postal_code" label="Code postal" error={errs.postal_code}>{(p) => <input {...p} type="text" inputMode="numeric" autoComplete="postal-code" maxLength={5} {...text('postal_code')} />}</Field>
              <Field id="city" label="Ville" error={errs.city}>{(p) => <input {...p} type="text" autoComplete="address-level2" maxLength={80} {...text('city')} />}</Field>
            </div>
          </>
        )}

        {step === 1 && (
          <div className="wiz__grid">
            <Field id="responsible_first" label="Prénom du responsable" error={errs.responsible_first}>{(p) => <input {...p} type="text" autoComplete="given-name" maxLength={60} {...text('responsible_first')} />}</Field>
            <Field id="responsible_last" label="Nom du responsable" error={errs.responsible_last}>{(p) => <input {...p} type="text" autoComplete="family-name" maxLength={60} {...text('responsible_last')} />}</Field>
            <Field id="contact_email" label="E-mail de contact" error={errs.contact_email}>{(p) => <input {...p} type="email" autoComplete="email" maxLength={254} {...text('contact_email')} />}</Field>
            <Field id="phone" label="Téléphone" error={errs.phone}>{(p) => <input {...p} type="tel" autoComplete="tel" maxLength={20} {...text('phone')} />}</Field>
            <Field id="website" label="Site ou page de l’organisation (facultatif)" error={errs.website} hint="Commence par https://">{(p) => <input {...p} type="url" autoComplete="url" maxLength={200} {...text('website')} />}</Field>
          </div>
        )}

        {step === 2 && (
          <>
            <p className="wiz__lead">Ces pièces ne sont lisibles que par l’équipe LA SUNSHINES, dans un espace privé. PDF, JPEG, PNG ou WebP, 10 Mo maximum chacune.</p>
            {DOC_KINDS.map(([kind, label]) => {
              const cur = docs.find((x) => x.kind === kind);
              return (
                <div className="wiz__field" key={kind}>
                  <label htmlFor={`file-${kind}`}>{label}{kind !== 'other' ? ' *' : ''}</label>
                  <div className="wiz__file">
                    <input id={`file-${kind}`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={up === kind} onChange={(e) => upload(kind, e.target.files?.[0])} aria-describedby={errs[`file-${kind}`] ? `file-${kind}-err` : undefined} />
                    {up === kind && <span role="status">Envoi en cours…</span>}
                    {cur && <span>✔ {cur.name} <button type="button" className="ef-link" onClick={() => setDocs((x) => x.filter((y) => y.kind !== kind))}>Retirer</button></span>}
                  </div>
                  {errs[`file-${kind}`] && <p className="wiz__err" id={`file-${kind}-err`} role="alert">{errs[`file-${kind}`]}</p>}
                </div>
              );
            })}
            {errs.docs && <p className="wiz__err" role="alert">{errs.docs}</p>}
          </>
        )}

        {step === 3 && (
          <>
            <Field id="description" label="Décris ton activité" error={errs.description} hint="Type de soirées, public, expérience (20 caractères minimum).">{(p) => <textarea {...p} maxLength={1500} {...text('description')} />}</Field>
            <fieldset className="wiz__field" aria-describedby={errs.regions ? 'regions-err' : undefined}><legend>Régions où tu organises</legend>
              <div className="wiz__checks">{REGIONS_ORG.map(([k, v]) => <label key={k}><input type="checkbox" checked={(d.regions ?? []).includes(k)} onChange={(e) => set('regions', e.target.checked ? [...(d.regions ?? []), k] : (d.regions ?? []).filter((r) => r !== k))} onBlur={() => check('regions')} />{v}</label>)}</div>
              {errs.regions && <p className="wiz__err" id="regions-err" role="alert">{errs.regions}</p>}
            </fieldset>
            <Field id="events_per_year" label="Évènements par an" error={errs.events_per_year}>{(p) => <select {...p} value={d.events_per_year ?? ''} onChange={(e) => set('events_per_year', e.target.value as never)} onBlur={() => check('events_per_year')}><option value="">Choisir…</option><option value="1-3">1 à 3</option><option value="4-10">4 à 10</option><option value="10+">Plus de 10</option></select>}</Field>
            <div className={'wiz__field' + (errs.accept_terms ? ' is-bad' : '')}>
              <label className="ef-check"><input id="accept_terms" type="checkbox" checked={d.accept_terms === true} onChange={(e) => set('accept_terms', (e.target.checked ? true : undefined) as never)} />J’accepte les <a href="/cgv" target="_blank" rel="noopener">conditions générales</a> et je certifie l’exactitude de ces informations.</label>
              {errs.accept_terms && <p className="wiz__err" role="alert">{errs.accept_terms}</p>}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <dl className="wiz__recap">
              <dt>Structure</dt><dd>{d.name} · {legal}</dd><dt>SIRET</dt><dd>{d.siret || '—'}</dd>
              <dt>Adresse</dt><dd>{d.address}, {d.postal_code} {d.city}</dd>
              <dt>Responsable</dt><dd>{d.responsible_first} {d.responsible_last}</dd><dt>Contact</dt><dd>{d.contact_email} · {d.phone}</dd>
              <dt>Pièces</dt><dd>{docs.map((x) => x.name).join(', ') || '—'}</dd>
              <dt>Activité</dt><dd>{d.description}</dd>
            </dl>
            {fail && <p className="wiz__err" role="alert">{fail}</p>}
          </>
        )}

        <div className="wiz__nav">
          {step > 0 ? <button type="button" className="btn btn--outline" onClick={() => { setErrs({}); setStep((n) => n - 1); }}>← Retour</button> : <Link className="btn btn--outline" href="/organisateur">Annuler</Link>}
          <span className="wiz__saved" aria-live="polite">{saved}</span>
          {step < 4 ? <button type="button" className="btn btn--amber" onMouseDown={(e) => e.preventDefault()} onClick={next}>Continuer</button> : <button type="button" className="btn btn--amber" onMouseDown={(e) => e.preventDefault()} onClick={submit} disabled={busy}>{busy ? 'Envoi…' : 'Envoyer mon dossier'}</button>}
        </div>
      </section>
    </div>
  );
}
