// Jetons « magic link » de l'espace artiste : création + envoi de l'email.
// SERVEUR UNIQUEMENT. Le jeton n'est jamais un mot de passe — usage unique,
// courte durée. Aucun secret côté artiste n'est stocké ni affiché.

import { newId, type Store, type StoredArtist, type ArtistLoginToken } from './store';
import { sendMail, mailLayout, siteUrl } from './mail';

/** Durée de validité d'un lien magique. */
export const LOGIN_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min

/**
 * Crée un nouveau jeton pour `slug` et INVALIDE tout jeton précédent non utilisé
 * du même artiste. Mute `store.artistLoginTokens` (l'appelant persiste ensuite).
 * Purge au passage les jetons expirés/utilisés de tout le monde.
 */
export function issueArtistLoginToken(store: Store, slug: string): string {
  const now = Date.now();
  const token = `${newId()}${newId()}${newId()}`;
  store.artistLoginTokens = [
    ...store.artistLoginTokens.filter(
      (t) =>
        t.artistSlug !== slug && // les anciens de CET artiste sautent
        !t.used &&
        t.expiresAt > now, // et on purge les périmés des autres
    ),
    {
      token,
      artistSlug: slug,
      expiresAt: now + LOGIN_TOKEN_TTL_MS,
      used: false,
      createdAt: new Date().toISOString(),
    },
  ];
  return token;
}

/** Envoie le lien magique à l'adresse email de l'artiste (best-effort). */
export async function sendArtistMagicLink(
  artist: StoredArtist,
  token: string,
): Promise<boolean> {
  if (!artist.email) return false;
  const url = `${siteUrl()}/api/artist/login?token=${encodeURIComponent(token)}`;
  return sendMail({
    to: artist.email,
    subject: 'Ton lien de connexion — espace artiste LA SUNSHINES',
    html: mailLayout(
      `<p>Bonjour ${artist.name},</p>
       <p>Voici ton lien de connexion à ton espace artiste. Il te permet de
       modifier ta photo, ta bio, tes réseaux et ta bannière.</p>
       <p style="margin:24px 0">
         <a href="${url}"
            style="background:#191410;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;display:inline-block">
           Ouvrir mon espace artiste
         </a>
       </p>
       <p style="font-size:13px;color:#8a8378">
         Ce lien est valable 30&nbsp;minutes et à usage unique. Si tu n'es pas à
         l'origine de cette demande, ignore cet email — ton compte reste protégé.
       </p>`,
    ),
  });
}

/** Trouve un jeton valide (non utilisé, non expiré). */
export function findValidLoginToken(
  store: Store,
  token: string,
): ArtistLoginToken | null {
  const t = store.artistLoginTokens.find((x) => x.token === token);
  if (!t || t.used || t.expiresAt <= Date.now()) return null;
  return t;
}
