'use client';

import SaveBar from './SaveBar';
import { useEventSave } from './useEventSave';

export interface Question { id: string; label: string; type: 'text' | 'choice' | 'checkbox'; required: boolean; options: string[] }
export interface Consent { key: string; label: string; required: boolean }
const rid = () => 'q' + Math.random().toString(36).slice(2, 9);

/** Modèle « Autorisation parentale / responsable légal » (public 12–17 ans). Texte à faire valider juridiquement : [À COMPLÉTER]. */
export const GUARDIAN_TEMPLATE: Question[] = [
  { id: 'resp_nom', label: 'Nom et prénom du responsable légal', type: 'text', required: true, options: [] },
  { id: 'resp_tel', label: 'Téléphone du responsable légal', type: 'text', required: true, options: [] },
  { id: 'resp_image', label: 'J’autorise l’utilisation de l’image de mon enfant (photos et vidéos de la soirée)', type: 'checkbox', required: false, options: [] },
];

/** Formulaires : questions posées à l'acheteur (texte, choix, case ; obligatoire ou facultatif) + modèle d'autorisation parentale. */
export function FormsEditor({ slug, initial, guardian }: { slug: string; initial: Question[]; guardian: boolean }) {
  const { value, setValue, dirty, busy, error, done, save, restored, discard } = useEventSave(slug, 'formulaires', { questions: initial, guardian } as Record<string, unknown>);
  const qs = value.questions as Question[]; const g = value.guardian as boolean;
  const setQs = (questions: Question[]) => setValue({ ...value, questions });
  const patch = (i: number, p: Partial<Question>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...p } : q)));
  return (
    <div className="ef">
      <section className="glass ef-card"><h2>Autorisation parentale</h2>
        <label className="ef-check"><input type="checkbox" checked={g} onChange={(e) => setValue({ ...value, guardian: e.target.checked })} />
          Demander l’autorisation du responsable légal (public 12–17 ans)</label>
        <p className="ef-help">Désactivée par défaut : elle n’est pas obligatoire tant que tu ne l’actives pas. Le texte exact de l’autorisation reste <strong>[À COMPLÉTER]</strong> : à faire valider juridiquement avant toute activation en vente réelle.</p>
        {g && <p className="ef-help">Champs demandés : nom et téléphone du responsable, autorisation d’image.</p>}
      </section>
      <section className="glass ef-card"><h2>Questions posées à l’acheteur</h2>
        {qs.length === 0 && <p className="ef-help">Aucune question pour l’instant. Ajoutes-en une si tu as besoin d’une information supplémentaire (ex. taille, allergie).</p>}
        {qs.map((q, i) => (
          <div className="ef-q" key={q.id}>
            <div className="ef-grid">
              <div className="ef-field"><label htmlFor={`q-l-${q.id}`}>Intitulé</label><input id={`q-l-${q.id}`} value={q.label} maxLength={140} onChange={(e) => patch(i, { label: e.target.value })} /></div>
              <div className="ef-field"><label htmlFor={`q-t-${q.id}`}>Type</label>
                <select id={`q-t-${q.id}`} value={q.type} onChange={(e) => patch(i, { type: e.target.value as Question['type'], options: e.target.value === 'choice' ? (q.options.length ? q.options : ['', '']) : [] })}>
                  <option value="text">Texte libre</option><option value="choice">Choix</option><option value="checkbox">Case à cocher</option></select></div>
            </div>
            {q.type === 'choice' && <div className="ef-field"><label htmlFor={`q-o-${q.id}`}>Options (une par ligne)</label>
              <textarea id={`q-o-${q.id}`} rows={3} value={q.options.join('\n')} onChange={(e) => patch(i, { options: e.target.value.split('\n').slice(0, 10) })} /></div>}
            <div className="ef-row">
              <label className="ef-check"><input type="checkbox" checked={q.required} onChange={(e) => patch(i, { required: e.target.checked })} />Obligatoire</label>
              <button type="button" className="ef-link" onClick={() => setQs(qs.filter((_, j) => j !== i))}>Retirer</button>
            </div>
          </div>
        ))}
        <button type="button" className="btn btn--outline" disabled={qs.length >= 20} onClick={() => setQs([...qs, { id: rid(), label: '', type: 'text', required: false, options: [] }])}>Ajouter une question</button>
      </section>
      <SaveBar dirty={dirty} busy={busy} error={error} done={done} restored={restored} onDiscard={discard}
        onSave={() => save({ guardian_form: g, form_questions: qs.map((q) => ({ ...q, options: q.type === 'choice' ? q.options.map((o) => o.trim()).filter(Boolean) : [] })) })} />
    </div>
  );
}

/** Conditions générales propres à l'évènement (texte par défaut repris du site, éditable). */
export function TermsEditor({ slug, initial, fallback }: { slug: string; initial: string; fallback: string }) {
  const { value, setValue, dirty, busy, error, done, save, restored, discard } = useEventSave(slug, 'conditions', { terms: initial || fallback } as Record<string, unknown>);
  return (
    <div className="ef">
      <section className="glass ef-card"><h2>Conditions générales et règlement</h2>
        <label className="sr-only" htmlFor="ef-terms">Conditions</label>
        <textarea id="ef-terms" rows={16} maxLength={12000} value={value.terms as string} onChange={(e) => setValue({ terms: e.target.value })} />
        <p className="ef-help">{(value.terms as string).length}/12000 · Le texte de départ reprend le règlement du site ; adapte-le à ton évènement. Ces conditions complètent les CGV de la plateforme, elles ne les remplacent pas.</p>
      </section>
      <SaveBar dirty={dirty} busy={busy} error={error} done={done} restored={restored} onDiscard={discard} onSave={() => save({ terms: value.terms })} />
    </div>
  );
}

/** Consentements demandés à l'achat ; l'historique horodaté (texte exact) est conservé par commande. */
export function ConsentsEditor({ slug, initial }: { slug: string; initial: Consent[] }) {
  const { value, setValue, dirty, busy, error, done, save, restored, discard } = useEventSave(slug, 'consentements', { consents: initial } as Record<string, unknown>);
  const cs = value.consents as Consent[]; const setCs = (consents: Consent[]) => setValue({ consents });
  return (
    <div className="ef">
      <section className="glass ef-card"><h2>Cases de consentement à l’achat</h2>
        <p className="ef-help">Les CGV et la politique de confidentialité de la plateforme sont toujours demandées. Ajoute ici les consentements propres à ton évènement (ex. droit à l’image). Chaque acceptation est enregistrée avec la date et le texte exact affiché.</p>
        {cs.map((c, i) => (
          <div className="ef-q" key={c.key}>
            <div className="ef-field"><label htmlFor={`c-${c.key}`}>Texte affiché</label><textarea id={`c-${c.key}`} rows={2} maxLength={300} value={c.label} onChange={(e) => setCs(cs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></div>
            <div className="ef-row"><label className="ef-check"><input type="checkbox" checked={c.required} onChange={(e) => setCs(cs.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} />Obligatoire pour acheter</label>
              <button type="button" className="ef-link" onClick={() => setCs(cs.filter((_, j) => j !== i))}>Retirer</button></div>
          </div>
        ))}
        <button type="button" className="btn btn--outline" disabled={cs.length >= 10} onClick={() => setCs([...cs, { key: 'c' + Math.random().toString(36).slice(2, 8), label: '', required: false }])}>Ajouter un consentement</button>
      </section>
      <SaveBar dirty={dirty} busy={busy} error={error} done={done} restored={restored} onDiscard={discard} onSave={() => save({ consents: cs })} />
    </div>
  );
}
