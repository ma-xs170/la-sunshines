// Données privées des artistes / abonnés : Supabase (tables privées), JAMAIS data/content.json (dépôt public).
// Parcours : abonnement, notification (une seule fois), désabonnement, email d'artiste, lien de connexion à usage
// unique (hash seul en base), refus d'une demande de vérification. Le fichier de contenu est restauré à la fin.
import fs from 'fs';
import crypto from 'crypto';
import * as L from './lib.mjs';
const { ok, section, q, one } = L;

const FILE = new URL('../../data/content.json', import.meta.url);
const original = fs.readFileSync(FILE, 'utf8');
const mails = async () => (await L.mailState()).sent;
// les emails partent en arrière-plan (sans attendre la réponse HTTP) : on patiente jusqu'à 5 s
const waitMail = async (pred) => { for (let i = 0; i < 25; i++) { const m = (await mails()).find(pred); if (m) return m; await new Promise((r) => setTimeout(r, 200)); } return undefined; };
const hasAt = (t) => /[\w.+-]+@[\w-]+\.[\w.]+/.test(t);
const SLUG = 'dreezy', ARTIST_ID = JSON.parse(original).artists.find((a) => a.slug === SLUG).id;

try {
  ok(!hasAt(original), 'point de départ : content.json ne contient aucun email');
  await q(`truncate public.artist_emails, public.artist_subscriptions, public.artist_notifications, public.artist_login_tokens, public.artist_verifications`);
  await L.resetMocks();
  const anon = new L.Client(), admin = new L.Client();
  ok((await admin.req('/api/admin/login', { method: 'POST', body: { password: 'e2e-admin' } })).status === 200, 'connexion admin');

  section('Abonnement');
  let r = await anon.req('/api/artists/subscribe', { method: 'POST', body: { slug: SLUG, email: 'Fan@Test.Local', consent: false } });
  ok(r.status === 400, `sans consentement → 400 (${r.status})`);
  r = await anon.req('/api/artists/subscribe', { method: 'POST', body: { slug: 'inconnu-xyz', email: 'fan@test.local', consent: true } });
  ok(r.status === 404, `artiste inconnu → 404 (${r.status})`);
  r = await anon.req('/api/artists/subscribe', { method: 'POST', body: { slug: SLUG, email: 'Fan@Test.Local', consent: true } });
  ok(r.status === 200 && r.data.ok && !r.data.already, `abonnement → 200 (${r.status})`);
  const sub = await one(`select * from public.artist_subscriptions`);
  ok(sub && sub.email === 'fan@test.local' && sub.artist_slug === SLUG, 'abonné enregistré en base, email en minuscules');
  r = await anon.req('/api/artists/subscribe', { method: 'POST', body: { slug: SLUG, email: 'fan@test.local', consent: true } });
  ok(r.status === 200 && r.data.already === true && (await one(`select count(*)::int as n from public.artist_subscriptions`)).n === 1, 'second abonnement = idempotent (1 seule ligne)');
  ok(Boolean(await waitMail((m) => [].concat(m.to).includes('fan@test.local') && /Abonnement confirmé/.test(m.subject) && /api\/unsubscribe\?token=/.test(m.html))), 'email de confirmation avec lien de désabonnement');
  ok(!hasAt(fs.readFileSync(FILE, 'utf8')), 'content.json toujours sans email');

  section('Désabonnement (lien 1 clic)');
  r = await anon.req('/api/unsubscribe?token=inconnu-inconnu-inconnu');
  ok(/Déjà désabonné/.test(r.data), 'jeton inconnu → « Déjà désabonné »');
  r = await anon.req(`/api/unsubscribe?token=${encodeURIComponent(sub.token)}`);
  ok(/Désabonnement confirmé/.test(r.data), 'jeton valide → désabonnement confirmé');
  ok((await one(`select count(*)::int as n from public.artist_subscriptions`)).n === 0, 'ligne supprimée en base');
  r = await anon.req(`/api/unsubscribe?token=${encodeURIComponent(sub.token)}`);
  ok(/Déjà désabonné/.test(r.data), 'second clic → « Déjà désabonné »');

  section('Email d’artiste (privé)');
  r = await anon.req(`/api/admin/artists/${ARTIST_ID}`, { method: 'PATCH', body: { email: 'x@test.local' } });
  ok(r.status === 401, `sans session admin → 401 (${r.status})`);
  r = await admin.req(`/api/admin/artists/${ARTIST_ID}`, { method: 'PATCH', body: { email: 'Dreezy@Test.Local' } });
  ok(r.status === 200, `PATCH email → 200 (${r.status})`);
  ok((await one(`select email from public.artist_emails where artist_slug = $1`, [SLUG]))?.email === 'dreezy@test.local', 'email enregistré en base (minuscules)');
  ok(!hasAt(fs.readFileSync(FILE, 'utf8')), 'content.json toujours sans email après modification admin');
  r = await admin.req('/admin/contenu');
  ok(r.status === 200 && r.data.includes('dreezy@test.local'), 'l’admin voit l’email (superposé depuis Supabase)');
  r = await anon.req(`/artistes/${SLUG}`);
  ok(r.status === 200 && !r.data.includes('dreezy@test.local') && !/mailto:dreezy/.test(r.data), 'le profil public n’affiche PAS l’email');

  section('Lien de connexion artiste (usage unique)');
  await L.resetMocks();
  r = await anon.req('/api/artist/request-link', { method: 'POST', body: { slug: SLUG } });
  ok(r.status === 200 && r.data.ok, `demande de lien → réponse générique (${r.status})`);
  const link = await waitMail((m) => [].concat(m.to).includes('dreezy@test.local'));
  const token = link && /api\/artist\/login\?token=([^"&\s]+)/.exec(link.html)?.[1];
  ok(Boolean(token), 'email reçu par l’artiste avec le lien magique');
  const tk = await one(`select * from public.artist_login_tokens where artist_slug = $1`, [SLUG]);
  ok(tk && tk.token_hash === crypto.createHash('sha256').update(decodeURIComponent(token)).digest('hex'), 'seul le HASH du jeton est en base');
  ok(!JSON.stringify(tk).includes(decodeURIComponent(token)), 'le jeton en clair n’est nulle part en base');
  const a1 = new L.Client();
  r = await a1.req(`/api/artist/login?token=${token}`);
  ok(r.status >= 300 && r.status < 400 && /\/artistes\/dreezy\/modifier$/.test(r.headers.get('location') ?? ''), 'premier clic → espace artiste');
  ok(Boolean(a1.jar['sun_artist']), 'session artiste posée');
  r = await new L.Client().req(`/api/artist/login?token=${token}`);
  ok(/login=expire/.test(r.headers.get('location') ?? ''), 'second clic sur le même lien → refusé (usage unique)');
  r = await new L.Client().req('/api/artist/login?token=inconnu');
  ok(/login=expire/.test(r.headers.get('location') ?? ''), 'jeton inconnu → refusé');
  await q(`update public.artist_login_tokens set expires_at = now() - interval '1 minute', used = false where artist_slug = $1`, [SLUG]);
  r = await new L.Client().req(`/api/artist/login?token=${token}`);
  ok(/login=expire/.test(r.headers.get('location') ?? ''), 'jeton périmé → refusé');
  r = await new L.Client().req('/artistes?login=expire');
  ok(r.status === 200 && /expiré ou a déjà été utilisé/.test(r.data), 'la page où renvoie un lien refusé existe (plus de 404) et explique quoi faire');
  r = await new L.Client().req('/artistes?login=invalide');
  ok(r.status === 200 && /n’est pas valide/.test(r.data), 'idem pour un lien invalide');
  await L.resetMocks();
  await new L.Client().req('/api/artist/request-link', { method: 'POST', body: { slug: 'dega-youth' } });
  ok((await mails()).length === 0, 'artiste sans email / non vérifié : réponse identique, aucun email envoyé');

  section('Notification d’abonnés (une seule fois par événement)');
  await q(`insert into public.artist_subscriptions (artist_slug, email, token) values ($1, 'fan2@test.local', 'tok_fan2_0123456789abcdef')`, [SLUG]);
  await L.resetMocks();
  r = await admin.req('/api/admin/events', { method: 'POST', body: { name: 'Soirée Test Notif', date: '2030-05-05', headliner: 'Dreezy' } });
  ok(r.status === 201, `création d’un événement avec l’artiste suivi (${r.status})`);
  const evId = r.data?.item?.id, evSlug = r.data?.item?.slug;
  const notif = (await mails()).filter((m) => [].concat(m.to).includes('fan2@test.local'));
  ok(notif.length === 1 && /Soirée Test Notif/.test(notif[0].subject), 'l’abonné est prévenu (1 email)');
  ok((await one(`select count(*)::int as n from public.artist_notifications where event_slug = $1 and email = 'fan2@test.local'`, [evSlug])).n === 1, 'envoi mémorisé en base (anti-doublon)');
  await L.resetMocks();
  r = await admin.req(`/api/admin/events/${evId}`, { method: 'PATCH', body: { description: 'modifié' } });
  ok(r.status === 200 && (await mails()).filter((m) => [].concat(m.to).includes('fan2@test.local')).length === 0, 'modifier l’événement ne renvoie PAS de second email');
  ok(!hasAt(fs.readFileSync(FILE, 'utf8')), 'content.json sans email après création d’événement');

  section('Demande de vérification (privée)');
  const [v] = await q(`insert into public.artist_verifications (artist_slug, name, email, blob_pathname) values ('dega-youth', 'Deg A', 'deg@test.local', 'verif/none') returning id`);
  r = await anon.req(`/api/admin/verification/${v.id}`, { method: 'POST', body: { decision: 'refuse' } });
  ok(r.status === 401, `décision sans session admin → 401 (${r.status})`);
  await L.resetMocks();
  r = await admin.req(`/api/admin/verification/${v.id}`, { method: 'POST', body: { decision: 'refuse' } });
  ok(r.status === 200 && r.data.verified === false, `refus → 200 (${r.status})`);
  ok((await one(`select count(*)::int as n from public.artist_verifications where id = $1`, [v.id])).n === 0, 'demande supprimée de la base dès la décision');
  ok(Boolean(await waitMail((m) => [].concat(m.to).includes('deg@test.local'))), 'le demandeur est prévenu par email');
  ok(!hasAt(fs.readFileSync(FILE, 'utf8')), 'content.json sans email à la fin des parcours');
} finally {
  fs.writeFileSync(FILE, original); // restaure le fichier de contenu (l'événement de test y avait été écrit)
}
process.exit(L.summary('données privées artistes / abonnés (Supabase)') ? 1 : 0);
