import type { ReactNode } from 'react';
import Icon from './Icon';

// État « à venir » réutilisable : carte .glass, message centré + icône.
// Utilisé quand la date d'une édition est connue mais pas encore le détail
// (headliner, line-up…). La bascule vers l'affichage rempli se fait
// automatiquement dès que la donnée correspondante est renseignée.
export default function ComingSoon({ children }: { children: ReactNode }) {
  return (
    <div className="coming-soon glass">
      <Icon name="sparkles" />
      <p>{children}</p>
    </div>
  );
}
