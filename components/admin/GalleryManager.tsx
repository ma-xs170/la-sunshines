'use client';

import { useState } from 'react';
import { analyzeImageFile } from '@/lib/clientColor';
import Icon from '@/components/Icon';

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, ...data } as {
    ok: boolean;
    gallery?: string[];
    error?: string;
    deployed?: boolean;
  };
}

// Galerie photo d'UN événement (branchée sur /api/admin/gallery/[slug]).
export default function GalleryManager({
  slug,
  initial,
  flash,
}: {
  slug: string;
  initial: string[];
  flash: (t: string, saved?: boolean) => void;
}) {
  const [photos, setPhotos] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);

  async function add(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const images: string[] = [];
      for (const file of Array.from(files)) {
        try {
          images.push((await analyzeImageFile(file)).dataUrl);
        } catch {
          /* image ignorée */
        }
      }
      if (images.length === 0) return flash('Aucune image lisible.');
      const res = await api(`/api/admin/gallery/${slug}`, 'PATCH', { images });
      if (!res.ok || !res.gallery) return flash(res.error ?? 'Échec.');
      setPhotos(res.gallery);
      flash(`${images.length} photo(s) ajoutée(s).`, res.deployed);
    } finally {
      setBusy(false);
    }
  }

  async function removeAt(i: number) {
    if (!window.confirm('Retirer cette photo ?')) return;
    const res = await api(`/api/admin/gallery/${slug}`, 'DELETE', { index: i });
    if (!res.ok) return flash(res.error ?? 'Échec.');
    setPhotos(res.gallery ?? []);
    flash('Photo retirée.', res.deployed);
  }

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    setPhotos(next); // optimiste
    const res = await api(`/api/admin/gallery/${slug}`, 'PATCH', { order: next });
    if (!res.ok) {
      setPhotos(photos); // rollback
      return flash(res.error ?? 'Réorganisation impossible.');
    }
    setPhotos(res.gallery ?? next);
    flash('Ordre mis à jour.', res.deployed);
  }

  return (
    <div className="gm">
      <div className="gm__head">
        <h3>Galerie photo · {photos.length}</h3>
        <label className="btn btn--outline gm__add">
          <Icon name="sparkles" />
          <span>{busy ? 'Ajout…' : 'Ajouter des photos'}</span>
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            hidden
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {photos.length === 0 ? (
        <p className="admin-list__empty">
          Aucune photo. Elles alimentent la section GALERIE de la page événement.
        </p>
      ) : (
        <ul className="gm__grid">
          {photos.map((src, i) => (
            <li className="gm__item" key={`${i}-${src.slice(-24)}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" />
              <div className="gm__actions">
                <button
                  type="button"
                  aria-label="Déplacer à gauche"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <Icon name="chevron-left" />
                </button>
                <button
                  type="button"
                  aria-label="Déplacer à droite"
                  disabled={i === photos.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <Icon name="chevron-right" />
                </button>
                <button
                  type="button"
                  className="gm__del"
                  aria-label="Retirer"
                  onClick={() => removeAt(i)}
                >
                  <Icon name="close" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
