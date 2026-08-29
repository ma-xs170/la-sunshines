'use client';

import { useRef, useState } from 'react';
import type {
  Store,
  StoredArtist,
  StoredEvent,
  StoredAnnouncement,
} from '@/lib/store';
import type { PageviewSummary } from '@/lib/pageviews';
import { analyzeImageFile } from '@/lib/clientColor';
import Icon from '@/components/Icon';
import EventsSection from './EventsSection';

const VERCEL_ANALYTICS_URL = 'https://vercel.com/dashboard/analytics';

type TabId = 'dashboard' | 'events' | 'artists' | 'announcements' | 'tickets';
const TABS: { id: TabId; label: string }[] = [
  { id: 'dashboard', label: 'Tableau de bord' },
  { id: 'events', label: 'Événements' },
  { id: 'artists', label: 'Artistes' },
  { id: 'announcements', label: 'Annonces' },
  { id: 'tickets', label: 'Tickets' },
];

export type EditionLite = {
  slug: string;
  name: string;
  emoji: string;
  gallery: string[];
  /** true si l'édition provient de lib/editions.ts (non supprimable ici). */
  isStatic: boolean;
  /** id du StoredEvent qui la porte (surcharge ou ajout admin), sinon null. */
  storeId: string | null;
  /** événement privé (masqué du site public). */
  hidden: boolean;
  // pré-remplissage du formulaire d'édition
  description: string;
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

// note ajoutée aux confirmations d'enregistrement (le contenu part sur GitHub
// et Vercel redéploie tout seul).
const SAVED_NOTE = 'Le site se met à jour automatiquement (~1 min).';

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
  /** true si l'écriture a été committée sur GitHub (→ redeploy auto). */
  deployed?: boolean;
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
  analytics,
}: {
  initialStore: Store;
  editions: EditionLite[];
  analytics: PageviewSummary | null;
}) {
  const [store, setStore] = useState<Store>(initialStore);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [msg, setMsg] = useState<string>('');
  const msgTimer = useRef<number | undefined>(undefined);

  function flash(text: string, saved?: boolean) {
    setMsg(saved ? `${text} ${SAVED_NOTE}` : text);
    if (msgTimer.current) window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(''), saved ? 5000 : 3500);
  }

  async function logout() {
    await api('/api/admin/logout', 'POST');
    window.location.reload();
  }

  const openTickets = store.tickets.filter((t) => t.status !== 'done').length;

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

      <nav className="admin-tabs" aria-label="Sections de l’administration">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'admin-tab is-active' : 'admin-tab'}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'tickets' && openTickets > 0 && (
              <span className="admin-tab__badge">{openTickets}</span>
            )}
          </button>
        ))}
        <a
          className="admin-tab admin-tab--ext"
          href="/status"
          target="_blank"
          rel="noopener"
        >
          Statuts <Icon name="arrow-up-right" className="icon" />
        </a>
      </nav>

      {msg && <p className="admin-flash">{msg}</p>}

      <p className="admin-note">
        Chaque enregistrement est committé sur GitHub (<code>data/content.json</code>)
        et déclenche un redéploiement automatique&nbsp;: les changements sont en
        ligne en ~1&nbsp;min. En local, l’écriture se fait directement sur le disque.
      </p>

      {tab === 'dashboard' && (
        <DashboardPanel
          store={store}
          openTickets={openTickets}
          analytics={analytics}
        />
      )}

      {tab === 'events' && (
        <EventsSection
          store={store}
          setStore={setStore}
          flash={flash}
          editions={editions}
        />
      )}

      {tab === 'artists' && (
        <div className="admin-tabpanel">
          <ArtistPanel store={store} setStore={setStore} flash={flash} />
        </div>
      )}

      {tab === 'announcements' && (
        <div className="admin-tabpanel">
          <AnnouncementPanel store={store} setStore={setStore} flash={flash} />
        </div>
      )}

      {tab === 'tickets' && (
        <div className="admin-tabpanel">
          <TicketPanel store={store} setStore={setStore} flash={flash} />
        </div>
      )}
    </main>
  );
}

/* ======================= TABLEAU DE BORD ======================= */

function DashboardPanel({
  store,
  openTickets,
  analytics,
}: {
  store: Store;
  openTickets: number;
  analytics: PageviewSummary | null;
}) {
  const stats = [
    { n: store.events.length, l: 'Événements (admin)' },
    { n: store.artists.length, l: 'Artistes' },
    { n: openTickets, l: 'Tickets ouverts' },
  ];

  return (
    <div className="admin-tabpanel admin-dash">
      <div className="admin-stats">
        {stats.map((s) => (
          <div className="admin-stat glass" key={s.l}>
            <span className="admin-stat__n">{s.n}</span>
            <span className="admin-stat__l">{s.l}</span>
          </div>
        ))}
      </div>

      <section className="admin-panel glass">
        <h2>Trafic</h2>
        <p className="admin-note admin-note--tight">
          Stats détaillées (visiteurs, sources, temps réel)&nbsp;:{' '}
          <a href={VERCEL_ANALYTICS_URL} target="_blank" rel="noopener">
            dashboard Vercel Analytics
          </a>{' '}
          — l’API de stats n’est accessible que sur un plan Vercel payant, d’où le
          compteur maison ci-dessous.
        </p>

        {analytics ? (
          <>
            <p className="admin-dash__total">
              <strong>{analytics.total.toLocaleString('fr-FR')}</strong> pages vues
              · {analytics.days} derniers jours
            </p>
            {analytics.pages.length > 0 ? (
              <ol className="admin-dash__top">
                {analytics.pages.map((p) => {
                  const max = analytics.pages[0].views || 1;
                  return (
                    <li key={p.path}>
                      <span className="admin-dash__path">{p.path}</span>
                      <span
                        className="admin-dash__bar"
                        style={{ width: `${Math.max(6, (p.views / max) * 100)}%` }}
                      />
                      <span className="admin-dash__views">
                        {p.views.toLocaleString('fr-FR')}
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="admin-hint">
                Aucune vue enregistrée pour l’instant — reviens dans quelques heures.
              </p>
            )}
          </>
        ) : (
          <p className="admin-hint">
            Compteur de pages vues inactif. Lie un store <strong>Vercel KV</strong>{' '}
            au projet (Vercel → Storage → Create → KV), redéploie&nbsp;: le comptage
            démarre automatiquement.
          </p>
        )}
      </section>
    </div>
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
  flash: (t: string, saved?: boolean) => void;
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
    flash(status === 'done' ? 'Ticket marqué traité.' : 'Ticket rouvert.', res.deployed);
  }

  async function remove(id: string) {
    if (!window.confirm('Supprimer ce ticket ?')) return;
    const res = await api(`/api/admin/tickets/${id}`, 'DELETE');
    if (!res.ok) return flash(res.error ?? 'Échec.');
    setStore({ ...store, tickets: store.tickets.filter((t) => t.id !== id) });
    flash('Ticket supprimé.', res.deployed);
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
  flash: (t: string, saved?: boolean) => void;
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
    flash('Annonce publiée.', res.deployed);
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
    flash(item.active ? 'Annonce activée.' : 'Annonce désactivée.', res.deployed);
  }

  async function remove(a: StoredAnnouncement) {
    if (!window.confirm('Supprimer cette annonce ?')) return;
    const res = await api(`/api/admin/announcements/${a.id}`, 'DELETE');
    if (!res.ok) return flash(res.error ?? 'Échec.');
    setStore({
      ...store,
      announcements: store.announcements.filter((x) => x.id !== a.id),
    });
    flash('Annonce supprimée.', res.deployed);
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
  flash: (t: string, saved?: boolean) => void;
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
    flash(editingId ? 'Artiste modifié.' : 'Artiste ajouté.', res.deployed);
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
    flash('Artiste supprimé.', res.deployed);
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
