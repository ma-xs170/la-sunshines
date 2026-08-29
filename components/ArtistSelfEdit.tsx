'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from '@/components/Icon';
import { analyzeImageFile } from '@/lib/clientColor';

type Initial = {
  image: string;
  banner: string;
  bio: string;
  instagram: string;
  tiktok: string;
  soundcloud: string;
  email: string;
};

const SOCIALS: { k: 'instagram' | 'tiktok' | 'soundcloud' | 'email'; label: string; ph: string }[] = [
  { k: 'instagram', label: 'Instagram', ph: 'https://instagram.com/… ou @pseudo' },
  { k: 'tiktok', label: 'TikTok', ph: 'https://tiktok.com/@… ou @pseudo' },
  { k: 'soundcloud', label: 'SoundCloud', ph: 'https://soundcloud.com/…' },
  { k: 'email', label: 'Email public', ph: 'artiste@exemple.com' },
];

export default function ArtistSelfEdit({
  slug,
  initial,
}: {
  slug: string;
  initial: Initial;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Initial>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const set =
    (k: keyof Initial) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function pickImage(
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'image' | 'banner',
  ) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const a = await analyzeImageFile(file);
      setForm((f) => ({ ...f, [field]: a.dataUrl }));
      setNote(null);
    } catch {
      setNote({ kind: 'err', text: 'Image illisible.' });
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const res = await fetch('/api/artist/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setNote({ kind: 'err', text: data.error ?? 'Échec de l’enregistrement.' });
      return;
    }
    setNote({
      kind: 'ok',
      text: 'Enregistré. Ta page se met à jour automatiquement (~1 min).',
    });
  }

  async function logout() {
    await fetch('/api/artist/logout', { method: 'POST' });
    router.push(`/artistes/${slug}`);
  }

  return (
    <form className="ase" onSubmit={save}>
      <section className="ase-card glass">
        <h2>Photo &amp; bannière</h2>

        <div className="ase-media">
          <div className="ase-media__col">
            <span className="ase-media__label">Photo de profil</span>
            <div className="ase-photo">
              {form.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={form.image} alt="" />
              ) : (
                <span className="ase-photo__empty">
                  <Icon name="sparkles" />
                </span>
              )}
            </div>
            <div className="ase-media__acts">
              <label className="btn btn--outline">
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => pickImage(e, 'image')}
                />
                {form.image ? 'Remplacer' : 'Ajouter'}
              </label>
              {form.image && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setForm((f) => ({ ...f, image: '' }))}
                >
                  Retirer
                </button>
              )}
            </div>
          </div>

          <div className="ase-media__col">
            <span className="ase-media__label">Bannière</span>
            <div className="ase-banner">
              {form.banner ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={form.banner} alt="" />
              ) : (
                <span className="ase-banner__empty">
                  Sans bannière, le flyer de ta prochaine édition s’affiche
                  automatiquement.
                </span>
              )}
            </div>
            <div className="ase-media__acts">
              <label className="btn btn--outline">
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => pickImage(e, 'banner')}
                />
                {form.banner ? 'Remplacer' : 'Ajouter'}
              </label>
              {form.banner && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setForm((f) => ({ ...f, banner: '' }))}
                >
                  Supprimer la bannière
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="ase-card glass">
        <h2>Bio</h2>
        <label className="admin-field">
          <span>Présentation</span>
          <textarea
            value={form.bio}
            onChange={set('bio')}
            rows={5}
            placeholder="Quelques lignes sur toi, ton univers…"
          />
        </label>
      </section>

      <section className="ase-card glass">
        <h2>Réseaux</h2>
        <div className="ase-grid">
          {SOCIALS.map((s) => (
            <label className="admin-field" key={s.k}>
              <span>{s.label}</span>
              <input value={form[s.k]} onChange={set(s.k)} placeholder={s.ph} />
            </label>
          ))}
        </div>
      </section>

      {note && (
        <p className={note.kind === 'ok' ? 'ase-note ase-note--ok' : 'ase-note ase-note--err'}>
          {note.text}
        </p>
      )}

      <div className="ase-actions">
        <button className="btn btn--amber" type="submit" disabled={busy}>
          {busy ? '…' : 'Enregistrer'}
        </button>
        <a className="btn btn--outline" href={`/artistes/${slug}`}>
          Voir ma page
        </a>
        <button type="button" className="btn btn--ghost ase-logout" onClick={logout}>
          Se déconnecter
        </button>
      </div>
    </form>
  );
}
