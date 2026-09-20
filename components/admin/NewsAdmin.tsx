'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { NEWS_CATEGORIES, type NewsCategory } from '@/lib/news/text';

export interface AdminPost { id: string; title: string; category: NewsCategory; body: string; image_url: string | null; status: 'draft' | 'published'; pinned: boolean; published_at: string | null; reads: number }
interface Draft { id: string | null; title: string; category: NewsCategory; body: string; image_url: string; status: 'draft' | 'published'; pinned: boolean }
const blank: Draft = { id: null, title: '', category: 'nouveaute', body: '', image_url: '', status: 'draft', pinned: false };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'America/Guadeloupe' }) : '—');

/** Publication des actualités affichées aux organisateurs : titre, catégorie, texte simple, image (https), brouillon / publié, épinglé. */
export default function NewsAdmin({ posts }: { posts: AdminPost[] }) {
  const router = useRouter();
  const [d, setD] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => setD((x) => (x ? { ...x, ...p } : x));

  async function save(e: React.FormEvent, status: 'draft' | 'published') {
    e.preventDefault();
    if (!d) return;
    setBusy(true); setErr(''); setOk('');
    const r = await fetch('/api/admin/news', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...d, status, image_url: d.image_url.trim() || null }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? 'Échec.'); return; }
    setD(null); setOk(status === 'published' ? 'Publié.' : 'Brouillon enregistré.'); router.refresh();
  }
  async function del(id: string) {
    setBusy(true); setErr('');
    const r = await fetch(`/api/admin/news/${id}`, { method: 'DELETE' });
    setBusy(false); setConfirm(null);
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error ?? 'Échec.'); return; }
    setOk('Supprimé.'); router.refresh();
  }

  return (
    <div className="admin-news">
      <p className="admin-hint">Visible par les organisateurs dans « Actualités » (cloche de leur espace). Texte simple : les balises HTML sont retirées. Une publication <strong>épinglée</strong> s’affiche en bandeau en haut de leur accueil.</p>
      {ok && <p className="org-ok" role="status">{ok}</p>}
      {err && !d && <p className="admin-error" role="alert">{err}</p>}
      {!d && <button type="button" className="btn btn--amber" onClick={() => { setD(blank); setErr(''); setOk(''); }}>Nouvelle publication</button>}

      {d && (
        <form className="admin-panel glass admin-panel--wide org-tierform" onSubmit={(e) => save(e, 'published')}>
          <h2>{d.id ? 'Modifier la publication' : 'Nouvelle publication'}</h2>
          <label className="admin-field"><span>Titre</span><input value={d.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} required /></label>
          <label className="admin-field"><span>Catégorie</span>
            <select value={d.category} onChange={(e) => set({ category: e.target.value as NewsCategory })}>{Object.entries(NEWS_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="admin-field"><span>Contenu (texte simple — ligne vide = nouveau paragraphe)</span><textarea rows={7} value={d.body} onChange={(e) => set({ body: e.target.value })} maxLength={5000} required /></label>
          <label className="admin-field"><span>Image (facultatif, adresse https://…)</span><input type="url" value={d.image_url} onChange={(e) => set({ image_url: e.target.value })} maxLength={500} placeholder="https://" /></label>
          <label className="org-composer__check"><input type="checkbox" checked={d.pinned} onChange={(e) => set({ pinned: e.target.checked })} />Épingler en bandeau en haut de l’accueil des organisateurs</label>
          {err && <p className="admin-error" role="alert">{err}</p>}
          <div className="org-settings__foot">
            <button className="btn btn--amber" disabled={busy}>{busy ? 'Enregistrement…' : 'Publier'}</button>
            <button type="button" className="btn btn--outline" disabled={busy} onClick={(e) => save(e, 'draft')}>Enregistrer en brouillon</button>
            <button type="button" className="btn btn--ghost" onClick={() => { setD(null); setErr(''); }}>Annuler</button>
          </div>
        </form>
      )}

      <ul className="admin-news__list">
        {posts.length === 0 && <li className="admin-hint">Aucune publication pour l’instant.</li>}
        {posts.map((p) => (
          <li key={p.id} className="admin-panel glass admin-panel--wide">
            <div className="admin-news__row">
              <div>
                <strong>{p.title}</strong>
                <p className="admin-hint">{NEWS_CATEGORIES[p.category]} · {p.status === 'published' ? `publié le ${fmt(p.published_at)} · lu par ${p.reads}` : 'brouillon'}{p.pinned ? ' · épinglé' : ''}</p>
              </div>
              <div className="admin-news__actions">
                <button type="button" className="btn btn--outline" onClick={() => { setD({ id: p.id, title: p.title, category: p.category, body: p.body, image_url: p.image_url ?? '', status: p.status, pinned: p.pinned }); setErr(''); setOk(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Modifier</button>
                {confirm === p.id
                  ? <><button type="button" className="btn btn--amber" disabled={busy} onClick={() => del(p.id)}>Confirmer</button><button type="button" className="btn btn--ghost" onClick={() => setConfirm(null)}>Annuler</button></>
                  : <button type="button" className="btn btn--ghost" onClick={() => setConfirm(p.id)}>Supprimer</button>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
