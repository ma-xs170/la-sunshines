// Phases 1 & 3 — analyse chromatique de chaque flyer.
//
// Analyse tous les JPG de public/images/editions/ dans un vrai Chromium (via
// Playwright, déjà présent en devDependencies) et écrit dans
// lib/flyerColors.generated.ts :
//   - FLYER_COLORS   : slug -> #rrggbb   (couleur dominante, Phase 1, emoji de repli)
//   - FLYER_PALETTES : slug -> [#rrggbb] (3 teintes dominantes distinctes, Phase 3, dégradés)
//
//   npm run colors
//
// Le slug est le nom de fichier sans extension : il doit correspondre au `slug`
// de l'édition dans lib/editions.ts.

import { chromium } from 'playwright';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flyerDir = path.join(root, 'public', 'images', 'editions');
const outFile = path.join(root, 'lib', 'flyerColors.generated.ts');

// Analyse pixel exécutée dans la page. Renvoie { dominant, palette }.
function analyzeInPage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('image decode failed'));
    img.onload = () => {
      const W = 160;
      const H = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * W));
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, W, H);
      const { data } = ctx.getImageData(0, 0, W, H);

      const buckets = new Map(); // clé quantifiée -> { w, r, g, b, n }
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 200) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        // On garde tout le monde mais on privilégie les pixels colorés.
        const weight = 0.25 + sat;

        const key =
          (r >> 4 << 8) | (g >> 4 << 4) | (b >> 4); // 12 bits, buckets de 16
        let e = buckets.get(key);
        if (!e) {
          e = { w: 0, r: 0, g: 0, b: 0, n: 0 };
          buckets.set(key, e);
        }
        e.w += weight;
        e.r += r * weight;
        e.g += g * weight;
        e.b += b * weight;
        e.n += 1;
      }

      const to2 = (v) => Math.round(v).toString(16).padStart(2, '0');
      const hexOf = (e) => '#' + to2(e.r / e.w) + to2(e.g / e.w) + to2(e.b / e.w);
      const rgbOf = (e) => [e.r / e.w, e.g / e.w, e.b / e.w];
      const dist = (a, b) =>
        Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

      const sorted = [...buckets.values()].sort((a, b) => b.w - a.w);
      if (sorted.length === 0) return resolve({ dominant: '#808080', palette: ['#808080'] });

      // palette : les plus lourds, en écartant les teintes trop proches
      const palette = [];
      for (const e of sorted) {
        const rgb = rgbOf(e);
        if (palette.every((p) => dist(p.rgb, rgb) > 60)) {
          palette.push({ rgb, hex: hexOf(e) });
          if (palette.length === 3) break;
        }
      }

      resolve({
        dominant: hexOf(sorted[0]),
        palette: palette.map((p) => p.hex),
      });
    };
    img.src = dataUrl;
  });
}

const IMG_RE = /\.(jpe?g|png|webp)$/i;

async function main() {
  const files = (await readdir(flyerDir)).filter((f) => IMG_RE.test(f)).sort();
  if (files.length === 0) {
    console.error('Aucun flyer trouvé dans', flyerDir);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><meta charset="utf-8">');

  const colors = {};
  const palettes = {};
  for (const file of files) {
    const slug = file.replace(IMG_RE, '');
    const buf = await readFile(path.join(flyerDir, file));
    const mime = file.toLowerCase().endsWith('.png')
      ? 'image/png'
      : file.toLowerCase().endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
    const { dominant, palette } = await page.evaluate(analyzeInPage, dataUrl);
    colors[slug] = dominant;
    palettes[slug] = palette;
    console.log(`  ${slug.padEnd(28)} ${dominant}   [${palette.join(' ')}]`);
  }

  await browser.close();

  const colorEntries = Object.entries(colors)
    .map(([slug, hex]) => `  '${slug}': '${hex}',`)
    .join('\n');
  const paletteEntries = Object.entries(palettes)
    .map(([slug, arr]) => `  '${slug}': [${arr.map((h) => `'${h}'`).join(', ')}],`)
    .join('\n');

  const banner =
    '// GÉNÉRÉ par scripts/extract-flyer-colors.mjs — ne pas éditer à la main.\n' +
    `// Régénérer : npm run colors  (dernière passe : ${new Date().toISOString()})\n\n`;

  await writeFile(
    outFile,
    `${banner}` +
      `export const FLYER_COLORS: Record<string, string> = {\n${colorEntries}\n};\n\n` +
      `export const FLYER_PALETTES: Record<string, string[]> = {\n${paletteEntries}\n};\n`,
    'utf8',
  );

  console.log(`\n✓ ${outFile.replace(root + path.sep, '')} (${files.length} flyers)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
