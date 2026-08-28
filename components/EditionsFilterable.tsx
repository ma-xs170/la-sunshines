'use client';

import { useMemo, useState } from 'react';
import EditionCard from './EditionCard';
import { editionYear, type Edition } from '@/lib/editions';

type StatusFilter = 'all' | 'next' | 'past';
type YearFilter = 'all' | number;

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'next', label: 'À venir' },
  { id: 'past', label: 'Passées' },
];

// Liste complète avec filtres (statut + année, combinables) — utilisée sur /editions.
export default function EditionsFilterable({ editions }: { editions: Edition[] }) {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [year, setYear] = useState<YearFilter>('all');

  // années présentes dans les données, décroissantes (jamais codées en dur)
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const e of editions) {
      const y = editionYear(e);
      if (y !== null) set.add(y);
    }
    return [...set].sort((a, b) => b - a);
  }, [editions]);

  return (
    <>
      <div className="filters" role="tablist" aria-label="Filtrer par statut">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            className={status === f.id ? 'filter is-active' : 'filter'}
            type="button"
            role="tab"
            aria-selected={status === f.id}
            onClick={() => setStatus(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {years.length > 1 && (
        <div
          className="filters filters--years"
          role="tablist"
          aria-label="Filtrer par année"
        >
          <button
            className={year === 'all' ? 'filter is-active' : 'filter'}
            type="button"
            role="tab"
            aria-selected={year === 'all'}
            onClick={() => setYear('all')}
          >
            Toutes les années
          </button>
          {years.map((y) => (
            <button
              key={y}
              className={year === y ? 'filter is-active' : 'filter'}
              type="button"
              role="tab"
              aria-selected={year === y}
              onClick={() => setYear(y)}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      {(() => {
        const matches = (e: Edition) => {
          const okStatus = status === 'all' || e.status === status;
          const okYear = year === 'all' || editionYear(e) === year;
          return okStatus && okYear;
        };
        const visibleCount = editions.filter(matches).length;
        return (
          <>
            {visibleCount === 0 && (
              <div className="editions-empty" role="status">
                <p>Aucune édition ne correspond à ces filtres.</p>
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => {
                    setStatus('all');
                    setYear('all');
                  }}
                >
                  Réinitialiser les filtres
                </button>
              </div>
            )}
            {/* toutes les cartes restent montées (juste display:none si filtrées)
                -> pas de remontage, pas de course avec la révélation au scroll */}
            {editions.map((edition) => (
              <EditionCard
                key={edition.slug}
                edition={edition}
                hidden={!matches(edition)}
              />
            ))}
          </>
        );
      })()}
    </>
  );
}
