'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NewsItem } from '@/lib/organizer/news';
import { NEWS_CATEGORIES, paragraphs } from '@/lib/news/text';

const fmt = (iso: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'America/Guadeloupe' }).format(new Date(iso));

/** Publications, de la plus récente à la plus ancienne. Lu / non lu par utilisateur ; « Tout marquer comme lu ». Texte simple uniquement. */
export default function NewsFeed({ items }: { items: NewsItem[] }) {
  const router = useRouter();
  const [read, setRead] = useState<Set<string>>(() => new Set(items.filter((i) => i.read).map((i) => i.id)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const unread = items.filter((i) => !read.has(i.id)).length;

  async function mark(id?: string) {
    setBusy(true); setErr('');
    const r = await fetch('/api/organisateur/actualites/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { id } : {}) });
    setBusy(false);
    if (!r.ok) { setErr('Impossible de mettre à jour pour l’instant.'); return; }
    setRead((s) => new Set(id ? [...s, id] : items.map((i) => i.id)));
    router.refresh();   // met à jour la pastille de la cloche
  }

  if (items.length === 0) {
    return <div className="glass org-empty"><p className="script">Rien pour l’instant</p><h2>Aucune actualité</h2><p>Les nouveautés du site apparaîtront ici.</p></div>;
  }
  return (
    <>
      <div className="org__bar">
        <p className="org__count" aria-live="polite">{unread > 0 ? `${unread} non lue${unread > 1 ? 's' : ''}` : 'Tout est lu'}</p>
        <button type="button" className="btn btn--outline" onClick={() => mark()} disabled={busy || unread === 0}>Tout marquer comme lu</button>
      </div>
      {err && <p className="admin-error" role="alert">{err}</p>}
      <ul className="org-news">
        {items.map((n) => {
          const isRead = read.has(n.id);
          return (
            <li key={n.id} id={n.id} className={'glass org-news__item' + (isRead ? '' : ' is-unread')}>
              <div className="org-news__head">
                <span className={`org-news__cat org-news__cat--${n.category}`}>{NEWS_CATEGORIES[n.category]}</span>
                {n.pinned && <span className="org-news__pin">Épinglé</span>}
                {!isRead && <span className="org-news__dot" role="img" aria-label="Non lue" />}
                <time className="org-news__date" dateTime={n.published_at}>{fmt(n.published_at)}</time>
              </div>
              <h2>{n.title}</h2>
              {n.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="org-news__img" src={n.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
              )}
              {paragraphs(n.body).map((p, i) => <p key={i} className="org-news__body">{p}</p>)}
              {!isRead && <button type="button" className="btn btn--ghost" onClick={() => mark(n.id)} disabled={busy}>Marquer comme lu</button>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
