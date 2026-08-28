'use client';

// Phase 6 — analyse chromatique d'une image choisie dans le formulaire admin.
// Même logique que scripts/extract-flyer-colors.mjs, exécutée dans le navigateur.
// Renvoie aussi une version redimensionnée/compressée de l'image (data URL JPEG)
// pour ne pas stocker des méga-octets dans content.json.

export interface ImageAnalysis {
  /** data URL JPEG redimensionnée (max 1080 px de large). */
  dataUrl: string;
  dominant: string;
  palette: string[];
  /** dimensions NATURELLES de l'image d'origine (pour l'aspect-ratio d'affichage). */
  width: number;
  height: number;
}

function to2(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
}

export function analyzeImageFile(file: File): Promise<ImageAnalysis> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible"));
    };
    img.onload = () => {
      URL.revokeObjectURL(url);

      const natW = img.naturalWidth;
      const natH = img.naturalHeight;

      // --- version stockée (redimensionnée) ---
      const maxW = 1080;
      const scale = Math.min(1, maxW / img.naturalWidth);
      const sw = Math.round(img.naturalWidth * scale);
      const sh = Math.round(img.naturalHeight * scale);
      const store = document.createElement('canvas');
      store.width = sw;
      store.height = sh;
      store.getContext('2d')!.drawImage(img, 0, 0, sw, sh);
      const dataUrl = store.toDataURL('image/jpeg', 0.82);

      // --- échantillon d'analyse (petit) ---
      const W = 160;
      const H = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * W));
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, W, H);
      const { data } = ctx.getImageData(0, 0, W, H);

      const buckets = new Map<number, { w: number; r: number; g: number; b: number }>();
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 200) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const weight = 0.25 + sat;
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const e = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0 };
        e.w += weight;
        e.r += r * weight;
        e.g += g * weight;
        e.b += b * weight;
        buckets.set(key, e);
      }

      const sorted = [...buckets.values()].sort((a, b) => b.w - a.w);
      if (sorted.length === 0) {
        resolve({
          dataUrl,
          dominant: '#808080',
          palette: ['#808080'],
          width: natW,
          height: natH,
        });
        return;
      }
      const hexOf = (e: { w: number; r: number; g: number; b: number }) =>
        `#${to2(e.r / e.w)}${to2(e.g / e.w)}${to2(e.b / e.w)}`;
      const rgbOf = (e: { w: number; r: number; g: number; b: number }) =>
        [e.r / e.w, e.g / e.w, e.b / e.w] as [number, number, number];
      const dist = (a: number[], b: number[]) =>
        Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

      const palette: { rgb: [number, number, number]; hex: string }[] = [];
      for (const e of sorted) {
        const rgb = rgbOf(e);
        if (palette.every((p) => dist(p.rgb, rgb) > 60)) {
          palette.push({ rgb, hex: hexOf(e) });
          if (palette.length === 3) break;
        }
      }

      resolve({
        dataUrl,
        dominant: hexOf(sorted[0]),
        palette: palette.map((p) => p.hex),
        width: natW,
        height: natH,
      });
    };
    img.src = url;
  });
}
