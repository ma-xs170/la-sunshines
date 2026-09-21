'use client';

import { useState } from 'react';
import { upload } from '@vercel/blob/client';
import OrganizerAvatar from '../OrganizerAvatar';
import { NETWORKS, normalizeSocial } from '@/lib/socialLinks';

export interface PageData { slug: string; description: string; logo_url: string | null; banner_url: string | null; website: string; socials: Record<string, string>; followers: number }

/** Page publique de l'organisation : logo, bannière (facultative), description, réseaux, site. L'avatar aux initiales sert tant qu'il n'y a pas de logo. */
export default function PublicPageForm({ org, name, initial, isOpen }: { org: string; name: string; initial: PageData; isOpen: boolean }) {
  const [d, setD] = useState(initial); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [ok, setOk] = useState(false);
  async function pick(kind: 'logo_url' | 'banner_url', f: File | undefined) {
    if (!f) return; setMsg('');
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 5 * 1048576) { setMsg('Image refusée : JPEG, PNG ou WebP, 5 Mo maximum.'); return; }
    try { const b = await upload(`organisateurs/${org}/${kind === 'logo_url' ? 'logo' : 'banniere'}-${f.name.replace(/[^A-Za-z0-9._-]/g, '_')}`, f, { access: 'public', handleUploadUrl: '/api/organisateur/page-publique' }); setD((c) => ({ ...c, [kind]: b.url })); }
    catch { setMsg('Envoi impossible. Réessaie.'); }
  }
  async function save() {
    setBusy(true); setMsg(''); setOk(false);
    const r = await fetch('/api/organisateur/page-publique', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org, description: d.description, website: d.website, socials: d.socials, logo_url: d.logo_url, banner_url: d.banner_url }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg(j.error || 'Enregistrement impossible.'); return; } setOk(true); setMsg('Page enregistrée.');
  }
  return (
    <div className="ef">
      <section className="glass ef-card"><h2>Identité</h2>
        <div className="ef-row"><OrganizerAvatar name={name} src={d.logo_url} size={88} />
          <label className="btn btn--outline ef-file"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { void pick('logo_url', e.target.files?.[0]); e.target.value = ''; }} />Choisir un logo</label>
          {d.logo_url && <button type="button" className="ef-link" onClick={() => setD({ ...d, logo_url: null })}>Retirer le logo</button>}</div>
        <div className="ef-row"><label className="btn btn--outline ef-file"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { void pick('banner_url', e.target.files?.[0]); e.target.value = ''; }} />Choisir une bannière (facultatif)</label>
          {d.banner_url && <button type="button" className="ef-link" onClick={() => setD({ ...d, banner_url: null })}>Retirer la bannière</button>}</div>
        <p className="ef-help">Sans logo, un avatar aux initiales de ta structure est généré aux couleurs du site.</p></section>
      <section className="glass ef-card"><h2>Présentation</h2>
        <div className="ef-field"><label htmlFor="pp-d">Description</label><textarea id="pp-d" rows={7} maxLength={3000} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></div>
        <div className="ef-field"><label htmlFor="pp-w">Site web</label><input id="pp-w" value={d.website} placeholder="https://" onChange={(e) => setD({ ...d, website: e.target.value })} /></div>
        <div className="ef-grid">{NETWORKS.map((n) => { const p = normalizeSocial(n.id, d.socials[n.id] ?? ''); return (
          <div className="ef-field" key={n.id}><label htmlFor={'pp-' + n.id}>{n.label}</label><input id={'pp-' + n.id} value={d.socials[n.id] ?? ''} onChange={(e) => setD({ ...d, socials: { ...d.socials, [n.id]: e.target.value } })} aria-invalid={p === null} />
            {p === null ? <p className="ef-help ef-err">Lien {n.label} non reconnu.</p> : p ? <p className="ef-help">Lien : {p}</p> : null}</div>); })}</div></section>
      <section className="glass ef-card"><h2>Ta page publique</h2>
        <p>Adresse : <code>/organisateurs/{d.slug}</code> · {d.followers} abonné{d.followers > 1 ? 's' : ''}.</p>
        <p className="ef-help">{isOpen ? '' : 'La page sera visible du public à l’ouverture de la billetterie du site. '}Les abonnés ne reçoivent d’e-mails que s’ils l’ont demandé.</p>
        {msg && <p className={ok ? 'ef-help' : 'ef-err'} role="status">{msg}</p>}
        <button className="btn btn--amber" disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></section>
    </div>
  );
}
