'use client';

import { useEffect, useRef, useState } from 'react';

// Vidéo du flyer : lecture automatique, muette, en boucle, sans coût inutile.
// Une seule vidéo joue à la fois, pause hors écran, image d'aperçu seule si l'utilisateur réduit les animations ou économise les données.
let current: HTMLVideoElement | null = null;

export default function FlyerVideo({ hevc, h264, poster, alt }: { hevc: string | null; h264: string | null; poster: string | null; alt: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || conn?.saveData) { setStill(true); return; }
    const v = ref.current; if (!v) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { if (current && current !== v) current.pause(); current = v; v.play().catch(() => { /* lecture refusée : l'aperçu reste affiché */ }); }
      else { v.pause(); if (current === v) current = null; }
    }, { threshold: 0.4 });
    io.observe(v);
    return () => { io.disconnect(); if (current === v) current = null; };
  }, []);

  if (still && poster) return <img className="event-flyer__img" src={poster} alt={alt} />;
  return (
    <video ref={ref} className="event-flyer__video" muted loop playsInline preload="none" poster={poster ?? undefined} aria-label={alt}>
      {hevc && <source src={hevc} type='video/mp4; codecs="hvc1"' />}
      {h264 && <source src={h264} type='video/mp4; codecs="avc1.640028"' />}
    </video>
  );
}
