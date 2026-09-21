// Pastille « Gratuit » : tarifs, listes, page publique, simulateur de prix, billet.
export default function FreeBadge({ className = '' }: { className?: string }) {
  return <span className={('badge-free ' + className).trim()}>Gratuit</span>;
}
