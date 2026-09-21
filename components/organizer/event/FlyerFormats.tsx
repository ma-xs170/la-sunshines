'use client';

import { useEffect, useRef, useState } from 'react';

const FORMATS = [{ id: 'story', label: 'Story', w: 1080, h: 1920 }, { id: 'square', label: 'Carré', w: 1080, h: 1080 }, { id: 'banner', label: 'Bannière', w: 1200, h: 630 }] as const;

/** Décliner le flyer : formats prêts à poster, cadrage et zoom manuels, aperçu, téléchargement PNG. Rendu 100 % dans le navigateur. */
export default function FlyerFormats({ src, name }: { src: string; name: string }) {
  const [fmt, setFmt] = useState<(typeof FORMATS)[number]>(FORMATS[0]);
  const [zoom, setZoom] = useState(1); const [dx, setDx] = useState(0); const [dy, setDy] = useState(0);
  const [img, setImg] = useState<HTMLImageElement | null>(null); const [err, setErr] = useState('');
  const cv = useRef<HTMLCanvasElement>(null);

  useEffect(() => { const i = new Image(); i.onload = () => setImg(i); i.onerror = () => setErr('Affiche introuvable.'); i.src = src; }, [src]);
  useEffect(() => {
    const c = cv.current; if (!c || !img) return;
    c.width = fmt.w; c.height = fmt.h; const g = c.getContext('2d'); if (!g) return;
    // fond : l'affiche elle-même, agrandie et floutée ; premier plan : l'affiche entière (jamais rognée par défaut), zoom et décalage réglables
    const cover = Math.max(fmt.w / img.width, fmt.h / img.height);
    g.filter = 'blur(40px) brightness(.7)'; g.drawImage(img, (fmt.w - img.width * cover) / 2, (fmt.h - img.height * cover) / 2, img.width * cover, img.height * cover); g.filter = 'none';
    const fit = Math.min(fmt.w / img.width, fmt.h / img.height) * zoom; const w = img.width * fit, h = img.height * fit;
    g.drawImage(img, (fmt.w - w) / 2 + dx * fmt.w, (fmt.h - h) / 2 + dy * fmt.h, w, h);
  }, [img, fmt, zoom, dx, dy]);

  const download = () => cv.current?.toBlob((b) => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${name}-${fmt.id}.png`; a.click(); URL.revokeObjectURL(a.href); }, 'image/png');
  if (err) return <p className="ef-err" role="alert">{err}</p>;
  return (
    <div className="ef">
      <section className="glass ef-card"><h2>Formats prêts à poster</h2>
        <div className="ef-row" role="group" aria-label="Format">{FORMATS.map((f) => <button key={f.id} type="button" className={'filter' + (f.id === fmt.id ? ' is-active' : '')} aria-pressed={f.id === fmt.id} onClick={() => { setFmt(f); setZoom(1); setDx(0); setDy(0); }}>{f.label} · {f.w}×{f.h}</button>)}</div>
        <canvas ref={cv} className="ef-canvas" aria-label={`Aperçu ${fmt.label}`} style={{ aspectRatio: `${fmt.w} / ${fmt.h}` }} />
        <div className="ef-grid">
          <div className="ef-field"><label htmlFor="f-z">Zoom</label><input id="f-z" type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></div>
          <div className="ef-field"><label htmlFor="f-x">Position horizontale</label><input id="f-x" type="range" min={-0.5} max={0.5} step={0.01} value={dx} onChange={(e) => setDx(Number(e.target.value))} /></div>
          <div className="ef-field"><label htmlFor="f-y">Position verticale</label><input id="f-y" type="range" min={-0.5} max={0.5} step={0.01} value={dy} onChange={(e) => setDy(Number(e.target.value))} /></div>
        </div>
        <button type="button" className="btn btn--amber" onClick={download} disabled={!img}>Télécharger en PNG</button>
      </section>
    </div>
  );
}
