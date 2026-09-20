// Ressources du billet PDF : polices du site (mêmes fichiers que sur le web), logo, flyer réduit. SERVEUR UNIQUEMENT.
//
// Les polices vivent dans assets/fonts (Unbounded 800 pour les titres, Caveat 700 pour les accroches, Inter pour le
// texte : celles du site, licence OFL). Elles sont incluses dans les fonctions serverless via
// outputFileTracingIncludes (next.config.mjs).

import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { Font } from '@react-pdf/renderer';
import { getAllEditions } from '@/lib/content';

const ROOT = process.cwd();
const FONT_DIR = path.join(ROOT, 'assets', 'fonts');

let fontsReady = false;
export function registerPdfFonts(): void {
  if (fontsReady) return;
  Font.register({ family: 'Unbounded', src: path.join(FONT_DIR, 'unbounded-latin-800-normal.woff'), fontWeight: 800 });
  Font.register({ family: 'Caveat', src: path.join(FONT_DIR, 'caveat-latin-700-normal.woff'), fontWeight: 700 });
  Font.register({
    family: 'Inter',
    fonts: [
      { src: path.join(FONT_DIR, 'inter-latin-400-normal.woff'), fontWeight: 400 },
      { src: path.join(FONT_DIR, 'inter-latin-600-normal.woff'), fontWeight: 600 },
      { src: path.join(FONT_DIR, 'inter-latin-700-normal.woff'), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]); // jamais de coupure de mot au milieu d'un nom
  fontsReady = true;
}

const cache = new Map<string, Buffer | null>();

/** Logo « La Sunshines » (version encre, celui de la barre de navigation), réduit. */
export async function logoPng(): Promise<Buffer> {
  const hit = cache.get('logo');
  if (hit) return hit;
  const buf = await sharp(path.join(ROOT, 'public', 'images', 'logo-dark.png')).resize({ width: 520 }).png({ compressionLevel: 9, palette: true }).toBuffer();
  cache.set('logo', buf);
  return buf;
}

/**
 * Flyer de l'événement converti en JPEG et réduit (le PDF reste léger). Sources : fichier du site (/images/…)
 * ou image envoyée depuis l'admin (data URL). null si l'événement n'a pas de flyer ou s'il est illisible.
 */
export async function flyerJpeg(slug: string): Promise<{ data: Buffer; width: number; height: number } | null> {
  const key = `flyer:${slug}`;
  try {
    const ed = getAllEditions({ includeHidden: true }).find((e) => e.slug === slug);
    const src = ed?.flyer;
    if (!src) return null;
    let input: Buffer;
    if (src.startsWith('data:')) {
      const m = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(src);
      if (!m) return null;
      input = Buffer.from(m[1], 'base64');
    } else if (src.startsWith('/') && !src.includes('..')) {
      input = await fs.readFile(path.join(ROOT, 'public', src));
    } else {
      return null;
    }
    const { data, info } = await sharp(input).rotate().resize({ width: 520, withoutEnlargement: true })
      .flatten({ background: '#FFF8EE' }).jpeg({ quality: 68, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    cache.set(key, data);
    return { data, width: info.width, height: info.height };
  } catch (e) {
    console.error('[pdf] flyer illisible pour', slug, e instanceof Error ? e.message : e);
    return null;
  }
}
