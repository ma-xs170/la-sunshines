// Logo de l'organisateur ; à défaut, avatar généré à partir des initiales, dans les couleurs du site.
const TINTS = ['#FFB238', '#FF7F6B', '#F35FA6', '#2EC4B6', '#8A4FCF', '#3FA34D'];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const tint = (n: string) => TINTS[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];

export default function OrganizerAvatar({ name, src, size = 72 }: { name: string; src?: string | null; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img className="oavatar" src={src} alt={`Logo ${name}`} width={size} height={size} style={{ width: size, height: size }} />;
  return <span className="oavatar oavatar--gen" role="img" aria-label={`Logo ${name}`} style={{ width: size, height: size, background: tint(name), fontSize: size * 0.38 }}>{initials(name)}</span>;
}
