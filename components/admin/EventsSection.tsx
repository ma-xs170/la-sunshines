'use client';

import { useMemo, useState } from 'react';
import type { Store, StoredArtist, StoredEvent, ScheduleEntry } from '@/lib/store';
import { analyzeImageFile } from '@/lib/clientColor';
import { resolveEmoji } from '@/lib/editionEmoji';
import { heroGradient } from '@/lib/gradient';
import { normalizeArtistName } from '@/lib/artists';
import { formatEditionDate } from '@/lib/format';
import { groupSchedule, slotsFromEventTime, normalizeTime } from '@/lib/schedule';
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
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

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
  schedule: ScheduleEntry[];
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
  schedule: [],
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
    archived: ev.archived === true,
    schedule: Array.isArray(ev.schedule) ? ev.schedule : [],
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

  const schedule = form.schedule;
  const setSchedule = (rows: ScheduleEntry[]) =>
    setForm((f) => ({ ...f, schedule: rows }));
  /** Ajoute une entrée vide, éventuellement rattachée à un créneau existant. */
  const addSchedule = (time = '') =>
    setSchedule([
      ...schedule,
      { id: uid(), time, artistName: '', label: '', headliner: false },
    ]);
  const patchSchedule = (id: string, patch: Partial<ScheduleEntry>) =>
    setSchedule(schedule.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeSchedule = (id: string) =>
    setSchedule(schedule.filter((s) => s.id !== id));
  /** Change l'heure de toutes les entrées d'un créneau (le groupe se déplace). */
  const retimeGroup = (oldTime: string, newTime: string) =>
    setSchedule(
      schedule.map((s) => (s.time === oldTime ? { ...s, time: newTime } : s)),
    );
  /** Réordonne une entrée au sein de son propre créneau (échange avec la
   *  voisine partageant la même heure). */
  const moveSchedule = (id: string, dir: -1 | 1) => {
    const i = schedule.findIndex((s) => s.id === id);
    if (i < 0) return;
    const t = schedule[i].time;
    let j = i + dir;
    while (j >= 0 && j < schedule.length && schedule[j].time !== t) j += dir;
    if (j < 0 || j >= schedule.length) return;
    const next = [...schedule];
    [next[i], next[j]] = [next[j], next[i]];
    setSchedule(next);
  };

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
    schedule,
    addSchedule,
    patchSchedule,
    removeSchedule,
    retimeGroup,
    moveSchedule,
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
  onNewArtist,
}: {
  hook: Hook;
  artistNames: string[];
  onNewArtist?: () => void;
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
      {onNewArtist && (
        <button
          type="button"
          className="btn btn--outline admin-inline-add"
          onClick={onNewArtist}
        >
          <Icon name="sparkles" />
          <span>+ Nouvel artiste (ajouté au line-up)</span>
        </button>
      )}
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

function ScheduleEditor({ hook }: { hook: Hook }) {
  const names = Array.from(
    new Set([...hook.headlinerList, ...hook.lineupList].filter(Boolean)),
  );
  const slots = slotsFromEventTime(hook.form.time);
  const groups = groupSchedule(hook.schedule);
  const usedTimes = new Set(groups.map((g) => g.time));
  const nextSlot = slots.find((s) => !usedTimes.has(s)) ?? slots[0] ?? '';

  /** options du <select> d'un créneau — inclut sa valeur actuelle même si elle
   *  n'est pas dans la grille (valeurs legacy « 18h00 », plages…). */
  function slotOptions(current: string): string[] {
    return current && !slots.includes(current) ? [current, ...slots] : slots;
  }

  return (
    <div className="sched">
      <datalist id="sched-artists">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {groups.length === 0 && (
        <p className="admin-field__hint">
          Aucun créneau. Le programme n’apparaît sur le site que s’il contient au
          moins une entrée. Les entrées qui partagent la même heure sont
          regroupées automatiquement.
        </p>
      )}

      <div className="sched__groups">
        {groups.map((g) => (
          <div className="sched__group" key={g.time || 'sans-heure'}>
            <div className="sched__ghead">
              <select
                className="sched__time"
                value={g.time}
                onChange={(e) => hook.retimeGroup(g.time, e.target.value)}
              >
                {!g.time && <option value="">— Heure —</option>}
                {slotOptions(g.time).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="admin-mini"
                onClick={() => hook.addSchedule(g.time)}
              >
                + Ajouter à ce créneau
              </button>
            </div>

            <ul className="sched__rows">
              {g.entries.map((row, i) => (
                <li className="sched__row" key={row.id}>
                  <input
                    className="sched__artist"
                    list="sched-artists"
                    value={row.artistName}
                    placeholder="Artiste (line-up ou libre)"
                    onChange={(e) =>
                      hook.patchSchedule(row.id, { artistName: e.target.value })
                    }
                  />
                  <input
                    className="sched__label"
                    value={row.label}
                    placeholder="Label (Live, Set DJ…)"
                    onChange={(e) =>
                      hook.patchSchedule(row.id, { label: e.target.value })
                    }
                  />
                  <label className="sched__head" title="Tête d’affiche">
                    <input
                      type="checkbox"
                      checked={row.headliner}
                      onChange={(e) =>
                        hook.patchSchedule(row.id, { headliner: e.target.checked })
                      }
                    />
                    <span>Tête d’affiche</span>
                  </label>
                  <div className="sched__acts">
                    <button
                      type="button"
                      aria-label="Monter dans le créneau"
                      disabled={i === 0}
                      onClick={() => hook.moveSchedule(row.id, -1)}
                    >
                      <Icon name="chevron-left" />
                    </button>
                    <button
                      type="button"
                      aria-label="Descendre dans le créneau"
                      disabled={i === g.entries.length - 1}
                      onClick={() => hook.moveSchedule(row.id, 1)}
                    >
                      <Icon name="chevron-right" />
                    </button>
                    <button
                      type="button"
                      className="sched__del"
                      aria-label="Supprimer la ligne"
                      onClick={() => hook.removeSchedule(row.id)}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn btn--outline"
        onClick={() => hook.addSchedule(normalizeTime(nextSlot))}
      >
        <Icon name="clock" />
        <span>Nouveau créneau</span>
      </button>
    </div>
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
/* MODALE « + Nouvel artiste » (depuis la page de gestion d'un event) */
/* ================================================================== */

function ArtistQuickForm({
  store,
  setStore,
  flash,
  onClose,
  onCreated,
}: {
  store: Store;
  setStore: (s: Store) => void;
  flash: (t: string, saved?: boolean) => void;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [form, setForm] = useState({
    name: '',
    role: '',
    bio: '',
    instagram: '',
    tiktok: '',
    soundcloud: '',
    email: '',
  });
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);
  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const a = await analyzeImageFile(file);
      setImage(a.dataUrl);
    } catch {
      flash('Image illisible.');
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return flash('Nom obligatoire.');
    setBusy(true);
    const res = await api('/api/admin/artists', 'POST', {
      ...form,
      image: image || undefined,
    });
    setBusy(false);
    if (!res.ok || !res.item) return flash(res.error ?? 'Échec.');
    const item = res.item as unknown as StoredArtist;
    setStore({ ...store, artists: [item, ...store.artists] });
    flash('Artiste ajouté et placé dans le line-up.', res.deployed);
    onCreated(item.name);
    onClose();
  }

  return (
    <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Nouvel artiste">
      <div className="admin-modal__backdrop" onClick={onClose} />
      <div className="admin-modal__panel glass">
        <div className="admin-modal__head">
          <h3>Nouvel artiste</h3>
          <button type="button" className="admin-modal__x" aria-label="Fermer" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <form onSubmit={submit} className="admin-form">
          <label className="admin-field">
            <span>Nom *</span>
            <input value={form.name} onChange={set('name')} required autoFocus />
          </label>
          <div className="admin-row">
            <label className="admin-field">
              <span>Rôle</span>
              <select value={form.role} onChange={set('role')}>
                <option value="">— Non précisé</option>
                {['DJ', 'Artiste', 'Musicien', 'Groupe'].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Photo</span>
              <input type="file" accept="image/*" onChange={onImage} />
            </label>
          </div>
          {image && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={image} alt="" className="admin-preview__artist" />
          )}
          <label className="admin-field">
            <span>Bio</span>
            <textarea value={form.bio} onChange={set('bio')} rows={3} />
          </label>
          <div className="admin-row">
            <label className="admin-field">
              <span>Instagram</span>
              <input value={form.instagram} onChange={set('instagram')} placeholder="@pseudo" />
            </label>
            <label className="admin-field">
              <span>TikTok</span>
              <input value={form.tiktok} onChange={set('tiktok')} placeholder="@pseudo" />
            </label>
          </div>
          <div className="admin-row">
            <label className="admin-field">
              <span>SoundCloud</span>
              <input value={form.soundcloud} onChange={set('soundcloud')} />
            </label>
            <label className="admin-field">
              <span>Email</span>
              <input value={form.email} onChange={set('email')} />
            </label>
          </div>
          <div className="admin-form__actions">
            <button className="btn btn--amber" type="submit" disabled={busy}>
              {busy ? '…' : 'Créer et ajouter au line-up'}
            </button>
            <button className="btn btn--outline" type="button" onClick={onClose}>
              Annuler
            </button>
          </div>
        </form>
      </div>
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
      schedule: ed.schedule ?? [],
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
  const [newArtist, setNewArtist] = useState(false);
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
      {newArtist && (
        <ArtistQuickForm
          store={store}
          setStore={setStore}
          flash={flash}
          onClose={() => setNewArtist(false)}
          onCreated={(name) => {
            if (
              !hook.lineupList.some(
                (x) => normalizeArtistName(x) === normalizeArtistName(name),
              )
            ) {
              hook.setLineup([...hook.lineupList, name]);
            }
          }}
        />
      )}
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
          <OptionalFields
            hook={hook}
            artistNames={artistNames}
            onNewArtist={() => setNewArtist(true)}
          />
        </fieldset>

        <fieldset className="admin-section">
          <legend>Programme</legend>
          <p className="admin-field__hint">
            Déroulé horaire affiché sur la page publique (trié par heure). Laisse
            vide pour ne rien afficher.
          </p>
          <ScheduleEditor hook={hook} />
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

function EventCard({
  ed,
  onManage,
  onArchive,
}: {
  ed: EditionLite;
  onManage: () => void;
  onArchive: () => void;
}) {
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
          {ed.archived ? (
            <span className="ev-badge ev-badge--muted">Archivé</span>
          ) : (
            <span className={up ? 'ev-badge ev-badge--next' : 'ev-badge'}>
              {up ? 'À venir' : 'Passée'}
            </span>
          )}
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
      <div className="ev-card__actions">
        <button
          type="button"
          className="ev-card__archive"
          aria-label={ed.archived ? 'Sortir des archives' : 'Ranger dans les archives'}
          title={ed.archived ? 'Sortir des archives' : 'Ranger dans les archives'}
          onClick={onArchive}
        >
          <Icon name="archive" />
        </button>
        <button type="button" className="btn btn--outline ev-card__manage" onClick={onManage}>
          Gérer <Icon name="arrow-right" />
        </button>
      </div>
    </article>
  );
}

type Filter = 'upcoming' | 'past' | 'archived';
type View = { mode: 'list' } | { mode: 'create' } | { mode: 'edit'; slug: string };

export default function EventsSection({
  store,
  setStore,
  flash,
  editions,
  startInCreate = false,
}: {
  store: Store;
  setStore: (s: Store) => void;
  flash: (t: string, saved?: boolean) => void;
  editions: EditionLite[];
  startInCreate?: boolean;
}) {
  const [eds, setEds] = useState<EditionLite[]>(editions);
  const [view, setView] = useState<View>(
    startInCreate ? { mode: 'create' } : { mode: 'list' },
  );
  const [filter, setFilter] = useState<Filter>('upcoming');

  const artistNames = useMemo(() => store.artists.map((a) => a.name), [store.artists]);

  const shown = eds.filter((e) => {
    if (filter === 'archived') return e.archived;
    if (e.archived) return false;
    return filter === 'upcoming' ? isUpcoming(e.date) : !isUpcoming(e.date);
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

  async function toggleArchived(ed: EditionLite) {
    const next = !ed.archived;
    const body: Record<string, unknown> = ed.storeId
      ? { archived: next }
      : {
          slug: ed.slug,
          name: ed.name,
          description: ed.description,
          date: ed.date,
          time: ed.time,
          venue: ed.venue,
          dresscode: ed.dresscode,
          headliner: ed.headliner,
          lineup: ed.lineup.join('\n'),
          bizoukEmbed: ed.bizoukEmbed,
          hidden: ed.hidden,
          archived: next,
        };
    const res = ed.storeId
      ? await api(`/api/admin/events/${ed.storeId}`, 'PATCH', body)
      : await api('/api/admin/events', 'POST', body);
    if (!res.ok || !res.item) return flash(res.error ?? 'Échec.');
    const item = res.item;
    setStore({
      ...store,
      events: store.events.some((x) => x.id === item.id)
        ? store.events.map((x) => (x.id === item.id ? item : x))
        : [item, ...store.events],
    });
    upsertLite(item);
    flash(next ? 'Événement archivé.' : 'Événement sorti des archives.', res.deployed);
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
          {(['upcoming', 'past', 'archived'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={filter === f ? 'filter is-active' : 'filter'}
              onClick={() => setFilter(f)}
            >
              {f === 'upcoming' ? 'À venir' : f === 'past' ? 'Passés' : 'Archives'}
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
              onArchive={() => toggleArchived(ed)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export { SAVED_NOTE };
