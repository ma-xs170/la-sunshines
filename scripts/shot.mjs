// Capture d'écran de contrôle : node scripts/shot.mjs <url> <fichier.png> [largeur]
import { chromium } from 'playwright';

const [, , url, out, widthArg] = process.argv;
if (!url || !out) {
  console.error('usage: node scripts/shot.mjs <url> <out.png> [width]');
  process.exit(1);
}
const width = Number(widthArg) || 1280;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 } });
await page.goto(url, { waitUntil: 'networkidle' });
// déclenche les révélations au scroll (IntersectionObserver)
// le filet de sécurité de SiteEffects retire l'état "caché" passé 3 s
await page.waitForTimeout(3600);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('->', out);
