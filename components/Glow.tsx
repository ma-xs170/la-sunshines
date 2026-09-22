'use client';

import { usePathname } from 'next/navigation';

// Halos décoratifs de fond (deux cercles flous, voir .glow dans globals.css) : invisibles en back-office,
// où /admin et /organisateur posent leur propre fond opaque par-dessus — coût de flou/composition pour rien.
const isBackofficeUrl = (p: string) => p.startsWith('/admin') || p.startsWith('/organisateur');

export default function Glow() {
  const pathname = usePathname() ?? '';
  if (isBackofficeUrl(pathname)) return null;
  return (
    <div className="glow" aria-hidden="true">
      <span className="g1" />
      <span className="g2" />
    </div>
  );
}
