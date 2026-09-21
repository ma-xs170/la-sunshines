// Règlement du site (source UNIQUE) : page /interdits et texte par défaut des conditions d'un évènement.
export const RULES: { title: string; rules: string[] }[] = [
  { title: 'À l’entrée', rules: [
    'Billet (QR code) et pièce d’identité obligatoires.',
    'Contrôle de sécurité à l’entrée, avec ton accord.',
    'Tout objet retiré à l’entrée est remis à la fin de l’événement.',
    'Aucune entrée après la fermeture des portes.',
  ] },
  { title: 'Tenue', rules: [
    'Short / bermuda : interdit.',
    'Chaussures fermées : obligatoire.',
    'Les filles sont autorisées avec les sacs à main.',
  ] },
  { title: 'Interdits', rules: [
    'Alcool, tabac, vape et drogues.',
    'Armes, objets dangereux et bouteilles en verre.',
  ] },
  { title: 'Respect', rules: [
    'Respecte les autres et l’équipe. Toute violence ou tout harcèlement entraîne une exclusion.',
    'Suis les consignes de l’équipe.',
  ] },
  { title: 'Refus d’accès', rules: [
    'L’organisation se réserve le droit de refuser l’accès à toute personne ne respectant pas le présent règlement, sans remboursement.',
  ] },
];

export const DEFAULT_TERMS = RULES.map((s) => `${s.title.toUpperCase()}\n${s.rules.map((r) => `- ${r}`).join('\n')}`).join('\n\n');
