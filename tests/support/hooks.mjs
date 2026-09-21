import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const tryExt = (base) => ['', '.ts', '.tsx', '/index.ts'].map((e) => base + e).find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
export async function resolve(spec, ctx, next) {
  let base = null;
  if (spec.startsWith('@/')) base = ROOT + spec.slice(2);
  else if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL?.startsWith('file:') && /\.tsx?$/.test(ctx.parentURL)) base = fileURLToPath(new URL(spec, ctx.parentURL));
  if (base) { const hit = tryExt(base); if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true }; }
  return next(spec, ctx);
}
