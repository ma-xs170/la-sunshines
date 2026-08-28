import { NextResponse } from 'next/server';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TO = 'themouv2.0971@gmail.com';
// Expéditeur : domaine partagé Resend (aucune vérification de domaine requise
// pour démarrer). À remplacer par une adresse de ton domaine une fois vérifié.
const FROM = 'LA SUNSHINES <onboarding@resend.dev>';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim();
  const subject = String(body.subject ?? '').trim();
  const message = String(body.message ?? '').trim();
  // honeypot : champ caché, doit rester vide (les bots le remplissent)
  const trap = String(body.company ?? '').trim();

  if (trap) {
    // on fait comme si tout allait bien, sans rien envoyer
    return NextResponse.json({ ok: true });
  }

  if (
    !name ||
    name.length > 120 ||
    !EMAIL_RE.test(email) ||
    !subject ||
    subject.length > 160 ||
    !message ||
    message.length > 5000
  ) {
    return NextResponse.json(
      { error: 'Merci de remplir correctement tous les champs.' },
      { status: 422 },
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[contact] RESEND_API_KEY manquante — email non envoyé.');
    return NextResponse.json(
      { error: 'L’envoi est momentanément indisponible. Réessaie plus tard.' },
      { status: 503 },
    );
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM,
      to: [TO],
      replyTo: email,
      subject: `[Contact site] ${subject}`,
      text:
        `Nouveau message depuis le formulaire de contact LA SUNSHINES\n\n` +
        `Nom     : ${name}\n` +
        `Email   : ${email}\n` +
        `Sujet   : ${subject}\n\n` +
        `${message}\n`,
    });

    if (error) {
      console.error('[contact] Resend a renvoyé une erreur :', error);
      return NextResponse.json(
        { error: 'L’envoi a échoué. Réessaie dans un moment.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[contact] Exception lors de l’envoi :', err);
    return NextResponse.json(
      { error: 'L’envoi a échoué. Réessaie dans un moment.' },
      { status: 502 },
    );
  }
}
