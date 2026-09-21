'use client';

import { useRef } from 'react';
import DresscodePicker from './DresscodePicker';
import SaveBar from './SaveBar';
import VideoUpload, { type MediaRow } from './VideoUpload';
import { useEventSave } from './useEventSave';
import { normalizeDresscode, parseLegacy, type DresscodeValue } from '@/lib/dresscodeColors';
import { NETWORKS, normalizeSocial, type Network } from '@/lib/socialLinks';

export interface DetailsData {
  event_type: string; subtitle: string; description: string; visibility: 'public' | 'private'; publish_mode: 'now' | 'later'; publish_at: string | null;
  dresscode: DresscodeValue; contact_email: string; contact_phone: string; socials: Record<string, string>;
}
const toLocal = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

/** Page « Description » : cartes empilées (Général, Description, Dresscode, Images et vidéos, Contact, Réseaux) et barre d'enregistrement collée. */
export default function DescriptionForm({ slug, initial, legacyDresscode, media }: { slug: string; initial: DetailsData; legacyDresscode: string; media: MediaRow[] }) {
  // migration douce : aucun dresscode structuré encore → on interprète l'ancien texte de l'évènement
  const start = { ...initial, dresscode: initial.dresscode.colors.length || initial.dresscode.free || initial.dresscode.note ? initial.dresscode : parseLegacy(legacyDresscode) };
  const { value: v, setValue, dirty, busy, error, done, save, restored, discard } = useEventSave(slug, 'description', start as unknown as Record<string, unknown>);
  const d = v as unknown as DetailsData;
  const set = (patch: Partial<DetailsData>) => setValue({ ...v, ...patch });
  const ta = useRef<HTMLTextAreaElement>(null);

  const wrap = (before: string, after = before) => {
    const el = ta.current; if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el; const sel = d.description.slice(a, b) || 'texte';
    set({ description: d.description.slice(0, a) + before + sel + after + d.description.slice(b) });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + before.length, a + before.length + sel.length); });
  };
  const line = (prefix: string) => { const el = ta.current; if (!el) return; const a = el.selectionStart; const ls = d.description.lastIndexOf('\n', a - 1) + 1; set({ description: d.description.slice(0, ls) + prefix + d.description.slice(ls) }); };
  const link = () => { const url = window.prompt('Adresse du lien (https://…)'); if (url && /^https:\/\//i.test(url)) wrap('[', `](${url})`); };
  const linkPreview = (n: Network) => { const r = normalizeSocial(n, d.socials[n] ?? ''); return r === null ? null : r; };

  const submit = () => save({
    subtitle: d.subtitle, description: d.description, event_type: d.event_type, visibility: d.visibility, publish_mode: d.publish_mode,
    publish_at: d.publish_mode === 'later' ? (d.publish_at ? new Date(d.publish_at).toISOString() : null) : null,
    dresscode: normalizeDresscode(d.dresscode), contact_email: d.contact_email, contact_phone: d.contact_phone, socials: d.socials,
  });

  return (
    <div className="ef">
      <section className="glass ef-card"><h2>Général</h2>
        <div className="ef-grid">
          <div className="ef-field"><label htmlFor="ef-type">Type d’évènement</label><input id="ef-type" value={d.event_type} maxLength={60} placeholder="ex. Soirée, Concert" onChange={(e) => set({ event_type: e.target.value })} /></div>
          <div className="ef-field"><label htmlFor="ef-sub">Sous-titre (facultatif)</label><input id="ef-sub" value={d.subtitle} maxLength={140} onChange={(e) => set({ subtitle: e.target.value })} /></div>
          <div className="ef-field"><label htmlFor="ef-vis">Visibilité</label>
            <select id="ef-vis" value={d.visibility} onChange={(e) => set({ visibility: e.target.value as 'public' | 'private' })}><option value="public">Public</option><option value="private">Privé (non listé)</option></select>
            <p className="ef-help">Un évènement privé n’apparaît pas sur le site ; seuls ceux qui ont le lien direct le voient.</p></div>
          <div className="ef-field"><label htmlFor="ef-pub">Mise en ligne</label>
            <select id="ef-pub" value={d.publish_mode} onChange={(e) => set({ publish_mode: e.target.value as 'now' | 'later' })}><option value="now">Publier immédiatement</option><option value="later">Différer la publication</option></select></div>
          {d.publish_mode === 'later' && <div className="ef-field"><label htmlFor="ef-at">Publier le</label><input id="ef-at" type="datetime-local" value={toLocal(d.publish_at)} onChange={(e) => set({ publish_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></div>}
        </div>
      </section>

      <section className="glass ef-card"><h2>Description</h2>
        <div className="ef-toolbar" role="toolbar" aria-label="Mise en forme">
          <button type="button" onClick={() => wrap('**')}><b>G</b><span className="sr-only"> gras</span></button>
          <button type="button" onClick={() => wrap('*')}><i>I</i><span className="sr-only">talique</span></button>
          <button type="button" onClick={() => line('- ')}>Liste</button>
          <button type="button" onClick={() => line('> ')}>Citation</button>
          <button type="button" onClick={link}>Lien</button>
        </div>
        <label className="sr-only" htmlFor="ef-desc">Description</label>
        <textarea id="ef-desc" ref={ta} rows={10} maxLength={6000} value={d.description} onChange={(e) => set({ description: e.target.value })} />
        <p className="ef-help">{d.description.length}/6000 · gras, italique, listes (« - »), citation (« &gt; ») et liens https uniquement.</p>
      </section>

      <section className="glass ef-card"><h2>Dresscode</h2>
        <DresscodePicker value={d.dresscode} onChange={(dc) => set({ dresscode: dc })} />
      </section>

      <section className="glass ef-card"><h2>Images et vidéos</h2>
        <VideoUpload slug={slug} media={media} />
      </section>

      <section className="glass ef-card"><h2>Contact</h2>
        <div className="ef-grid">
          <div className="ef-field"><label htmlFor="ef-mail">E-mail de contact</label><input id="ef-mail" type="email" value={d.contact_email} onChange={(e) => set({ contact_email: e.target.value })} /></div>
          <div className="ef-field"><label htmlFor="ef-tel">Téléphone</label><input id="ef-tel" type="tel" value={d.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} /></div>
        </div>
      </section>

      <section className="glass ef-card"><h2>Réseaux sociaux</h2>
        <div className="ef-grid">
          {NETWORKS.map((n) => {
            const prev = linkPreview(n.id);
            return (
              <div className="ef-field" key={n.id}>
                <label htmlFor={'ef-' + n.id}>{n.label}</label>
                <input id={'ef-' + n.id} value={d.socials[n.id] ?? ''} placeholder={n.id === 'whatsapp' ? '+590 6 90 12 34 56' : 'pseudo, @pseudo ou lien'} onChange={(e) => set({ socials: { ...d.socials, [n.id]: e.target.value } })} aria-invalid={prev === null} />
                {prev === null ? <p className="ef-help ef-err">Lien {n.label} non reconnu.</p> : prev ? <p className="ef-help">Lien : {prev}</p> : null}
              </div>
            );
          })}
        </div>
      </section>
      <SaveBar dirty={dirty} busy={busy} error={error} done={done} restored={restored} onSave={submit} onDiscard={discard} />
    </div>
  );
}
