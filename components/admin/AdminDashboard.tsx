'use client';

import { useRef, useState } from 'react';
import type {
  Store,
  StoredArtist,
  StoredEvent,
  StoredAnnouncement,
} from '@/lib/store';
import { analyzeImageFile } from '@/lib/clientColor';
import { resolveEmoji } from '@/lib/editionEmoji';
import { heroGradient } from '@/lib/gradient';
import { normalizeArtistName } from '@/lib/artists';
import Icon from '@/components/Icon';
import ArtistCombobox from './ArtistCombobox';

type ImgState = {
  dataUrl: string;
  dominant: string | null;
  palette: string[];
  w: number;
  h: number;
};

const EMPTY_IMG: ImgState = { dataUrl: '', dominant: null, palette: [], w: 0, h: 0 };

export type EditionLite = {
  slug: string;
  name: string;
  emoji: string;
  gallery: string[];
  /** true si l'édition provient de lib/editions.ts (non supprimable ici). */
  isStatic: boolean;
  /** id du StoredEvent qui la porte (surcharge ou ajout admin), sinon null. */
  storeId: string | null;
  // pré-remplissage du formulaire d'édition
  date: string;
  time: string;
  venue: string;
  dresscode: string;
  headliner: string;
  lineup: string[];
  bizoukEmbed: string;
  flyer: string;
  flyerW: number;
  flyerH: number;
  dominantColor: string | null;
  palette: string[];
};

async function api(
  path: string,
  method: string,
  body?: unknown,
): Promise<{
  ok: boolean;
  item?: unknown;
  error?: string;
  gallery?: string[];
  data?: unknown;
}> {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, ...data };
}

export default function AdminDashboard({
  initialStore,
  editions,
}: {
  initialStore: Store;
  editions: EditionLite[];
}) {
  const [store, setStore] = useState<Store>(initialStore);
  const [msg, setMsg] = useState<string>('');
  const msgTimer = useRef<number | undefined>(undefined);

  function flash(text: string) {
    setMsg(text);
    if (msgTimer.current) window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(''), 3500);
  }

  async function logout() {
    await api('/api/admin/logout', 'POST');
    window.location.reload();
  }

  return (
    <main className="admin-shell admin-shell--wide">
      <header className="admin-top">
        <h1>Administration</h1>
        <div className="admin-top__actions">
          <a className="admin-link" href="/" target="_blank" rel="noopener">
            Voir le site
          </a>
          <button className="btn btn--outline" type="button" onClick={logout}>
            Se déconnecter
          </button>
        </div>
      </header>

      {msg && <p className="admin-flash">{msg}</p>}

      <p className="admin-note">
        Le contenu ajouté ici est enregistré dans <code>data/content.json</code> et
        apparaît sur le site au prochain <code>build</code> (rebuild / redeploy).
      </p>

      <div className="admin-grid">
        <EventPanel
          store={store}
          setStore={setStore}
          flash={flash}
          editions={editions}
        />
        <ArtistPanel store={store} setStore={setStore} flash={flash} />
      </div>

      <GalleryPanel editions={editions} flash={flash} />
      <AnnouncementPanel store={store} setStore={setStore} flash={flash} />
      <TicketPanel store={store} setStore={setStore} flash={flash} />
    </main>
  );
}

/* ======================= TICKETS (assistant) ======================= */

function TicketPanel({
  store,
  setStore,
  flash,
}: {
  store: Store;
  setStore: (s: Store) => void;
  flash: (t: string) => void;
}) {
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const list = store.tickets.filter((t) =>
    filter === 'open' ? t.status !== 'done' : true,
  );
  const openCount = store.tickets.filter((t) => t.status !== 'done').length;

  async function setStatus(id: string, status: 'open' | 'done') {
    const res = await api(`/api/admin/tickets/${id}`, 'PATCH', { status });
    if (!res.ok) return flash(res.error ?? 'Échec.');
    setStore({
      ...store,
      tickets: store.tickets.map((t) => (t.id === id ? { ...t, status } : t)),
    });
    flash(status === 'done' ? 'Ticket marqué traité.' : 'Ticket rouvert.');
  }

  async function remove(id: string) {
    if (!window.confirm('Supprimer ce ticket ?')) return;
    const res = await api(`/api/admin/tickets/${id}`, 'DELETE');
    if (!res.ok) return flash(res.error ?? 'Échec.');
    setStore({ ...store, tickets: store.tickets.filter((t) => t.id !== id) });
    flash('Ticket supprimé.');
  }

  return (
    <section className="admin-panel admin-panel--wide glass">
      <h2>Tickets — demandes via l’assistant</h2>
      <p className="admin-note admin-note--tight">
        Créés automatiquement par le chatbot quand un visiteur demande un suivi
        (remboursement pour annulation, billet non reçu…). Un email part aussi
        vers {`themouv2.0971@gmail.com`}.
      </p>

      <div className="filters" style={{ margin: '0 0 var(--s-16)' }}>
        <button
          type="button"
          className={filter === 'open' ? 'filter is-active' : 'filter'}
          onClick={() => setFilter('open')}
        >
          Ouverts ({openCount})
        </button>
        <button
          type="button"
          className={filter === 'all' ? 'filter is-active' : 'filter'}
          onClick={() => setFilter('all')}
        >
          Tous ({store.tickets.length})
        </button>
      </div>

      {list.length === 0 ? (
        <p className="admin-list__empty">
          {store.tickets.length === 0 ? 'Aucun ticket.' : 'Aucun ticket ouvert.'}
        </p>
      ) : (
        <ul className="admin-list">
          {list.map((t) => (
            <li
              key={t.id}
              className={
                t.status === 'done'
                  ? 'admin-ticket admin-ticket--done'
                  : 'admin-ticket'
              }
            >
              <div className="admin-ticket__top">
                <span className="admin-ticket__badge">
                  {t.status === 'done' ? 'Traité' : 'Ouvert'}
                </span>
                <span className="admin-ticket__subject">{t.subject}</span>
                <button
                  className="admin-mini"
                  type="button"
                  onClick={() =>
                    setStatus(t.id, t.status === 'done' ? 'open' : 'done')
                  }
                >
                  {t.status === 'done' ? 'Rouvrir' : 'Marquer traité'}
                </button>
                <button
                  className="admin-mini admin-mini--danger"
                  type="button"
                  onClick={() => remove(t.id)}
                >
                  Supprimer
                </button>
              </div>
              <div className="admin-ticket__meta">
                {t.name} · <a href={`mailto:${t.email}`}>{t.email}</a>
                {t.phone ? ` · ${t.phone}` : ''} ·{' '}
                {new Date(t.createdAt).toLocaleString('fr-FR')}
              </div>
              <p className="admin-ticket__msg">{t.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ======================= ANNONCES ======================= */

function AnnouncementPanel({
  store,
  setStore,
  flash,
}: {
  store: Store;
  setStore: (s: Store) => void;
  flash: (t: string) => void;
}) {
  const [text, setText] = useState('');
  const [href, setHref] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return flash('Texte obligatoire.');
    setBusy(true);
    const res = await api('/api/admin/announcements', 'POST', { text, href });
    setBusy(false);
    if (!res.ok) return flash(res.error ?? 'Échec.');
    const item = res.item as StoredAnnouncement;
    setStore({
      ...store,
      announcements: [
        item,
        ...store.announcements.map((a) => ({ ...a, active: false })),
      ],
    });
    setText('');
    setHref('');
    flash('Annonce publiée.');
  }

  async function toggle(a: StoredAnnouncement) {
    const res = await api(`/api/admin/announcements/${a.id}`, 'PATCH', {
      active: !a.active,
    });
    if (!res.ok) return flash(res.error ?? 'Échec.');
    const item = res.item as StoredAnnouncement;
    setStore({
      ...store,
      announcements: store.announcements.map((x) =>
        x.id === a.id
          ? item
          : item.active
            ? { ...x, active: false }
            : x,
      ),
    });
    flash(item.active ? 'Annonce activée.' : 'Annonce désactivée.');
  }

  async function remove(a: StoredAnnouncement) {
    if (!window.confirm('Supprimer cette annonce ?')) return;
    const res = await api(`/api/admin/announcements/${a.id}`, 'DELETE');
    if (!res.ok) return flash(res.error ?? 'Échec.');
    setStore({
      ...store,
      announcements: store.announcements.filter((x) => x.id !== a.id),
    });
    flash('Annonce supprimée.');
  }

  const activeId = store.announcements.find((a) => a.active)?.id ?? null;

  return (
    <section className="admin-panel admin-panel--wide glass">
      <h2>Annonces du site</h2>
      <p className="admin-note admin-note--tight">
        Bandeau fin en haut du site. Une seule annonce active à la fois — activer
        une annonce désactive les autres.
      </p>

      <form onSubmit={create} className="admin-form">
        <label className="admin-field">
          <span>Texte de l’annonce *</span>
          <input value={text} onChange={(e) => setText(e.target.value)} required />
        </label>
        <label className="admin-field">
          <span>Lien (optionnel)</span>
          <input
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="https://… ou /editions/…"
          />
        </label>
        <div className="admin-form__actions">
          <button className="btn btn--amber" type="submit" disabled={busy}>
            {busy ? '…' : 'Publier'}
          </button>
        </div>
      </form>

      <ul className="admin-list">
        {store.announcements.length === 0 && (
          <li className="admin-list__empty">Aucune annonce.</li>
        )}
        {store.announcements.map((a) => (
          <li
            className={
              a.id === activeId
                ? 'admin-list__item admin-list__item--on'
                : 'admin-list__item'
            }
            key={a.id}
          >
            <span className="admin-list__name">
              {a.text}
              <small>
                {a.id === activeId ? 'ACTIVE' : 'inactive'}
                {a.href ? ` · ${a.href}` : ''}
              </small>
            </span>
            <button className="admin-mini" type="button" onClick={() => toggle(a)}>
              {a.active ? 'Désactiver' : 'Activer'}
            </button>
            <button
              className="admin-mini admin-mini--danger"
              type="button"
              onClick={() => remove(a)}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ======================= GALERIES ======================= */

function GalleryPanel({
  editions,
  flash,
}: {
  editions: EditionLite[];
  flash: (t: string) => void;
}) {
  const [galleries, setGalleries] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(editions.map((e) => [e.slug, e.gallery])),
  );
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addPhotos(slug: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const images: string[] = [];
      for (const file of Array.from(files)) {
        try {
          const a = await analyzeImageFile(file);
          images.push(a.dataUrl);
        } catch {
          /* image ignorée */
        }
      }
      if (images.length === 0) {
        flash('Aucune image lisible.');
        return;
      }
      const res = await api(`/api/admin/gallery/${slug}`, 'PATCH', { images });
      if (!res.ok || !res.gallery) return flash(res.error ?? 'Échec.');
      setGalleries((g) => ({ ...g, [slug]: res.gallery as string[] }));
      flash(`${images.length} photo(s) ajoutée(s).`);
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(slug: string, index: number) {
    if (!window.confirm('Retirer cette photo ?')) return;
    const res = await api(`/api/admin/gallery/${slug}`, 'DELETE', { index });
    if (!res.ok) return flash(res.error ?? 'Échec.');
    setGalleries((g) => ({ ...g, [slug]: (res.gallery as string[]) ?? [] }));
    flash('Photo retirée.');
  }

  return (
    <section className="admin-panel admin-panel--wide glass">
      <h2>Galeries photos par édition</h2>
      <p className="admin-note admin-note--tight">
        Alimente la section GALERIE de chaque page événement. Les photos sont
        redimensionnées automatiquement. Visible sur le site au prochain build.
      </p>

      <ul className="admin-gal-list">
        {editions.map((ed) => {
          const photos = galleries[ed.slug] ?? [];
          const open = openSlug === ed.slug;
          return (
            <li className="admin-gal" key={ed.slug}>
              <button
                type="button"
                className="admin-gal__head"
                onClick={() => setOpenSlug(open ? null : ed.slug)}
                aria-expanded={open}
              >
                <span className="admin-list__emoji">{ed.emoji}</span>
                <span className="admin-gal__name">{ed.name}</span>
                <span className="admin-gal__count">{photos.length} photo(s)</span>
                <Icon name={open ? 'chevron-left' : 'chevron-right'} className="icon" />
              </button>

              {open && (
                <div className="admin-gal__body">
                  {photos.length > 0 ? (
                    <ul className="admin-gal__grid">
                      {photos.map((src, i) => (
                        <li key={`${ed.slug}-${i}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="" />
                          <button
                            type="button"
                            className="admin-gal__del"
                            aria-label="Retirer"
                            onClick={() => removePhoto(ed.slug, i)}
                          >
                            <Icon name="close" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="admin-list__empty">Aucune photo pour cette édition.</p>
                  )}

                  <label className="admin-field admin-gal__add">
                    <span>Ajouter des photos</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={busy}
                      onChange={(e) => {
                        void addPhotos(ed.slug, e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ======================= ÉVÉNEMENTS ======================= */

const emptyEvent = {
  name: '',
  date: '',
  time: '',
  venue: '',
  dresscode: '',
  headliner: '',
  lineup: '',
  bizoukEmbed: '',
};

function EventPanel({
  store,
  setStore,
  flash,
  editions,
}: {
  store: Store;
  setStore: (s: Store) => void;
  flash: (t: string) => void;
  editions: EditionLite[];
}) {
  const [form, setForm] = useState({ ...emptyEvent });
  const [img, setImg] = useState<ImgState>({ ...EMPTY_IMG });
  const [editingId, setEditingId] = useState<string | null>(null);
  // slug d'une édition du site en cours de « matérialisation » en surcharge admin
  const [overrideSlug, setOverrideSlug] = useState<string | null>(null);
  const [manageSlug, setManageSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function reset() {
    setForm({ ...emptyEvent });
    setImg({ ...EMPTY_IMG });
    setEditingId(null);
    setOverrideSlug(null);
    setManageSlug('');
  }

  /** Charge un StoredEvent dans le formulaire (mode modification / PATCH). */
  function loadStoreEvent(ev: StoredEvent) {
    setEditingId(ev.id);
    setOverrideSlug(null);
    setManageSlug(ev.slug);
    setForm({
      name: ev.name,
      date: ev.date,
      time: ev.time ?? '',
      venue: ev.venue,
      dresscode: ev.dresscode,
      headliner: ev.headliner,
      lineup: ev.lineup.join('\n'),
      bizoukEmbed: ev.bizoukEmbed,
    });
    setImg({
      dataUrl: ev.flyer,
      dominant: ev.dominantColor,
      palette: ev.palette,
      w: ev.flyerW ?? 0,
      h: ev.flyerH ?? 0,
    });
  }

  /** Sélection dans le dropdown « gérer un événement ». */
  function selectEdition(slug: string) {
    if (!slug) {
      reset();
      return;
    }
    const ed = editions.find((x) => x.slug === slug);
    if (!ed) return;
    const se = store.events.find((x) => x.slug === slug);
    if (se) {
      loadStoreEvent(se);
    } else {
      // édition du site pas encore surchargée -> pré-remplir pour créer la surcharge
      setEditingId(null);
      setOverrideSlug(ed.slug);
      setManageSlug(ed.slug);
      setForm({
        name: ed.name,
        date: ed.date,
        time: ed.time,
        venue: ed.venue,
        dresscode: ed.dresscode,
        headliner: ed.headliner,
        lineup: ed.lineup.join('\n'),
        bizoukEmbed: ed.bizoukEmbed,
      });
      setImg({
        dataUrl: ed.flyer,
        dominant: ed.dominantColor,
        palette: ed.palette,
        w: ed.flyerW,
        h: ed.flyerH,
      });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onFlyer(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const a = await analyzeImageFile(file);
      setImg({
        dataUrl: a.dataUrl,
        dominant: a.dominant,
        palette: a.palette,
        w: a.width,
        h: a.height,
      });
    } catch {
      flash('Flyer illisible.');
    }
  }

  // Analyse IA (Mistral / Pixtral) : PRÉ-REMPLIT les champs, ne publie jamais.
  async function analyzeFlyerAI() {
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
    flash('Champs pré-remplis par l’IA — relis et corrige avant d’enregistrer.');
  }

  const previewEmoji = resolveEmoji({ name: form.name, dominantColor: img.dominant });
  const previewGradient = heroGradient(img.palette, img.dominant);

  // Headliner / line-up : gérés en tableaux dans l'UI, sérialisés en chaîne
  // dans `form` (headliner « A · B », line-up une ligne par nom) — le payload et
  // buildEvent/applyEventPatch restent inchangés.
  const artistNames = store.artists.map((a) => a.name);
  const headlinerList = form.headliner
    .split(/\s*·\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const lineupList = form.lineup
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const inList = (list: string[], n: string) =>
    list.some((x) => normalizeArtistName(x) === normalizeArtistName(n));
  const setHeadliner = (arr: string[]) =>
    setForm((f) => ({ ...f, headliner: arr.join(' · ') }));
  const setLineup = (arr: string[]) =>
    setForm((f) => ({ ...f, lineup: arr.join('\n') }));

  const mode: 'create' | 'edit' | 'override' = editingId
    ? 'edit'
    : overrideSlug
      ? 'override'
      : 'create';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return flash('Nom obligatoire.');
    setBusy(true);
    const payload: Record<string, unknown> = {
      ...form,
      lineup: form.lineup,
      flyer: img.dataUrl || undefined,
      flyerW: img.w || undefined,
      flyerH: img.h || undefined,
      dominant: img.dominant ?? undefined,
      palette: img.palette,
    };
    if (mode === 'override' && overrideSlug) payload.slug = overrideSlug;

    const res = editingId
      ? await api(`/api/admin/events/${editingId}`, 'PATCH', payload)
      : await api('/api/admin/events', 'POST', payload);
    setBusy(false);
    if (!res.ok) return flash(res.error ?? 'Échec.');
    const item = res.item as StoredEvent;

    setStore({
      ...store,
      events: editingId
        ? store.events.map((ev) => (ev.id === editingId ? item : ev))
        : [item, ...store.events],
    });

    if (mode === 'create') {
      flash('Événement ajouté.');
      reset();
    } else {
      // on reste en mode modification sur l'événement enregistré
      flash(
        mode === 'override'
          ? 'Version personnalisée enregistrée.'
          : 'Événement modifié.',
      );
      loadStoreEvent(item);
    }
  }

  async function removeSelected() {
    const target = manageSlug
      ? store.events.find((e) => e.slug === manageSlug)
      : undefined;
    if (!target) return;
    const isOverride = editions.find((e) => e.slug === target.slug)?.isStatic;
    const label = isOverride
      ? `Réinitialiser « ${target.name} » à la version du site ? Les modifications admin seront perdues.`
      : `Supprimer définitivement « ${target.name} » ?`;
    if (!window.confirm(label)) return;
    const res = await api(`/api/admin/events/${target.id}`, 'DELETE');
    if (!res.ok) return flash(res.error ?? 'Échec.');
    setStore({
      ...store,
      events: store.events.filter((x) => x.id !== target.id),
    });
    reset();
    flash(isOverride ? 'Revenu à la version du site.' : 'Événement supprimé.');
  }

  const selectedEd = manageSlug
    ? editions.find((e) => e.slug === manageSlug)
    : undefined;
  const selectedStoreEvent = selectedEd
    ? store.events.find((e) => e.slug === selectedEd.slug)
    : undefined;

  return (
    <section className="admin-panel glass">
      <h2>{mode === 'create' ? 'Ajouter un événement' : 'Modifier l’événement'}</h2>

      <div className="admin-manage admin-manage--top">
        <p className="admin-manage__title">Gérer un événement existant</p>
        <select
          className="admin-manage__select"
          value={manageSlug}
          onChange={(e) => selectEdition(e.target.value)}
        >
          <option value="">— Sélectionner un événement à gérer</option>
          {editions.map((e) => (
            <option key={e.slug} value={e.slug}>
              {e.emoji} {e.name}
            </option>
          ))}
        </select>

        {selectedEd && (
          <div className="admin-list__item admin-manage__card">
            <span className="admin-list__emoji">{selectedEd.emoji}</span>
            <span className="admin-list__name">
              {selectedEd.name}
              <small>
                {selectedEd.slug}
                {' · '}
                {selectedStoreEvent
                  ? 'version personnalisée'
                  : selectedEd.isStatic
                    ? 'version du site — modifie puis enregistre'
                    : 'événement admin'}
              </small>
            </span>
            <a
              className="admin-mini"
              href={`/editions/${selectedEd.slug}`}
              target="_blank"
              rel="noopener"
            >
              Voir
            </a>
            {selectedStoreEvent ? (
              <button
                className="admin-mini admin-mini--danger"
                type="button"
                onClick={removeSelected}
              >
                {selectedEd.isStatic
                  ? 'Réinitialiser'
                  : 'Supprimer cet événement'}
              </button>
            ) : (
              <span className="admin-manage__hint">
                édition du site (non supprimable)
              </span>
            )}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="admin-form">
        <label className="admin-field">
          <span>Nom *</span>
          <input value={form.name} onChange={set('name')} required />
        </label>

        <label className="admin-field">
          <span>Flyer</span>
          <input type="file" accept="image/*" onChange={onFlyer} />
        </label>

        {(img.dataUrl || form.name) && (
          <div className="admin-preview">
            {img.dataUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={img.dataUrl} alt="" className="admin-preview__flyer" />
            )}
            <div className="admin-preview__meta">
              <span className="admin-preview__emoji">{previewEmoji}</span>
              <span
                className="admin-preview__grad"
                style={{ background: previewGradient }}
                title={previewGradient}
              />
              <span className="admin-preview__hex">{img.dominant ?? '— pas de flyer'}</span>
            </div>
          </div>
        )}

        {img.dataUrl && (
          <div className="admin-ai">
            <button
              type="button"
              className="btn btn--outline admin-ai__btn"
              onClick={analyzeFlyerAI}
              disabled={aiBusy}
            >
              <Icon name="sparkles" />
              <span>{aiBusy ? 'Analyse…' : 'Analyser le flyer (IA)'}</span>
            </button>
            <span className="admin-ai__hint">
              Suggestion automatique (Mistral) — pré-remplit les champs, jamais
              publiée telle quelle. Relis avant d’enregistrer.
            </span>
          </div>
        )}

        <div className="admin-row">
          <label className="admin-field">
            <span>Date (AAAA-MM-JJ)</span>
            <input value={form.date} onChange={set('date')} placeholder="2026-10-17" />
          </label>
          <label className="admin-field">
            <span>Heure</span>
            <input value={form.time} onChange={set('time')} placeholder="16h–22h" />
          </label>
        </div>

        <div className="admin-row">
          <label className="admin-field">
            <span>Lieu (vide par défaut)</span>
            <input value={form.venue} onChange={set('venue')} placeholder="laisser vide si non communiqué" />
          </label>
          <label className="admin-field">
            <span>Dresscode</span>
            <input value={form.dresscode} onChange={set('dresscode')} />
          </label>
        </div>

        <div className="admin-field">
          <span>Headliner</span>
          {headlinerList.length > 0 && (
            <ul className="admin-tags">
              {headlinerList.map((n) => (
                <li className="admin-tag" key={n}>
                  <span>{n}</span>
                  <button
                    type="button"
                    aria-label={`Retirer ${n} du headliner`}
                    onClick={() =>
                      setHeadliner(headlinerList.filter((x) => x !== n))
                    }
                  >
                    <Icon name="close" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ArtistCombobox
            options={artistNames.filter((n) => !inList(headlinerList, n))}
            onSelect={(n) => {
              if (!inList(headlinerList, n)) setHeadliner([...headlinerList, n]);
            }}
          />
        </div>

        <div className="admin-field">
          <span>Line-up complet</span>
          {lineupList.length > 0 && (
            <ul className="admin-tags">
              {lineupList.map((n) => (
                <li className="admin-tag" key={n}>
                  <span>{n}</span>
                  <button
                    type="button"
                    aria-label={`Retirer ${n} du line-up`}
                    onClick={() => setLineup(lineupList.filter((x) => x !== n))}
                  >
                    <Icon name="close" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ArtistCombobox
            options={artistNames.filter(
              (n) => !inList(lineupList, n) && !inList(headlinerList, n),
            )}
            onSelect={(n) => {
              if (!inList(lineupList, n)) setLineup([...lineupList, n]);
            }}
          />
          <span className="admin-field__hint">
            Les têtes d’affiche ne sont pas reproposées ici.
          </span>
        </div>

        <label className="admin-field">
          <span>Code d’intégration Bizouk (brut)</span>
          <textarea
            value={form.bizoukEmbed}
            onChange={set('bizoukEmbed')}
            rows={3}
            placeholder="<iframe src=&quot;https://www.bizouk.com/…&quot;></iframe>"
          />
        </label>

        <div className="admin-form__actions">
          <button className="btn btn--amber" type="submit" disabled={busy}>
            {busy
              ? '…'
              : mode === 'create'
                ? 'Ajouter'
                : 'Enregistrer les modifications'}
          </button>
          {mode !== 'create' && (
            <button className="btn btn--outline" type="button" onClick={reset}>
              Annuler
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

/* ======================= ARTISTES ======================= */

const emptyArtist = {
  name: '',
  role: '',
  bio: '',
  instagram: '',
  tiktok: '',
  soundcloud: '',
  email: '',
};

const ROLE_OPTIONS = ['DJ', 'Artiste', 'Musicien', 'Groupe'];

function ArtistPanel({
  store,
  setStore,
  flash,
}: {
  store: Store;
  setStore: (s: Store) => void;
  flash: (t: string) => void;
}) {
  const [form, setForm] = useState({ ...emptyArtist });
  const [image, setImage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const set =
    (k: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function reset() {
    setForm({ ...emptyArtist });
    setImage('');
    setEditingId(null);
  }

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
    const payload = { ...form, image: image || undefined };
    const res = editingId
      ? await api(`/api/admin/artists/${editingId}`, 'PATCH', payload)
      : await api('/api/admin/artists', 'POST', payload);
    setBusy(false);
    if (!res.ok) return flash(res.error ?? 'Échec.');
    const item = res.item as StoredArtist;
    setStore({
      ...store,
      artists: editingId
        ? store.artists.map((a) => (a.id === editingId ? item : a))
        : [item, ...store.artists],
    });
    setSelectedId(item.id); // le nouvel / modifié artiste devient l'artiste géré
    flash(editingId ? 'Artiste modifié.' : 'Artiste ajouté.');
    reset();
  }

  function edit(a: StoredArtist) {
    setEditingId(a.id);
    setForm({
      name: a.name,
      role: a.role,
      bio: a.bio,
      instagram: a.instagram,
      tiktok: a.tiktok,
      soundcloud: a.soundcloud,
      email: a.email,
    });
    setImage(a.image);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(a: StoredArtist) {
    const used = store.events.filter(
      (ev) =>
        ev.headliner.toLowerCase().includes(a.name.toLowerCase()) ||
        ev.lineup.some((n) => n.toLowerCase() === a.name.toLowerCase()),
    );
    const warn = used.length
      ? `\n\n« ${a.name} » est cité dans ${used.length} événement(s) admin : le nom restera affiché mais ne sera plus cliquable.`
      : '';
    if (!window.confirm(`Supprimer « ${a.name} » ?${warn}`)) return;
    const res = await api(`/api/admin/artists/${a.id}`, 'DELETE');
    if (!res.ok) return flash(res.error ?? 'Échec.');
    setStore({ ...store, artists: store.artists.filter((x) => x.id !== a.id) });
    if (editingId === a.id) reset();
    if (selectedId === a.id) setSelectedId('');
    flash('Artiste supprimé.');
  }

  const list = query.trim()
    ? store.artists.filter((a) =>
        `${a.name} ${a.role}`.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : store.artists;

  const selectedArtist =
    store.artists.find((a) => a.id === selectedId) ?? null;
  const selectedNets = selectedArtist
    ? [
        selectedArtist.instagram && 'IG',
        selectedArtist.tiktok && 'TT',
        selectedArtist.soundcloud && 'SC',
        selectedArtist.email && '✉',
      ].filter(Boolean)
    : [];

  const socials: { k: keyof typeof form; label: string; ph: string }[] = [
    { k: 'instagram', label: 'Instagram', ph: 'https://instagram.com/… ou @pseudo' },
    { k: 'tiktok', label: 'TikTok', ph: 'https://tiktok.com/@… ou @pseudo' },
    { k: 'soundcloud', label: 'SoundCloud', ph: 'https://soundcloud.com/…' },
    { k: 'email', label: 'Email', ph: 'artiste@exemple.com' },
  ];

  return (
    <section className="admin-panel glass">
      <h2>{editingId ? 'Modifier l’artiste' : 'Ajouter un artiste'}</h2>
      <form onSubmit={submit} className="admin-form">
        <label className="admin-field">
          <span>Nom *</span>
          <input value={form.name} onChange={set('name')} required />
        </label>
        <label className="admin-field">
          <span>Rôle</span>
          <select value={form.role} onChange={set('role')}>
            <option value="">— Non précisé</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            {form.role && !ROLE_OPTIONS.includes(form.role) && (
              <option value={form.role}>{form.role} (personnalisé)</option>
            )}
          </select>
        </label>
        <label className="admin-field">
          <span>Bio</span>
          <textarea value={form.bio} onChange={set('bio')} rows={4} />
        </label>
        <label className="admin-field">
          <span>Photo</span>
          <input type="file" accept="image/*" onChange={onImage} />
        </label>
        {image && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={image} alt="" className="admin-preview__artist" />
        )}

        <div className="admin-row">
          {socials.map((s) => (
            <label className="admin-field" key={s.k}>
              <span>{s.label}</span>
              <input value={form[s.k]} onChange={set(s.k)} placeholder={s.ph} />
            </label>
          ))}
        </div>

        <div className="admin-form__actions">
          <button className="btn btn--amber" type="submit" disabled={busy}>
            {busy ? '…' : editingId ? 'Enregistrer' : 'Ajouter'}
          </button>
          {editingId && (
            <button className="btn btn--outline" type="button" onClick={reset}>
              Annuler
            </button>
          )}
        </div>
      </form>

      {store.artists.length === 0 ? (
        <p className="admin-list__empty" style={{ marginTop: 'var(--s-24)' }}>
          Aucun artiste.
        </p>
      ) : (
        <div className="admin-manage">
          <p className="admin-manage__title">Gérer un artiste</p>
          <input
            className="admin-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Rechercher parmi ${store.artists.length} artiste(s)…`}
          />
          <select
            className="admin-manage__select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">
              — Sélectionner un artiste à gérer
              {query.trim() ? ` (${list.length} résultat(s))` : ''}
            </option>
            {list.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.role ? ` — ${a.role}` : ''}
              </option>
            ))}
          </select>

          {selectedArtist && (
            <div className="admin-list__item admin-manage__card">
              {selectedArtist.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={selectedArtist.image}
                  alt=""
                  className="admin-list__thumb"
                />
              ) : (
                <span className="admin-list__thumb admin-list__thumb--empty" />
              )}
              <span className="admin-list__name">
                {selectedArtist.name}
                <small>
                  /artistes/{selectedArtist.slug}
                  {selectedArtist.role ? ` · ${selectedArtist.role}` : ''}
                  {selectedNets.length ? ` · ${selectedNets.join(' ')}` : ''}
                </small>
              </span>
              <a
                className="admin-mini"
                href={`/artistes/${selectedArtist.slug}`}
                target="_blank"
                rel="noopener"
              >
                Voir
              </a>
              <button
                className="admin-mini"
                type="button"
                onClick={() => edit(selectedArtist)}
              >
                Modifier
              </button>
              <button
                className="admin-mini admin-mini--danger"
                type="button"
                onClick={() => remove(selectedArtist)}
              >
                Supprimer
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
