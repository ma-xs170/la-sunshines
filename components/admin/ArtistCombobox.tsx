'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Icon from '@/components/Icon';

/**
 * Combobox recherche + sélection d'un artiste (admin, EventPanel).
 * `options` = noms encore sélectionnables (le parent en retire ceux déjà pris,
 * et pour le line-up ceux déjà en headliner). `onSelect` reçoit le nom choisi.
 * `allowCustom` : proposer « + Ajouter « … » » quand la saisie ne matche aucun
 * artiste (permet d'ajouter un nom qui n'a pas encore de fiche).
 */
export default function ArtistCombobox({
  options,
  onSelect,
  allowCustom = true,
  placeholder = 'Rechercher un artiste…',
}: {
  options: string[];
  onSelect: (name: string) => void;
  allowCustom?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? options.filter((o) => o.toLowerCase().includes(q))
      : options;
    return [...base].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [options, query]);

  const exact = filtered.some(
    (o) => o.toLowerCase() === query.trim().toLowerCase(),
  );
  const showCustom = allowCustom && query.trim().length > 0 && !exact;
  const rowCount = filtered.length + (showCustom ? 1 : 0);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function choose(idx: number) {
    if (idx < filtered.length) onSelect(filtered[idx]);
    else if (showCustom) onSelect(query.trim());
    else return;
    setQuery('');
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(rowCount - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && rowCount > 0) choose(active);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="admin-cbx" ref={rootRef}>
      <div className="admin-cbx__control">
        <Icon name="sparkles" className="icon admin-cbx__ico" />
        <input
          type="text"
          className="admin-cbx__input"
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
        />
      </div>

      {open && (
        <ul className="admin-cbx__list" id={listId} role="listbox">
          {filtered.length === 0 && !showCustom && (
            <li className="admin-cbx__empty">Aucun artiste</li>
          )}
          {filtered.map((o, i) => (
            <li
              key={o}
              role="option"
              aria-selected={i === active}
              className={
                i === active ? 'admin-cbx__opt is-active' : 'admin-cbx__opt'
              }
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(i);
              }}
            >
              {o}
            </li>
          ))}
          {showCustom && (
            <li
              role="option"
              aria-selected={active === filtered.length}
              className={
                active === filtered.length
                  ? 'admin-cbx__opt admin-cbx__opt--custom is-active'
                  : 'admin-cbx__opt admin-cbx__opt--custom'
              }
              onMouseEnter={() => setActive(filtered.length)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(filtered.length);
              }}
            >
              + Ajouter «&nbsp;{query.trim()}&nbsp;»
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
