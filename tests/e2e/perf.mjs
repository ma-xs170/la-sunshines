// Mesures Lighthouse (perf / CLS / TTI) sur des pages représentatives de /admin et /organisateur.
// Prérequis : infra.mjs lancé, données semées (s9.mjs), puis perf-serve.mjs (serveur de PRODUCTION sur le port 3130).
// Usage : OUT=docs/perf/lighthouse-avant.json node tests/e2e/perf.mjs
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import fs from 'fs';
import * as L from './lib.mjs';

const A = 'la-nuit-des-ombres';
console.log('[perf] connexion admin (supabase)...');
const admin = await L.as(L.USERS.admin);   // compte admin (mot de passe historique) : voir /api/admin/login
console.log('[perf] connexion staff (supabase)...');
const staff = await L.as(L.USERS.staff);   // owner de THE MOUV

// connexion admin : mot de passe simple (pas Supabase), cookie posé via /api/admin/login
console.log('[perf] connexion admin (mot de passe)...');
const adminLogin = await admin.req('/api/admin/login', { method: 'POST', body: { password: process.env.ADMIN_PASSWORD || 'e2e-admin' } });
if (adminLogin.status !== 200) throw new Error('admin login KO ' + JSON.stringify(adminLogin.data));
console.log('[perf] connexions OK, lancement de Chrome...');

const PAGES = [
  { name: 'organisateur-evenements', path: '/organisateur/evenements', cookie: staff.cookieHeader() },
  { name: 'organisateur-evenement-dashboard', path: `/organisateur/evenements/${A}`, cookie: staff.cookieHeader() },
  { name: 'admin-organisateurs', path: '/admin/gestion/organisateurs', cookie: admin.cookieHeader() },
  { name: 'admin-commandes', path: '/admin/billetterie/commandes', cookie: admin.cookieHeader() },
];

const chrome = await launch({
  chromePath: process.env.CHROME_PATH,
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
});
const results = {};
for (const p of PAGES) {
  const { lhr } = await lighthouse(`http://localhost:3130${p.path}`, {
    port: chrome.port, output: 'json', onlyCategories: ['performance'],
    extraHeaders: { Cookie: p.cookie },
    formFactor: 'desktop',
    screenEmulation: { disabled: true },
    throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 },
  });
  results[p.name] = {
    path: p.path,
    performance: Math.round(lhr.categories.performance.score * 100),
    fcp: lhr.audits['first-contentful-paint'].numericValue,
    lcp: lhr.audits['largest-contentful-paint'].numericValue,
    tbt: lhr.audits['total-blocking-time'].numericValue,
    cls: lhr.audits['cumulative-layout-shift'].numericValue,
    tti: lhr.audits['interactive']?.numericValue ?? null,
    speedIndex: lhr.audits['speed-index'].numericValue,
  };
  console.log(p.name, results[p.name]);
}
await chrome.kill();
fs.writeFileSync(process.env.OUT || 'docs/perf/lighthouse.json', JSON.stringify(results, null, 2));
