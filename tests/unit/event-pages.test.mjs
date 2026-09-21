// npm run test:unit — dresscode par couleurs, réseaux sociaux, règles vidéo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, suggest, parseLegacy, normalizeDresscode, dresscodeText, readableOn, fold } from '../../lib/dresscodeColors.ts';
import { normalizeSocial } from '../../lib/socialLinks.ts';
import { decideVideoPlan, acceptVideoFile, VIDEO_CONFIG } from '../../lib/videoRules.ts';

test('dresscode : autocomplétion insensible aux accents et à la casse', () => {
  assert.equal(suggest('bor')[0].name, 'Bordeaux');
  assert.equal(suggest('DORE')[0].name, 'Doré');
  assert.equal(suggest('marine')[0].name, 'Bleu marine');
  assert.deepEqual(suggest('bor', [PALETTE.find((c) => c.name === 'Bordeaux')]), []);
  assert.deepEqual(suggest(''), []);
});

test('dresscode : migration douce des textes existants', () => {
  assert.deepEqual(parseLegacy('Dresscode Bleu ou Noir').colors.map((c) => c.name), ['Bleu', 'Noir']);
  assert.deepEqual(parseLegacy('Dresscode Vert ou Rouge').colors.map((c) => c.name), ['Vert', 'Rouge']);
  assert.deepEqual(parseLegacy('White & Pink').colors.map((c) => c.name), ['Blanc', 'Rose']);
  assert.deepEqual(parseLegacy('Turquoise & Or').colors.map((c) => c.name), ['Turquoise', 'Doré']);
  assert.deepEqual(parseLegacy('bleu marine').colors.map((c) => c.name), ['Bleu marine']);
  assert.deepEqual(parseLegacy('Dresscode libre'), { colors: [], free: true, note: '' });
  const other = parseLegacy('Tenue de soirée élégante');
  assert.deepEqual([other.colors.length, other.free, other.note], [0, false, 'Tenue de soirée élégante']);
  assert.deepEqual(parseLegacy(''), { colors: [], free: false, note: '' });
});

test('dresscode : normalisation serveur (hex de la palette, « libre » exclusif, précision nettoyée)', () => {
  const v = normalizeDresscode({ colors: [{ name: 'bordeaux', hex: '#000000' }, { name: 'Bordeaux', hex: '#1' }, { name: 'Inconnue', hex: '#fff' }], free: false, note: ' <b>Total look</b> ' });
  assert.deepEqual(v.colors, [PALETTE.find((c) => c.name === 'Bordeaux')]);
  assert.equal(v.note, 'bTotal look/b');
  assert.deepEqual(normalizeDresscode({ colors: [{ name: 'Noir' }], free: true }).colors, []);
  assert.equal(normalizeDresscode(null).free, false);
  assert.equal(normalizeDresscode({ note: 'x'.repeat(500) }).note.length, 140);
  assert.equal(dresscodeText({ colors: [PALETTE[3], PALETTE[1]], free: false, note: 'Total look' }), 'Bordeaux, Noir · Total look');
  assert.equal(dresscodeText({ colors: [], free: true, note: '' }), 'Tenue libre');
});

test('dresscode : contraste lisible', () => {
  assert.equal(readableOn('#F6F4EF'), '#161616');
  assert.equal(readableOn('#161616'), '#FFFFFF');
  assert.equal(readableOn('#1B2A5C'), '#FFFFFF');
  assert.equal(fold('  Doré  Clair '), 'dore clair');
});

test('réseaux : pseudo, @pseudo et URL acceptés ; domaines et schémas dangereux refusés', () => {
  assert.equal(normalizeSocial('instagram', 'sunshines.fwi'), 'https://www.instagram.com/sunshines.fwi');
  assert.equal(normalizeSocial('instagram', '@sunshines.fwi'), 'https://www.instagram.com/sunshines.fwi');
  assert.equal(normalizeSocial('tiktok', '@sunshines.fwi'), 'https://www.tiktok.com/@sunshines.fwi');
  assert.equal(normalizeSocial('instagram', 'https://instagram.com/sunshines.fwi/?igsh=1#x'), 'https://instagram.com/sunshines.fwi/?igsh=1');
  assert.equal(normalizeSocial('instagram', 'www.instagram.com/abc'), 'https://www.instagram.com/abc');
  assert.equal(normalizeSocial('instagram', 'https://evil.com/instagram.com'), null);
  assert.equal(normalizeSocial('instagram', 'javascript:alert(1)'), null);
  assert.equal(normalizeSocial('facebook', 'data:text/html,x'), null);
  assert.equal(normalizeSocial('whatsapp', '+590 690 12 34 56'), 'https://wa.me/590690123456');
  assert.equal(normalizeSocial('whatsapp', 'abc'), null);
  assert.equal(normalizeSocial('youtube', ''), '');
  assert.equal(normalizeSocial('snapchat', 'a b'), null);
});

const probe = { width: 1920, height: 1080, fps: 30, codec: 'h264', seconds: 20, bytes: 20e6, hasAudio: true };
test('vidéo : source conforme = simple optimisation, pas de ré-encodage', () => {
  const p = decideVideoPlan(probe);
  assert.equal(p.ok && p.action, 'optimize');
  assert.equal(p.hevc, null);
  assert.equal(decideVideoPlan({ ...probe, fps: 60 }).action, 'optimize');
  assert.equal(decideVideoPlan({ ...probe, width: 1080, height: 1920 }).action, 'optimize');   // portrait 1080×1920 : dans les limites
});
test('vidéo : 4K ou > 60 i/s → HEVC plafonné 1080p / 60 i/s, tag hvc1, faststart', () => {
  const p = decideVideoPlan({ ...probe, width: 3840, height: 2160, fps: 60 });
  assert.equal(p.action, 'transcode-hevc');
  const a = p.hevc.args.join(' ');
  assert.match(a, /libx265/); assert.match(a, /-tag:v hvc1/); assert.match(a, /yuv420p/); assert.match(a, /\+faststart/); assert.match(a, /-r 60/);
  assert.equal(p.hevc.maxWidth, 1920); assert.equal(p.hevc.maxHeight, 1080);
  const fast = decideVideoPlan({ ...probe, fps: 120 });
  assert.equal(fast.action, 'transcode-hevc'); assert.equal(fast.hevc.fps, 60);
  assert.equal(decideVideoPlan({ ...probe, width: 2160, height: 3840 }).action, 'transcode-hevc');   // 4K portrait
  assert.match(decideVideoPlan({ ...probe, hasAudio: false, fps: 90 }).hevc.args.join(' '), /-an/);
});
test('vidéo : repli H.264 léger (30 i/s max) toujours prévu', () => {
  const p = decideVideoPlan({ ...probe, fps: 60 });
  assert.equal(p.fallbackH264.fps, 30);
  assert.match(p.fallbackH264.args.join(' '), /libx264/);
});
test('vidéo : limites de taille, durée, format', () => {
  assert.equal(decideVideoPlan({ ...probe, bytes: VIDEO_CONFIG.maxBytes + 1 }).ok, false);
  assert.equal(decideVideoPlan({ ...probe, seconds: 46 }).ok, false);
  assert.equal(decideVideoPlan({ ...probe, width: 0 }).ok, false);
  assert.equal(acceptVideoFile('a.mp4', 'video/mp4', 1e6), null);
  assert.equal(acceptVideoFile('a.mov', 'video/quicktime', 1e6), null);
  assert.ok(acceptVideoFile('a.avi', 'video/x-msvideo', 1e6));
  assert.ok(acceptVideoFile('a.mp4.exe', 'video/mp4', 1e6));
  assert.ok(acceptVideoFile('a.mp4', 'video/mp4', 400e6));
});

import { buildDetailsPatch, venueSchema, sessionSchema, mapsLink } from '../../lib/organizer/event-pages.ts';
test('détails : réseaux normalisés, dresscode nettoyé, champs inconnus refusés', () => {
  const r = buildDetailsPatch({ subtitle: ' Nuit ', socials: { instagram: '@sun', tiktok: '' }, dresscode: { colors: [{ name: 'noir', hex: 'x' }], free: false, note: '' } });
  assert.deepEqual(r.patch.socials, { instagram: 'https://www.instagram.com/sun' });
  assert.equal(r.patch.subtitle, 'Nuit');
  assert.equal(r.patch.dresscode.colors[0].hex, '#161616');
  assert.ok(buildDetailsPatch({ updated_by: 'x' }).error);
  assert.match(buildDetailsPatch({ socials: { instagram: 'https://evil.com/x' } }).error, /Instagram/);
  assert.match(buildDetailsPatch({ socials: { myspace: 'x' } }).error, /inconnu/);
  assert.match(buildDetailsPatch({ contact_email: 'nope' }).error, /e-mail/);
  assert.match(buildDetailsPatch({ publish_mode: 'later', publish_at: null }).error, /date/i);
  assert.equal(buildDetailsPatch({ publish_mode: 'now', publish_at: '2026-10-01T10:00:00Z' }).patch.publish_at, null);
  assert.ok(buildDetailsPatch({ form_questions: [{ id: 'q1', label: 'Choix', type: 'choice', required: true, options: ['a'] }] }).error);
  assert.ok(buildDetailsPatch({ form_questions: [{ id: 'q1', label: 'Nom du responsable', type: 'text', required: true }] }).patch);
});
test('lieux et sessions : région obligatoire, fin après début', () => {
  const v = { org: '00000000-0000-4000-8000-000000000001', name: 'W CLUB', address: '', postal_code: '', city: 'Jarry', country: 'France', region: 'guadeloupe', lat: 16.2, lng: -61.5, hide_address: false };
  assert.ok(venueSchema.safeParse(v).success);
  assert.ok(!venueSchema.safeParse({ ...v, region: 'mars' }).success);
  assert.ok(!venueSchema.safeParse({ ...v, lat: 200 }).success);
  const s = { venue_id: null, label: '', starts_at: '2026-10-17T22:00:00Z', ends_at: '2026-10-18T04:00:00Z', capacity: null };
  assert.ok(sessionSchema.safeParse(s).success);
  assert.ok(!sessionSchema.safeParse({ ...s, ends_at: '2026-10-17T20:00:00Z' }).success);
  assert.match(mapsLink({ lat: 16.2, lng: -61.5 }), /query=16.2,-61.5/);
  assert.match(mapsLink({ name: 'W CLUB', city: 'Jarry' }), /W%20CLUB%20Jarry/);
  assert.equal(mapsLink({}), null);
});
