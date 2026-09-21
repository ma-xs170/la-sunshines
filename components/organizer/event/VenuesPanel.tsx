'use client';

import { useState } from 'react';
import { REGIONS, REGION_LABEL, mapsLink, type Region } from '@/lib/organizer/event-pages';

export interface Venue { id: string; name: string; address: string; postal_code: string; city: string; country: string; region: Region; lat: number | null; lng: number | null; hide_address: boolean }
const blank = (): Omit<Venue, 'id'> => ({ name: '', address: '', postal_code: '', city: '', country: 'France', region: 'guadeloupe', lat: null, lng: null, hide_address: false });

/** Lieux de l'organisation : adresse, région, coordonnées (lien Google Maps généré), adresse masquable sur la fiche publique. */
export default function VenuesPanel({ org, initial }: { org: string; initial: Venue[] }) {
  const [venues, setVenues] = useState(initial);
  const [edit, setEdit] = useState<(Omit<Venue, 'id'> & { id?: string }) | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

  async function submit() {
    if (!edit) return; setBusy(true); setErr('');
    const res = await fetch('/api/organisateur/venues', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...edit, org, id: edit.id ?? null }) });
    const j = await res.json().catch(() => ({})); setBusy(false);
    if (!res.ok) { setErr(j.error || 'Enregistrement impossible.'); return; }
    const v = { ...edit, id: j.id } as Venue;
    setVenues((l) => (edit.id ? l.map((x) => (x.id === v.id ? v : x)) : [...l, v])); setEdit(null);
  }

  return (
    <div className="ef">
      <section className="glass ef-card"><h2>Lieux de l’organisation</h2>
        {venues.length === 0 && !edit && <p className="ef-help">Aucun lieu pour l’instant. Ajoute le lieu de ta prochaine soirée : il servira pour les sessions et le calendrier régional.</p>}
        <ul className="ef-list">
          {venues.map((v) => (
            <li key={v.id}><div><strong>{v.name}</strong><span className="ef-help"> {REGION_LABEL[v.region]}{v.city ? ` · ${v.city}` : ''}{v.hide_address ? ' · adresse masquée' : ''}</span></div>
              <div className="ef-row">{mapsLink(v) && <a className="ef-link" href={mapsLink(v)!} target="_blank" rel="noopener noreferrer">Google Maps</a>}<button type="button" className="ef-link" onClick={() => setEdit(v)}>Modifier</button></div></li>
          ))}
        </ul>
        {!edit && <button type="button" className="btn btn--outline" onClick={() => setEdit(blank())}>Ajouter un lieu</button>}
      </section>
      {edit && (
        <section className="glass ef-card"><h2>{edit.id ? 'Modifier le lieu' : 'Nouveau lieu'}</h2>
          <div className="ef-grid">
            <div className="ef-field"><label htmlFor="v-n">Nom</label><input id="v-n" value={edit.name} maxLength={120} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div className="ef-field"><label htmlFor="v-r">Région</label><select id="v-r" value={edit.region} onChange={(e) => setEdit({ ...edit, region: e.target.value as Region })}>{REGIONS.map((r) => <option key={r} value={r}>{REGION_LABEL[r]}</option>)}</select></div>
            <div className="ef-field"><label htmlFor="v-a">Adresse</label><input id="v-a" value={edit.address} maxLength={250} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></div>
            <div className="ef-field"><label htmlFor="v-p">Code postal</label><input id="v-p" value={edit.postal_code} maxLength={12} onChange={(e) => setEdit({ ...edit, postal_code: e.target.value })} /></div>
            <div className="ef-field"><label htmlFor="v-c">Ville</label><input id="v-c" value={edit.city} maxLength={80} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></div>
            <div className="ef-field"><label htmlFor="v-y">Pays</label><input id="v-y" value={edit.country} maxLength={60} onChange={(e) => setEdit({ ...edit, country: e.target.value })} /></div>
            <div className="ef-field"><label htmlFor="v-la">Latitude</label><input id="v-la" inputMode="decimal" value={edit.lat ?? ''} onChange={(e) => setEdit({ ...edit, lat: num(e.target.value) })} /></div>
            <div className="ef-field"><label htmlFor="v-lo">Longitude</label><input id="v-lo" inputMode="decimal" value={edit.lng ?? ''} onChange={(e) => setEdit({ ...edit, lng: num(e.target.value) })} /></div>
          </div>
          <p className="ef-help">Coordonnées : dans Google Maps, clic droit sur le lieu puis copie les deux nombres. {mapsLink(edit) && <a className="ef-link" href={mapsLink(edit)!} target="_blank" rel="noopener noreferrer">Vérifier sur Google Maps</a>}</p>
          <label className="ef-check"><input type="checkbox" checked={edit.hide_address} onChange={(e) => setEdit({ ...edit, hide_address: e.target.checked })} />Masquer l’adresse sur la fiche publique</label>
          {err && <p className="ef-err" role="alert">{err}</p>}
          <div className="ef-row"><button type="button" className="btn btn--amber" disabled={busy} onClick={submit}>{busy ? 'Enregistrement…' : 'Enregistrer le lieu'}</button><button type="button" className="btn btn--outline" onClick={() => { setEdit(null); setErr(''); }}>Annuler</button></div>
        </section>
      )}
    </div>
  );
}
