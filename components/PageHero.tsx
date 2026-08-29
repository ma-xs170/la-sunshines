import type { ReactNode } from 'react';

/**
 * En-tête de page de contenu (Règlement, Infos, Contact, Statuts, pages
 * légales…). Un seul composant → espacement IDENTIQUE partout : dégagement
 * fixe sous la nav (porté par `.content-page` sur le <main>), puis
 * eyebrow → titre → intro avec des marges constantes.
 */
export default function PageHero({
  eyebrow,
  title,
  lead,
}: {
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
}) {
  return (
    <header className="page-hero">
      {eyebrow && <p className="page-hero__eyebrow script">{eyebrow}</p>}
      <h1 className="page-hero__title">{title}</h1>
      {lead ? <p className="page-hero__lead">{lead}</p> : null}
    </header>
  );
}
