// Capture /admin après connexion : node scripts/shot-admin.mjs <base> <pass> <out.png>
import { chromium } from 'playwright';

const [, , base, pass, out] = process.argv;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${base}/admin`, { waitUntil: 'networkidle' });
await page.fill('input[type="password"]', pass);
await page.click('button[type="submit"]');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('->', out);
