// Notifications d'abonnement : quand un événement (POST/PATCH) a un artiste
// suivi dans son line-up, on prévient ses abonnés — une seule fois par
// (événement, abonné), tracké dans store.notifiedSubscribers.

import type { Store, StoredEvent } from './store';
import { normalizeArtistName } from './artists';
import { formatEditionDate } from './format';
import { sendMail, mailLayout, mailConfigured, siteUrl } from './mail';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** slugs des artistes (profils) cités par un événement (headliner + line-up). */
function eventArtistSlugs(store: Store, ev: StoredEvent): Set<string> {
  const names = [
    ...(ev.headliner ? ev.headliner.split(/\s*·\s*/) : []),
    ...(ev.lineup ?? []),
  ]
    .map(normalizeArtistName)
    .filter(Boolean);
  const out = new Set<string>();
  for (const a of store.artists) {
    if (names.includes(normalizeArtistName(a.name))) out.add(a.slug);
  }
  return out;
}

function notifyKey(evSlug: string, email: string): string {
  return `${evSlug}::${email.toLowerCase()}`;
}

/**
 * Envoie les notifications dues pour cet événement. MUTE `store.notifiedSubscribers`
 * (le caller persiste ensuite le store). Retourne le nombre d'emails tentés.
 */
export async function notifySubscribersForEvent(
  store: Store,
  ev: StoredEvent,
): Promise<number> {
  // pas de notif pour un événement masqué / archivé / sans line-up suivi
  if (ev.hidden || (ev as { archived?: boolean }).archived) return 0;

  const slugs = eventArtistSlugs(store, ev);
  if (slugs.size === 0) return 0;

  const targets = store.subscriptions.filter(
    (s) =>
      slugs.has(s.artistSlug) &&
      !store.notifiedSubscribers.includes(notifyKey(ev.slug, s.email)),
  );
  if (targets.length === 0) return 0;

  const dateLabel = ISO_RE.test(ev.date)
    ? formatEditionDate(ev.date)
    : ev.date || 'Date à venir';
  const evUrl = `${siteUrl()}/editions/${ev.slug}`;

  await Promise.allSettled(
    targets.map(async (s) => {
      const unsub = `${siteUrl()}/api/unsubscribe?token=${encodeURIComponent(s.token)}`;
      await sendMail({
        to: s.email,
        subject: `${ev.name} — un artiste que tu suis est à l’affiche`,
        headers: {
          'List-Unsubscribe': `<${unsub}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        html: mailLayout(
          `<p>Un artiste dont tu suis les annonces est au line-up&nbsp;:</p>
           <p style="font-size:18px;font-weight:800;margin:10px 0 4px">${ev.name}</p>
           <p style="margin:0 0 14px">${dateLabel}</p>
           <p><a href="${evUrl}" style="display:inline-block;background:#FFB238;color:#191410;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:999px">Voir l’événement</a></p>
           <p style="font-size:12px;color:#8a8378;margin-top:18px">Tu reçois cet email car tu t’es abonné(e) aux annonces d’un artiste sur LA SUNSHINES.
           <a href="${unsub}">Se désabonner en 1 clic</a>.</p>`,
        ),
      });
    }),
  );

  // au-plus-une-fois : on marque comme notifié dès qu'on a TENTÉ (mail configuré)
  if (mailConfigured()) {
    for (const s of targets) {
      const k = notifyKey(ev.slug, s.email);
      if (!store.notifiedSubscribers.includes(k)) store.notifiedSubscribers.push(k);
    }
  }

  return targets.length;
}
