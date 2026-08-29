'use client';

import { useEffect, useRef, useState } from 'react';

// Champ « Localisation » avec autocomplétion Google Places (via /api/admin/places,
// clé serveur, biais Guadeloupe). Sans clé Google → simple champ texte.
export default function PlacesAutocomplete({
  value,
  onChange,
  placeholder = 'Nom du lieu, adresse…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const skipNext = useRef(false); // évite de relancer une recherche juste après un clic

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/places?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as {
          configured?: boolean;
          suggestions?: string[];
        };
        setConfigured(data.configured ?? false);
        setSuggestions(data.suggestions ?? []);
        setOpen(true);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 320);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  function pick(s: string) {
    skipNext.current = true;
    onChange(s);
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div className="places" ref={boxRef}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && (loading || suggestions.length > 0) && (
        <ul className="places__list">
          {loading && <li className="places__loading">Recherche…</li>}
          {suggestions.map((s) => (
            <li key={s}>
              <button type="button" className="places__opt" onClick={() => pick(s)}>
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
      {configured === false && (
        <span className="places__hint">
          Autocomplétion Google inactive — saisie libre (ajoute
          <code> GOOGLE_MAPS_API_KEY</code>).
        </span>
      )}
    </div>
  );
}
