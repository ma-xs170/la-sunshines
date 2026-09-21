/** Pied de page discret du back-office (/organisateur et /admin) : remplace l'ancien bloc noir du site public. */
export default function BackFooter() {
  return (
    <footer className="ofoot">
      <span>© La Sunshines</span>
      <a href="/cgv">CGU</a><a href="/politique-de-confidentialite">Confidentialité</a><a href="/contact">Contact</a>
    </footer>
  );
}
