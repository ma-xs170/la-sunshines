// Liens « magic link » de l'espace artiste : envoi de l'email. SERVEUR UNIQUEMENT.
// Le jeton n'est jamais un mot de passe — usage unique, courte durée, et seul son hash est stocké (Supabase :
// lib/privateData.ts). L'email de l'artiste vit dans Supabase, jamais dans data/content.json (dépôt public).

import type { StoredArtist } from './store';
import { getArtistEmail, LOGIN_TOKEN_TTL_MS } from './privateData';
import { sendMail, mailLayout, siteUrl } from './mail';

export { LOGIN_TOKEN_TTL_MS };

/** Envoie le lien magique à l'adresse email PRIVÉE de l'artiste (best-effort). */
export async function sendArtistMagicLink(
  artist: Pick<StoredArtist, 'slug' | 'name'>,
  token: string,
  emailOverride?: string,
): Promise<boolean> {
  const email = emailOverride || (await getArtistEmail(artist.slug));
  if (!email) return false;
  const url = `${siteUrl()}/api/artist/login?token=${encodeURIComponent(token)}`;
  const r = await sendMail({
    to: email,
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
  return r.ok;
}
