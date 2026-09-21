'use client';

import { useId, useState } from 'react';
import { MAX_COLORS, NOTE_MAX, PALETTE, readableOn, suggest, type DresscodeValue } from '@/lib/dresscodeColors';

/** Dresscode par couleurs : pastilles + saisie avec autocomplétion (sans accents ni casse) ; « Tenue libre » est exclusif ; précision facultative. */
export default function DresscodePicker({ value, onChange }: { value: DresscodeValue; onChange: (v: DresscodeValue) => void }) {
  const [q, setQ] = useState('');
  const id = useId();
  const hits = suggest(q, value.colors);
  const has = (n: string) => value.colors.some((c) => c.name === n);
  const toggle = (c: (typeof PALETTE)[number]) => {
    if (has(c.name)) onChange({ ...value, colors: value.colors.filter((x) => x.name !== c.name) });
    else if (value.colors.length < MAX_COLORS) onChange({ ...value, free: false, colors: [...value.colors, c] });
    setQ('');
  };
  return (
    <fieldset className="ef-dress">
      <legend>Dresscode</legend>
      <label className="ef-check">
        <input type="checkbox" checked={value.free} onChange={(e) => onChange(e.target.checked ? { colors: [], free: true, note: value.note } : { ...value, free: false })} />
        Tenue libre
      </label>
      {!value.free && (
        <>
          <div className="ef-swatches" role="group" aria-label="Couleurs du dresscode">
            {PALETTE.map((c) => (
              <button key={c.name} type="button" className={'ef-swatch' + (has(c.name) ? ' is-on' : '')} style={{ background: c.hex, color: readableOn(c.hex) }}
                aria-pressed={has(c.name)} onClick={() => toggle(c)} title={c.name}>
                <span className="ef-swatch__name">{c.name}</span>{has(c.name) && <span aria-hidden="true"> ✓</span>}
              </button>
            ))}
          </div>
          <div className="ef-field">
            <label htmlFor={id}>Chercher une couleur</label>
            <input id={id} type="text" value={q} autoComplete="off" placeholder="ex. bor → Bordeaux" onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { e.preventDefault(); toggle(hits[0]); } }} />
            {hits.length > 0 && <ul className="ef-suggest" role="listbox">{hits.map((c) => <li key={c.name}><button type="button" role="option" aria-selected="false" onClick={() => toggle(c)}><i style={{ background: c.hex }} aria-hidden="true" />{c.name}</button></li>)}</ul>}
            <p className="ef-help">{value.colors.length}/{MAX_COLORS} couleurs : {value.colors.map((c) => c.name).join(', ') || 'aucune'}.</p>
          </div>
        </>
      )}
      <div className="ef-field">
        <label htmlFor={id + 'n'}>Précision (facultatif)</label>
        <input id={id + 'n'} type="text" maxLength={NOTE_MAX} value={value.note} placeholder="ex. Total look blanc exigé" onChange={(e) => onChange({ ...value, note: e.target.value })} />
      </div>
    </fieldset>
  );
}
