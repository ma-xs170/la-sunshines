// Bascule le banc e2e (déjà lancé : `node tests/e2e/infra.mjs`, puis un scénario qui sème les données, ex. s9) sur un serveur de PRODUCTION :
// `next build` + `next start` sur le port 3130, mêmes faux services et même base jetable. Sert aux mesures (perf.mjs) : le mode dev n'a aucune valeur pour la vitesse.
// Écrit la table de build dans OUT (défaut docs/perf/bundle.txt).  Usage : OUT=docs/perf/bundle-apres.txt node tests/e2e/perf-serve.mjs
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..', '..');
const env = { ...process.env, ...JSON.parse(fs.readFileSync(path.join(HERE, 'env.json'), 'utf8')), NEXT_DIST_DIR: '.next-perf' };
try { execSync('kill $(lsof -ti :3130)', { stdio: 'ignore' }); } catch {}
await new Promise((r) => setTimeout(r, 1500));
let out = '';
const build = spawn('npx', ['next', 'build'], { cwd: ROOT, env });
build.stdout.on('data', (d) => { out += d; }); build.stderr.on('data', (d) => { out += d; });
if (await new Promise((r) => build.on('close', r))) { console.error(out.slice(-3000)); process.exit(1); }
const table = out.slice(out.indexOf('Route (app)')).split('\n').filter((l) => !/\/api\//.test(l)).join('\n');
fs.writeFileSync(path.resolve(ROOT, process.env.OUT || 'docs/perf/bundle.txt'), table);
spawn('npx', ['next', 'start', '-p', '3130'], { cwd: ROOT, env, stdio: 'ignore', detached: true }).unref();
for (let i = 0; i < 60; i++) { try { const r = await fetch('http://localhost:3130/api/status'); if (r.status < 500) break; } catch {} await new Promise((r) => setTimeout(r, 1000)); }
console.log('serveur de production prêt sur 3130');
