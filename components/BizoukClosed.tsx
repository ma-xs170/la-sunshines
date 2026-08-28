import Icon from './Icon';

// Bloc compact pour la section BILLETTERIE d'une édition PASSÉE : pas d'iframe
// Bizouk ni de script tiers chargés, juste un « Vente terminée » + lien discret.
export default function BizoukClosed({ bizoukUrl }: { bizoukUrl?: string | null }) {
  return (
    <div className="bizouk-closed glass">
      <span className="bizouk-closed__pill">Vente terminée</span>
      {bizoukUrl && (
        <a
          className="bizouk-closed__link"
          href={bizoukUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Voir la page Bizouk
          <Icon name="arrow-up-right" />
        </a>
      )}
    </div>
  );
}
