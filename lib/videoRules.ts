// Règles du flyer vidéo. Configuration UNIQUE et décision de transcodage (pure, testée).
// Plafond de diffusion : jamais plus de 1080p ni de 60 i/s. Source dépassant l'un des deux (ou 4K) → HEVC ; sinon simple optimisation (faststart).
export const VIDEO_CONFIG = {
  maxBytes: 300 * 1024 * 1024,      // 300 Mo
  maxSeconds: 45,
  maxWidth: 1920, maxHeight: 1080, maxFps: 60,
  fallbackMaxFps: 30,               // variante H.264 de repli
  formats: ['video/mp4', 'video/quicktime', 'video/webm'] as string[],
  extensions: ['.mp4', '.mov', '.webm'] as string[],
};

export interface VideoProbe { width: number; height: number; fps: number; codec: string; seconds: number; bytes: number; hasAudio: boolean }
export type VideoPlan =
  | { ok: false; error: string }
  | { ok: true; action: 'optimize' | 'transcode-hevc'; hevc: { maxWidth: number; maxHeight: number; fps: number; crf: number; args: string[] } | null; fallbackH264: { fps: number; args: string[] } };

/** Le grand côté peut être la hauteur (vidéo portrait) : on compare côté long / côté court aux plafonds 1920 × 1080. */
export function decideVideoPlan(p: VideoProbe, c = VIDEO_CONFIG): VideoPlan {
  if (p.bytes > c.maxBytes) return { ok: false, error: `Fichier trop lourd (${Math.round(p.bytes / 1048576)} Mo, maximum ${Math.round(c.maxBytes / 1048576)} Mo).` };
  if (p.seconds > c.maxSeconds) return { ok: false, error: `Vidéo trop longue (${Math.round(p.seconds)} s, maximum ${c.maxSeconds} s).` };
  if (!(p.width > 0 && p.height > 0 && p.fps > 0)) return { ok: false, error: 'Vidéo illisible.' };
  const long = Math.max(p.width, p.height), short = Math.min(p.width, p.height);
  const tooBig = long > c.maxWidth || short > c.maxHeight;
  const tooFast = p.fps > c.maxFps + 0.5;
  const audio = p.hasAudio ? ['-c:a', 'aac', '-b:a', '96k'] : ['-an'];
  const scale = `scale='if(gt(iw,ih),min(${c.maxWidth},iw),min(${c.maxHeight},iw))':'if(gt(iw,ih),min(${c.maxHeight},ih),min(${c.maxWidth},ih))':force_original_aspect_ratio=decrease:force_divisible_by=2`;
  const fps = Math.min(p.fps, c.maxFps);
  const fallback = { fps: Math.min(p.fps, c.fallbackMaxFps), args: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '26', '-pix_fmt', 'yuv420p', '-vf', scale, '-r', String(Math.min(Math.round(p.fps), c.fallbackMaxFps)), ...audio, '-movflags', '+faststart'] };
  if (tooBig || tooFast) {
    return { ok: true, action: 'transcode-hevc', fallbackH264: fallback, hevc: { maxWidth: c.maxWidth, maxHeight: c.maxHeight, fps, crf: long > 2560 ? 26 : 24,
      args: ['-c:v', 'libx265', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', long > 2560 ? '26' : '24', '-vf', scale, '-r', String(Math.round(fps)), ...audio, '-movflags', '+faststart'] } };
  }
  return { ok: true, action: 'optimize', hevc: null, fallbackH264: fallback };   // déjà conforme : pas de ré-encodage, on ajoute seulement +faststart (-c copy)
}

export function acceptVideoFile(name: string, type: string, bytes: number, c = VIDEO_CONFIG): string | null {
  const ext = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
  if (!c.extensions.includes(ext) || !c.formats.includes(type)) return 'Format non accepté : mp4, mov ou webm uniquement.';
  if (bytes > c.maxBytes) return `Fichier trop lourd (maximum ${Math.round(c.maxBytes / 1048576)} Mo).`;
  return null;
}
