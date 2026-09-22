// s21 — e-mails d’administration (série 2, bloc 5) : invitation admin (création, renvoi, échec lisible), diagnostic e-mail
// (config, domaine, test d'envoi), notifications d'approbation / suspension d'organisation. MAIL_FROM respecté partout.
import * as L from './lib.mjs';
const { ok, section, as, q, one, mailState, setMailDomain, MAIL, USERS } = L;

await L.resetDb();
await q(`delete from public.admin_accounts`);
await q(`insert into public.admin_accounts (user_id, level, active, must_change_password, invitation_status) values ($1, 'super', true, false, 'sent'), ($2, 'admin', true, false, 'sent')`, [USERS.admin.id, USERS.deleg.id]);
// nettoyage ciblé (relances répétées sur un même banc) : seulement ce que CE script crée, jamais les fixtures partagées.
await q(`delete from public.organizer_members where organizer_id in (select id from public.organizers where name like 'Orga Notif Test%')`);
await q(`delete from public.organizers where name like 'Orga Notif Test%'`);
await q(`delete from auth.users where email = 'nouveau-admin@test.local'`);
const admin = await as(USERS.admin), deleg = await as(USERS.deleg), orgb = await as(USERS.orgb), cust = await as(USERS.cust);

section('Invitation admin : droits et création');
let r = await deleg.req('/api/admin-gestion/administrateurs', { method: 'POST', body: { email: 'nouveau@test.local', first_name: 'Nouv', last_name: 'Elle', phone: '', level: 'admin' } });
ok(r.status === 403, `un admin non « super » ne crée pas d'administrateur (${r.status})`);
r = await cust.req('/api/admin-gestion/administrateurs', { method: 'POST', body: { email: 'x@test.local', first_name: 'X', last_name: 'Y', phone: '', level: 'admin' } });
ok(r.status === 403 || r.status === 401, `un client n'y accède pas (${r.status})`);

r = await admin.req('/api/admin-gestion/administrateurs', { method: 'POST', body: { email: 'nouveau-admin@test.local', first_name: 'Nouv', last_name: 'Elle', phone: '0690777777', level: 'admin' } });
ok(r.status === 200 && r.data.ok && /^ADM\./.test(r.data.reference) && r.data.invitation === 'sent', `création : référence ${r.data.reference}, invitation ${r.data.invitation} (${r.status})`);
const newId = (await one(`select id from auth.users where email = 'nouveau-admin@test.local'`)).id;

let ms = await mailState();
ok(ms.sent.length === 1, `1 e-mail envoyé (${ms.sent.length})`);
let mail = ms.sent[0];
ok(mail.to?.[0] === 'nouveau-admin@test.local', `destinataire correct (${mail.to})`);
ok(mail.from === 'La Sunshines <billets@test.local>', `expéditeur = MAIL_FROM, pas le domaine de test Resend (${mail.from})`);
ok(/nouveau-admin@test\.local/.test(mail.html) && /Identifiant/.test(mail.html), 'identifiant présent dans le mail');
ok(/<code[^>]*>[^<]{16,}<\/code>/.test(mail.html), 'mot de passe provisoire présent (balise <code>)');
ok(/connexion/.test(mail.html) && /Unbounded/.test(mail.html) && /#FFF8EE/i.test(mail.html), 'gabarit de marque (lien de connexion, couleurs, typographie du site)');
ok(!JSON.stringify(mail).match(/re_e2e|RESEND_API_KEY/i), 'aucun secret dans le corps du mail');

r = await admin.req('/api/admin-gestion/administrateurs');
ok(r.status === 200 && r.data.find((a) => a.user_id === newId)?.invitation_status === 'sent', 'liste : invitation « envoyée »');

section('Renvoyer l’invitation (nouveau mot de passe)');
r = await admin.req('/api/admin-gestion/administrateurs', { method: 'PATCH', body: { user_id: newId, action: 'resend' } });
ok(r.status === 200 && r.data.invitation === 'sent', `renvoi : ${r.data.invitation} (${r.status})`);
ms = await mailState();
ok(ms.sent.length === 2, `2e e-mail envoyé (${ms.sent.length})`);
ok(ms.sent[1].to?.[0] === 'nouveau-admin@test.local' && ms.sent[1].from === ms.sent[0].from, 'même destinataire, même expéditeur');

section('Domaine non vérifié : erreur lisible, jamais de mot de passe dans l’erreur');
await L.resetMocks(); // remet fail=false ET vide sent (mais garde admin_accounts intact)
const failRes = await fetch(`${MAIL}/__fail?on=1`);
ok(failRes.status === 200, 'bascule du faux Resend en échec');
r = await admin.req('/api/admin-gestion/administrateurs', { method: 'PATCH', body: { user_id: newId, action: 'resend' } });
ok(r.status === 200 && r.data.invitation === 'failed', `échec d'envoi propagé (${r.data.invitation})`);
r = await admin.req('/api/admin-gestion/administrateurs');
const row = r.data.find((a) => a.user_id === newId);
ok(row.invitation_status === 'failed' && /vérifié|Resend/i.test(row.invitation_error) && !/mot de passe|[0-9a-zA-Z]{20}/.test(row.invitation_error), `erreur lisible sans mot de passe (« ${row.invitation_error} »)`);
await fetch(`${MAIL}/__fail?on=0`);

section('Diagnostic e-mail (Réglages)');
r = await deleg.req('/api/admin-gestion/mail-diag');
ok(r.status === 200 && r.data.resendConfigured && r.data.from === 'La Sunshines <billets@test.local>' && r.data.domain === 'test.local', `config lisible par tout admin (${JSON.stringify(r.data)})`);
ok(r.data.domainStatus === 'verified' && !r.data.domainError, 'domaine vérifié par défaut : aucune erreur');
r = await cust.req('/api/admin-gestion/mail-diag');
ok(r.status === 401 || r.status === 403, `un client n'accède pas au diagnostic (${r.status})`);

await setMailDomain('test.local', 'pending');
r = await admin.req('/api/admin-gestion/mail-diag');
ok(r.data.domainStatus === 'pending' && /test\.local/.test(r.data.domainError) && /vérifié/i.test(r.data.domainError), `domaine en attente détecté (${r.data.domainError})`);
await setMailDomain('test.local', 'verified');

section('E-mail de test (« Envoyer un e-mail de test à mon adresse »)');
await L.resetMocks();
r = await admin.req('/api/admin-gestion/mail-diag', { method: 'POST', body: { action: 'test' } });
ok(r.status === 200, `envoi du test réussi (${r.status})`);
ms = await mailState();
ok(ms.sent.length === 1 && ms.sent[0].to?.[0] === USERS.admin.email && /Test de configuration/.test(ms.sent[0].html), `test envoyé à ${USERS.admin.email}`);
await fetch(`${MAIL}/__fail?on=1`);
r = await admin.req('/api/admin-gestion/mail-diag', { method: 'POST', body: { action: 'test' } });
ok(r.status === 502 && /vérifié|Resend/i.test(r.data.error), `échec de l'e-mail de test : erreur lisible (${r.data.error})`);
await fetch(`${MAIL}/__fail?on=0`);

section('Approbation / suspension d’une organisation : e-mail au(x) propriétaire(s)');
await L.resetMocks();
const orgId = (await one(`insert into public.organizers (name, account_status) values ('Orga Notif Test', 'pending') returning id`)).id;
await q(`insert into public.organizer_members (organizer_id, user_id, role) values ($1, $2, 'owner')`, [orgId, USERS.orgb.id]);
r = await admin.req(`/api/admin-gestion/organisateurs/${orgId}`, { method: 'POST', body: { action: 'approve' } });
ok(r.status === 200 && r.data.account_status === 'approved', `approuvée (${r.status})`);
ms = await mailState();
ok(ms.sent.length === 1 && ms.sent[0].to?.[0] === USERS.orgb.email && /approuvée/i.test(ms.sent[0].subject), `e-mail d'approbation envoyé à ${USERS.orgb.email}`);
r = await admin.req(`/api/admin-gestion/organisateurs/${orgId}`, { method: 'POST', body: { action: 'suspend' } });
ok(r.status === 200 && r.data.account_status === 'suspended', `suspendue (${r.status})`);
ms = await mailState();
ok(ms.sent.length === 2 && /suspendue/i.test(ms.sent[1].subject), 'e-mail de suspension envoyé');
r = await admin.req(`/api/admin-gestion/organisateurs/${orgId}`, { method: 'POST', body: { action: 'reactivate' } });
ok(r.status === 200 && r.data.account_status === 'approved', `réactivée (${r.status})`);
ms = await mailState();
ok(ms.sent.length === 2, 'réactivation : aucun e-mail supplémentaire (choix assumé)');

section('Journalisation');
ok((await q(`select 1 from public.audit_log where action = 'admin.create'`)).length >= 1, 'création admin journalisée');
ok((await q(`select 1 from public.audit_log where action = 'organizer.approve'`)).length >= 1, 'approbation journalisée');
ok((await q(`select 1 from public.audit_log where action = 'organizer.suspend'`)).length >= 1, 'suspension journalisée');

process.exit(L.summary('e-mails d’administration (série 2, bloc 5)') ? 1 : 0);
