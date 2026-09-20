#!/usr/bin/env node
// npm run test:e2e — parcours complet sur un banc 100 % local : Postgres réel (jetable) + PostgREST + faux
// GoTrue / Stripe / Resend + l'app Next.js en `next dev` (port 3130). N'écrit RIEN sur ta vraie base.
// Prérequis : binaire PostgREST (voir tests/e2e/README.md). Environ 3 minutes.
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const bin = process.env.POSTGREST_BIN || path.join(HERE, '.bin', 'postgrest');
if (!fs.existsSync(bin)) { console.error(`Binaire PostgREST introuvable (${bin}). Voir tests/e2e/README.md.`); process.exit(2); }
const ready = path.join(HERE, 'READY');
fs.rmSync(ready, { force: true });
const infra = spawn('node', [path.join(HERE, 'infra.mjs')], { stdio: ['ignore', 'inherit', 'inherit'] });
const stop = () => { try { infra.kill('SIGTERM'); } catch {} };
process.on('exit', stop); process.on('SIGINT', () => { stop(); process.exit(130); });
for (let i = 0; i < 180 && !fs.existsSync(ready); i++) await new Promise((r) => setTimeout(r, 2000));
if (!fs.existsSync(ready)) { console.error('Le banc n’a pas démarré à temps.'); stop(); process.exit(1); }
let failed = false;
for (const s of ['s3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11']) {
  console.log(`\n### ${s}`);
  const r = spawnSync('node', [path.join(HERE, s + '.mjs')], { encoding: 'utf8' });
  const lines = (r.stdout || '').split('\n').filter((l) => /^FAIL|ALL OK|ÉCHEC/.test(l));
  console.log(lines.join('\n') || (r.stderr || '').slice(-500));
  if (r.status !== 0) failed = true;
}
stop();
console.log(failed ? '\nRÉSULTAT : ÉCHEC' : '\nRÉSULTAT : TOUT PASSE');
process.exit(failed ? 1 : 0);
