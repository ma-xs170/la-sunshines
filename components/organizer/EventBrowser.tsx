'use client';

import { useEffect, useRef, useState } from 'react';
import ProgressBar from './ProgressBar';

export interface CardEvent {
  slug: string; title: string; dateLabel: string; venue: string; state: string; stateLabel: string;
  sold: number; reserved: number; capacity: number; entered: number; hasFlyer: boolean; organizerName: string;
}

const KEY = 'sun_org_view';

function Card({ e, tile }: { e: CardEvent; tile: boolean }) {
  return (
    <a className={'org-card glass ' + (tile ? 'org-card--tile' : 'org-card--row')} href={`/organisateur/evenements/${e.slug}`}>
      <span className="org-card__media">
        {e.hasFlyer ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/organisateur/events/${e.slug}/flyer`} alt="" loading="lazy" />
        ) : (
          <span className="org-card__noflyer script" aria-hidden="true">La Sunshines</span>
        )}
      </span>
      <span className="org-card__body">
        <span className="org-card__head">
          <span className={`org-state org-state--${e.state}`}>{e.stateLabel}</span>
          <span className="org-card__date">{e.dateLabel}</span>
        </span>
        <span className="org-card__title">{e.title}</span>
        <span className="org-card__venue">{e.venue || 'Lieu à préciser'}</span>
        <ProgressBar sold={e.sold} reserved={e.reserved} capacity={e.capacity} compact />
        <span className="org-card__foot">{e.entered} entrée{e.entered > 1 ? 's' : ''} scannée{e.entered > 1 ? 's' : ''}</span>
      </span>
    </a>
  );
}

/** Liste des événements en deux vues au choix : liste ou carrousel coulissant (choix mémorisé). */
export default function EventBrowser({ events }: { events: CardEvent[] }) {
  const [view, setView] = useState<'list' | 'carousel'>('list');
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { const v = localStorage.getItem(KEY); if (v === 'list' || v === 'carousel') setView(v); } catch { /* stockage indisponible */ }
  }, []);
  const choose = (v: 'list' | 'carousel') => { setView(v); try { localStorage.setItem(KEY, v); } catch { /* ignore */ } };
  const scroll = (dir: -1 | 1) => track.current?.scrollBy({ left: dir * Math.min(340, (track.current.clientWidth ?? 340) * 0.85), behavior: 'smooth' });

  if (events.length === 0) {
    return (
      <div className="glass org-empty">
        <p className="script">Rien pour l’instant</p>
        <h2>Aucun événement</h2>
        <p>Les événements de ton organisation apparaîtront ici dès que leur billetterie sera configurée.</p>
      </div>
    );
  }
  return (
    <>
      <div className="org__bar">
        <p className="org__count">{events.length} événement{events.length > 1 ? 's' : ''}</p>
        <div className="org__seg" role="group" aria-label="Affichage">
          <button type="button" className={view === 'list' ? 'is-active' : ''} aria-pressed={view === 'list'} onClick={() => choose('list')}>Liste</button>
          <button type="button" className={view === 'carousel' ? 'is-active' : ''} aria-pressed={view === 'carousel'} onClick={() => choose('carousel')}>Carrousel</button>
        </div>
      </div>
      {view === 'list' ? (
        <ul className="org-list">
          {events.map((e) => <li key={e.slug}><Card e={e} tile={false} /></li>)}
        </ul>
      ) : (
        <div className="org-carousel">
          <button type="button" className="org-carousel__nav org-carousel__nav--prev" aria-label="Précédent" onClick={() => scroll(-1)}>‹</button>
          <div className="org-carousel__track" ref={track} tabIndex={0} aria-label="Événements, faire défiler">
            {events.map((e) => <div className="org-carousel__slide" key={e.slug}><Card e={e} tile /></div>)}
          </div>
          <button type="button" className="org-carousel__nav org-carousel__nav--next" aria-label="Suivant" onClick={() => scroll(1)}>›</button>
        </div>
      )}
    </>
  );
}
