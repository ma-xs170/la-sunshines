// QR codes générés CÔTÉ SERVEUR. Le QR encode uniquement le code signé du billet
// (jamais d'URL ni de donnée personnelle) ; le scan vérifie la signature HMAC.

import 'server-only';
import QRCode from 'qrcode';

const OPTS = { errorCorrectionLevel: 'M' as const, margin: 2 };

export function qrPng(code: string, width = 600): Promise<Buffer> {
  return QRCode.toBuffer(code, { ...OPTS, type: 'png', width });
}

export function qrDataUrl(code: string, width = 600): Promise<string> {
  return QRCode.toDataURL(code, { ...OPTS, width });
}
