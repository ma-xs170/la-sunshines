'use client';

import { useMemo, useState } from 'react';
import type { Store, StoredArtist, StoredEvent } from '@/lib/store';
import { analyzeImageFile } from '@/lib/clientColor';
import { resolveEmoji } from '@/lib/editionEmoji';
import { heroGradient } from '@/lib/gradient';
import { normalizeArtistName } from '@/lib/artists';
import { formatEditionDate } from '@/lib/format';
import Icon from '@/components/Icon';
import ArtistCombobox from './ArtistCombobox';
import PlacesAutocomplete from './PlacesAutocomplete';
import GalleryManager from './GalleryManager';
import type { EditionLite } from './AdminDashboard';

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

type ImgState = {
  dataUrl: string;
  dominant: string | null;
  palette: string[];
  w: number;
  h: number;
};
const EMPTY_IMG: ImgState = { dataUrl: '', dominant: null, palette: [], w: 0, h: 0 };

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

type EventFormState = {
  name: string;
  description: string;
  date: string;
  time: string;
  venue: string;
  dresscode: string;
  headliner: string;
  lineup: string;
  bizoukEmbed: string;
  hidden: boolean;
};

const EMPTY_FORM: EventFormState = {
  name: '',
  description: '',
  date: '',
  time: '',
  venue: '',
  dresscode: '',
  headliner: '',
  lineup: '',
  bizoukEmbed: '',
  hidden: false,
};

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, ...data } as {
    ok: boolean;
    item?: StoredEvent;
    data?: unknown;
    error?: string;
    deployed?: boolean;
  };
}

const SAVED_NOTE = 'Le site se met à jour automatiquement (~1 min).';

function isUpcoming(dateStr: string): boolean {
  const t = Date.parse(dateStr);
  return Number.isFinite(t) ? t > Date.now() : true; // sans date → brouillon à venir
}
function niceDate(dateStr: string): string {
  return ISO_RE.test(dateStr) ? formatEditionDate(dateStr) : dateStr || 'Date à venir';
}

/** EditionLite dérivée d'un StoredEvent (après create/patch) pour rafraîchir la liste. */
function liteFromStored(ev: StoredEvent, prev?: EditionLite): EditionLite {
  const headlinerKeys = ev.headliner
    .split(/\s*·\s*/)
    .map((n) => normalizeArtistName(n))
    .filter(Boolean);
  return {
    slug: ev.slug,
    name: ev.name,
    emoji: ev.emoji || resolveEmoji({ name: ev.name, dominantColor: ev.dominantColor }),
    gallery: prev?.gallery ?? [],
    isStatic: prev?.isStatic ?? false,
    storeId: ev.id,
    hidden: ev.hidden === true,
    date: ev.date,
    time: ev.time ?? '',
    venue: ev.venue,
    dresscode: ev.dresscode,
    headliner: ev.headliner,
    lineup: ev.lineup.filter(
      (n) => !headlinerKeys.includes(normalizeArtistName(n)),
    ),
    bizoukEmbed: ev.bizoukEmbed,
    flyer: ev.flyer,
    flyerW: ev.flyerW ?? 0,
    flyerH: ev.flyerH ?? 0,
    dominantColor: ev.dominantColor,
    palette: ev.palette,
    description: ev.description ?? prev?.description ?? '',
  };
}

/* ------------------------------------------------------------------ */
/* hook : état + handlers partagés (wizard + édition)                 */
/* ------------------------------------------------------------------ */

function useEventForm(initialForm?: Partial<EventFormState>, initialImg?: Partial<ImgState>) {
  const [form, setForm] = useState<EventFormState>({ ...EMPTY_FORM, ...initialForm });
  const [img, setImg] = useState<ImgState>({ ...EMPTY_IMG, ...initialImg });
  const [aiBusy, setAiBusy] = useState(false);

  const set =
    (k: keyof EventFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const headlinerList = form.headliner
    .split(/\s*·\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const lineupList = form.lineup
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const setHeadliner = (arr: string[]) =>
    setForm((f) => ({ ...f, headliner: arr.join(' · ') }));
  const setLineup = (arr: string[]) =>
    setForm((f) => ({ ...f, lineup: arr.join('\n') }));

  async function onFlyer(
    e: React.ChangeEvent<HTMLInputElement>,
    flash: (t: string) => void,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const a = await analyzeImageFile(file);
      setImg({ dataUrl: a.dataUrl, dominant: a.dominant, palette: a.palette, w: a.width, h: a.height });
    } catch {
      flash('Flyer illisible.');
    }
  }

  async function analyzeFlyerAI(flash: (t: string) => void) {
    if (!img.dataUrl) return flash('Choisis d’abord un flyer.');
    setAiBusy(true);
    const res = await api('/api/admin/flyer-analyze', 'POST', { image: img.dataUrl });
    setAiBusy(false);
    if (!res.ok || !res.data) return flash(res.error ?? 'Analyse impossible.');
    const d = res.data as {
      headliner: string;
      lineup: string[];
      date: string;
      heure: string;
      lieu: string;
      dresscode: string;
    };
    const dc = d.dresscode
      ? /^dresscode/i.test(d.dresscode)
        ? d.dresscode
        : `Dresscode ${d.dresscode}`
      : '';
    setForm((f) => ({
      ...f,
      date: d.date || f.date,
      time: d.heure || f.time,
      venue: d.lieu || f.venue,
      dresscode: dc || f.dresscode,
      headliner: d.headliner || f.headliner,
      lineup: d.lineup.length ? d.lineup.join('\n') : f.lineup,
    }));
    flash('Champs pré-remplis par l’IA — relis avant d’enregistrer.');
  }

  function payload(): Record<string, unknown> {
    return {
      ...form,
      lineup: form.lineup,
      flyer: img.dataUrl || undefined,
      flyerW: img.w || undefined,
      flyerH: img.h || undefined,
      dominant: img.dominant ?? undefined,
      palette: img.palette,
    };
  }

  return {
    form,
    setForm,
    img,
    set,
    headlinerList,
    lineupList,
    setHeadliner,
    setLineup,
    onFlyer,
    analyzeFlyerAI,
    aiBusy,
    payload,
  };
}

type Hook = ReturnType<typeof useEventForm>;

/* ------------------------------------------------------------------ */
/* champs réutilisables                                               */
/* ------------------------------------------------------------------ */

function DateField({ hook }: { hook: Hook }) {
  const raw = hook.form.date;
  const isIso = ISO_RE.test(raw);
  return (
    <label className="admin-field">
      <span>Date</span>
      <input
        type="date"
        value={isIso ? raw : ''}
        onChange={(e) => hook.setForm((f) => ({ ...f, date: e.target.value }))}
      />
      {raw && !isIso && (
        <span className="admin-field__hint">Valeur actuelle : « {raw} » (choisis une date pour la remplacer)</span>
      )}
    </label>
  );
}

function FlyerField({
  hook,
  flash,
}: {
  hook: Hook;
  flash: (t: string, saved?: boolean) => void;
}) {
  const previewEmoji = resolveEmoji({ name: hook.form.name, dominantColor: hook.img.dominant });
  const previewGradient = heroGradient(hook.img.palette, hook.img.dominant);
  return (
    <>
      <label className="admin-field">
        <span>Flyer</span>
        <input type="file" accept="image/*" onChange={(e) => hook.onFlyer(e, flash)} />
      </label>

      {(hook.img.dataUrl || hook.form.name) && (
        <div className="admin-preview">
          {hook.img.dataUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={hook.img.dataUrl} alt="" className="admin-preview__flyer" />
          )}
          <div className="admin-preview__meta">
            <span className="admin-preview__emoji">{previewEmoji}</span>
            <span
              className="admin-preview__grad"
              style={{ background: previewGradient }}
              title={previewGradient}
            />
            <span className="admin-preview__hex">{hook.img.dominant ?? '— pas de flyer'}</span>
          </div>
        </div>
      )}

      {hook.img.dataUrl && (
        <div className="admin-ai">
          <button
            type="button"
            className="btn btn--outline admin-ai__btn"
            onClick={() => hook.analyzeFlyerAI(flash)}
            disabled={hook.aiBusy}
          >
            <Icon name="sparkles" />
            <span>{hook.aiBusy ? 'Analyse…' : 'Analyser le flyer (IA)'}</span>
          </button>
          <span className="admin-ai__hint">
            Suggestion Mistral — pré-remplit les champs, relis avant d’enregistrer.
          </span>
        </div>
      )}
    </>
  );
}

function ArtistTagField({
  label,
  list,
  options,
  onAdd,
  onRemove,
  hint,
}: {
  label: string;
  list: string[];
  options: string[];
  onAdd: (n: string) => void;
  onRemove: (n: string) => void;
  hint?: string;
}) {
  return (
    <div className="admin-field">
      <span>{label}</span>
      {list.length > 0 && (
        <ul className="admin-tags">
          {list.map((n) => (
            <li className="admin-tag" key={n}>
              <span>{n}</span>
              <button type="button" aria-label={`Retirer ${n}`} onClick={() => onRemove(n)}>
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ArtistCombobox options={options} onSelect={onAdd} />
      {hint && <span className="admin-field__hint">{hint}</span>}
    </div>
  );
}

function OptionalFields({
  hook,
  artistNames,
}: {
  hook: Hook;
  artistNames: string[];
}) {
  const inList = (l: string[], n: string) =>
    l.some((x) => normalizeArtistName(x) === normalizeArtistName(n));
  return (
    <>
      <label className="admin-field">
        <span>Dresscode</span>
        <input value={hook.form.dresscode} onChange={hook.set('dresscode')} />
      </label>
      <ArtistTagField
        label="Headliner"
        list={hook.headlinerList}
        options={artistNames.filter((n) => !inList(hook.headlinerList, n))}
        onAdd={(n) => !inList(hook.headlinerList, n) && hook.setHeadliner([...hook.headlinerList, n])}
        onRemove={(n) => hook.setHeadliner(hook.headlinerList.filter((x) => x !== n))}
      />
      <ArtistTagField
        label="Line-up complet"
        list={hook.lineupList}
        options={artistNames.filter(
          (n) => !inList(hook.lineupList, n) && !inList(hook.headlinerList, n),
        )}
        onAdd={(n) => !inList(hook.lineupList, n) && hook.setLineup([...hook.lineupList, n])}
        onRemove={(n) => hook.setLineup(hook.lineupList.filter((x) => x !== n))}
        hint="Les têtes d’affiche ne sont pas reproposées ici."
      />
      <label className="admin-field">
        <span>Code d’intégration Bizouk (brut)</span>
        <textarea
          value={hook.form.bizoukEmbed}
          onChange={hook.set('bizoukEmbed')}
          rows={3}
          placeholder="<iframe src=&quot;https://www.bizouk.com/…&quot;></iframe>"
        />
      </label>
    </>
  );
}

/* ================================================================== */
/* WIZARD (création en 3 étapes)                                      */
/* ================================================================== */

const STEPS = ['Présentation', 'Date & lieu', 'Détails (optionnel)'];

function EventWizard({
  artistNames,
  onCancel,
  onCreated,
  flash,
}: {
  artistNames: string[];
  onCancel: () => void;
  onCreated: (ev: StoredEvent) => void;
  flash: (t: string, saved?: boolean) => void;
}) {
  const hook = useEventForm();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  function next() {
    if (step === 0 && !hook.form.name.trim()) {
      flash('Le titre est obligatoire.');
      return;
    }
    setStep((s) => Math.min(2, s + 1));
  }

  async function submit() {
    if (!hook.form.name.trim()) {
      setStep(0);
      return flash('Le titre est obligatoire.');
    }
    setBusy(true);
    const res = await api('/api/admin/events', 'POST', hook.payload());
    setBusy(false);
    if (!res.ok || !res.item) return flash(res.error ?? 'Échec.');
    flash('Événement créé.', res.deployed);
    onCreated(res.item);
  }

  return (
    <div className="admin-tabpanel wiz">
      <div className="wiz__top">
        <button type="button" className="admin-back" onClick={onCancel}>
          <Icon name="arrow-right" className="icon" /> Retour à la liste
        </button>
        <ol className="wiz__steps">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={
                i === step ? 'is-active' : i < step ? 'is-done' : undefined
              }
            >
              <span className="wiz__num">{i < step ? '✓' : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      </div>

      <section className="admin-panel glass">
        {step === 0 && (
          <fieldset className="admin-section">
            <legend>Présentation</legend>
            <label className="admin-field">
              <span>Titre *</span>
              <input value={hook.form.name} onChange={hook.set('name')} autoFocus />
            </label>
            <FlyerField hook={hook} flash={flash} />
            <label className="admin-field">
              <span>Description / accroche</span>
              <textarea
                value={hook.form.description}
                onChange={hook.set('description')}
                rows={3}
                placeholder="Une phrase d’accroche affichée sur la carte et la page."
              />
            </label>
          </fieldset>
        )}

        {step === 1 && (
          <fieldset className="admin-section">
            <legend>Date &amp; lieu</legend>
            <div className="admin-row">
              <DateField hook={hook} />
              <label className="admin-field">
                <span>Heure</span>
                <input value={hook.form.time} onChange={hook.set('time')} placeholder="16h–22h" />
              </label>
            </div>
            <div className="admin-field">
              <span>Localisation</span>
              <PlacesAutocomplete
                value={hook.form.venue}
                onChange={(v) => hook.setForm((f) => ({ ...f, venue: v }))}
              />
            </div>
          </fieldset>
        )}

        {step === 2 && (
          <fieldset className="admin-section">
            <legend>Détails (optionnel)</legend>
            <OptionalFields hook={hook} artistNames={artistNames} />
          </fieldset>
        )}

        <div className="wiz__nav">
          {step > 0 ? (
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setStep((s) => s - 1)}
            >
              <Icon name="chevron-left" />
              Précédent
            </button>
          ) : (
            <span />
          )}
          {step < 2 ? (
            <button type="button" className="btn btn--amber" onClick={next}>
              Suivant <Icon name="arrow-right" />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--amber"
              onClick={submit}
              disabled={busy}
            >
              {busy ? '…' : 'Créer l’événement'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

/* ================================================================== */
/* FORMULAIRE D'ÉDITION (une vue dédiée par événement)                */
/* ================================================================== */

function EventEditForm({
  ed,
  store,
  setStore,
  editions,
  flash,
  onBack,
  onSaved,
  onDeleted,
}: {
  ed: EditionLite;
  store: Store;
  setStore: (s: Store) => void;
  editions: EditionLite[];
  flash: (t: string, saved?: boolean) => void;
  onBack: () => void;
  onSaved: (ev: StoredEvent) => void;
  onDeleted: () => void;
}) {
  const hook = useEventForm(
    {
      name: ed.name,
      description: ed.description ?? '',
      date: ed.date,
      time: ed.time,
      venue: ed.venue,
      dresscode: ed.dresscode,
      headliner: ed.headliner,
      lineup: ed.lineup.join('\n'),
      bizoukEmbed: ed.bizoukEmbed,
      hidden: ed.hidden,
    },
    {
      dataUrl: ed.flyer,
      dominant: ed.dominantColor,
      palette: ed.palette,
      w: ed.flyerW,
      h: ed.flyerH,
    },
  );
  const [busy, setBusy] = useState(false);
  const artistNames = store.artists.map((a) => a.name);
  const isNewOverride = ed.isStatic && !ed.storeId;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!hook.form.name.trim()) return flash('Le titre est obligatoire.');
    setBusy(true);
    const body = hook.payload();
    if (isNewOverride) body.slug = ed.slug;
    const res = ed.storeId
      ? await api(`/api/admin/events/${ed.storeId}`, 'PATCH', body)
      : await api('/api/admin/events', 'POST', body);
    setBusy(false);
    if (!res.ok || !res.item) return flash(res.error ?? 'Échec.');
    const item = res.item;
    setStore({
      ...store,
      events: ed.storeId
        ? store.events.some((x) => x.id === item.id)
          ? store.events.map((x) => (x.id === item.id ? item : x))
          : [item, ...store.events]
        : [item, ...store.events],
    });
    flash(
      isNewOverride ? 'Version personnalisée enregistrée.' : 'Événement enregistré.',
      res.deployed,
    );
    onSaved(item);
  }

  async function remove() {
    if (!ed.storeId) return;
    const label = ed.isStatic
      ? `Réinitialiser « ${ed.name} » à la version du site ? Les modifications admin seront perdues.`
      : `Supprimer définitivement « ${ed.name} » ?`;
    if (!window.confirm(label)) return;
    const res = await api(`/api/admin/events/${ed.storeId}`, 'DELETE');
    if (!res.ok) return flash(res.error ?? 'Échec.');
    setStore({ ...store, events: store.events.filter((x) => x.id !== ed.storeId) });
    flash(ed.isStatic ? 'Revenu à la version du site.' : 'Événement supprimé.', res.deployed);
    onDeleted();
  }

  return (
    <div className="admin-tabpanel">
      <div className="wiz__top">
        <button type="button" className="admin-back" onClick={onBack}>
          <Icon name="arrow-right" className="icon" /> Retour à la liste
        </button>
        <div className="ev-detail__id">
          <span className="admin-list__emoji">{ed.emoji}</span>
          <strong>{ed.name}</strong>
          {ed.hidden && <span className="admin-badge admin-badge--hidden">Privé</span>}
          <a className="admin-mini" href={`/editions/${ed.slug}`} target="_blank" rel="noopener">
            Voir la page
          </a>
        </div>
      </div>

      <form onSubmit={submit} className="admin-panel glass admin-form admin-form--sections">
        <fieldset className="admin-section">
          <legend>Infos générales</legend>
          <label className="admin-field">
            <span>Titre *</span>
            <input value={hook.form.name} onChange={hook.set('name')} required />
          </label>
          <label className="admin-field">
            <span>Description / accroche</span>
            <textarea value={hook.form.description} onChange={hook.set('description')} rows={2} />
          </label>
          <div className="admin-row">
            <DateField hook={hook} />
            <label className="admin-field">
              <span>Heure</span>
              <input value={hook.form.time} onChange={hook.set('time')} placeholder="16h–22h" />
            </label>
          </div>
          <div className="admin-field">
            <span>Localisation</span>
            <PlacesAutocomplete
              value={hook.form.venue}
              onChange={(v) => hook.setForm((f) => ({ ...f, venue: v }))}
            />
          </div>
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={hook.form.hidden}
              onChange={(e) => hook.setForm((f) => ({ ...f, hidden: e.target.checked }))}
            />
            <span className="admin-toggle__box" aria-hidden="true" />
            <span className="admin-toggle__label">
              Événement privé (masqué du site)
              <small>Retiré de l’accueil, du listing, de la page (404) et des pages artistes. Réversible.</small>
            </span>
          </label>
        </fieldset>

        <fieldset className="admin-section">
          <legend>Flyer &amp; IA</legend>
          <FlyerField hook={hook} flash={flash} />
        </fieldset>

        <fieldset className="admin-section">
          <legend>Line-up &amp; billetterie</legend>
          <OptionalFields hook={hook} artistNames={artistNames} />
        </fieldset>

        <div className="admin-form__actions">
          <button className="btn btn--amber" type="submit" disabled={busy}>
            {busy ? '…' : 'Enregistrer'}
          </button>
          {ed.storeId && (
            <button className="btn btn--outline" type="button" onClick={remove}>
              {ed.isStatic ? 'Réinitialiser' : 'Supprimer'}
            </button>
          )}
        </div>
      </form>

      <section className="admin-panel glass">
        <GalleryManager slug={ed.slug} initial={ed.gallery} flash={flash} />
      </section>
    </div>
  );
}

/* ================================================================== */
/* CARTE + LISTE                                                      */
/* ================================================================== */

function EventCard({ ed, onManage }: { ed: EditionLite; onManage: () => void }) {
  const up = isUpcoming(ed.date);
  return (
    <article className="ev-card glass">
      <div className="ev-card__flyer">
        {ed.flyer ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={ed.flyer} alt="" />
        ) : (
          <span className="ev-card__flyer--empty">{ed.emoji}</span>
        )}
      </div>
      <div className="ev-card__body">
        <div className="ev-card__badges">
          <span className={up ? 'ev-badge ev-badge--next' : 'ev-badge'}>
            {up ? 'À venir' : 'Passée'}
          </span>
          {ed.hidden && <span className="ev-badge ev-badge--hidden">Privé</span>}
          {ed.isStatic && !ed.storeId && (
            <span className="ev-badge ev-badge--muted">Site</span>
          )}
        </div>
        <h3 className="ev-card__name">
          <span aria-hidden="true">{ed.emoji}</span> {ed.name}
        </h3>
        <p className="ev-card__meta">
          {niceDate(ed.date)}
          {ed.venue ? ` · ${ed.venue}` : ''}
        </p>
        {(ed.headliner || ed.lineup.length > 0) && (
          <p className="ev-card__lineup">
            {[ed.headliner, ...ed.lineup].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <button type="button" className="btn btn--outline ev-card__manage" onClick={onManage}>
        Gérer <Icon name="arrow-right" />
      </button>
    </article>
  );
}

type Filter = 'all' | 'upcoming' | 'past';
type View = { mode: 'list' } | { mode: 'create' } | { mode: 'edit'; slug: string };

export default function EventsSection({
  store,
  setStore,
  flash,
  editions,
}: {
  store: Store;
  setStore: (s: Store) => void;
  flash: (t: string, saved?: boolean) => void;
  editions: EditionLite[];
}) {
  const [eds, setEds] = useState<EditionLite[]>(editions);
  const [view, setView] = useState<View>({ mode: 'list' });
  const [filter, setFilter] = useState<Filter>('all');

  const artistNames = useMemo(() => store.artists.map((a) => a.name), [store.artists]);

  const shown = eds.filter((e) => {
    if (filter === 'upcoming') return isUpcoming(e.date);
    if (filter === 'past') return !isUpcoming(e.date);
    return true;
  });

  function upsertLite(ev: StoredEvent) {
    setEds((list) => {
      const prev = list.find((x) => x.slug === ev.slug);
      const lite = liteFromStored(ev, prev);
      return prev
        ? list.map((x) => (x.slug === ev.slug ? lite : x))
        : [lite, ...list];
    });
  }

  if (view.mode === 'create') {
    return (
      <EventWizard
        artistNames={artistNames}
        onCancel={() => setView({ mode: 'list' })}
        onCreated={(ev) => {
          upsertLite(ev);
          setView({ mode: 'edit', slug: ev.slug });
        }}
        flash={flash}
      />
    );
  }

  if (view.mode === 'edit') {
    const ed = eds.find((e) => e.slug === view.slug);
    if (!ed) {
      setView({ mode: 'list' });
      return null;
    }
    return (
      <EventEditForm
        ed={ed}
        store={store}
        setStore={setStore}
        editions={eds}
        flash={flash}
        onBack={() => setView({ mode: 'list' })}
        onSaved={(ev) => upsertLite(ev)}
        onDeleted={() => {
          setEds((list) => list.filter((x) => x.slug !== view.slug));
          setView({ mode: 'list' });
        }}
      />
    );
  }

  return (
    <div className="admin-tabpanel">
      <div className="ev-list__top">
        <div className="filters" role="tablist" aria-label="Filtrer">
          {(['all', 'upcoming', 'past'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={filter === f ? 'filter is-active' : 'filter'}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'Tous' : f === 'upcoming' ? 'À venir' : 'Passés'}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn--amber"
          onClick={() => setView({ mode: 'create' })}
        >
          <Icon name="sparkles" />
          <span>Créer un événement</span>
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="admin-list__empty">Aucun événement pour ce filtre.</p>
      ) : (
        <div className="ev-grid">
          {shown.map((ed) => (
            <EventCard
              key={ed.slug}
              ed={ed}
              onManage={() => setView({ mode: 'edit', slug: ed.slug })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export { SAVED_NOTE };
