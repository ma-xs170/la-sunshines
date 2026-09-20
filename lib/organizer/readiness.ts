// « Complétez votre compte pour pouvoir publier votre événement » : étapes à valider pour une organisation. PUR (testé).

export interface OrgAccount {
  name: string; siret: string | null; responsible_name: string | null; address: string | null; contact_email: string | null;
  stripe_ready: boolean | null;
}

export interface ChecklistStep { id: 'legal' | 'stripe' | 'email'; done: boolean; title: string; hint: string; href: string; cta: string }

/** Les informations légales alimentent le bloc « organisateur » du billet PDF : nom, adresse, et SIRET OU nom + prénom du responsable. */
export function legalComplete(o: Pick<OrgAccount, 'name' | 'siret' | 'responsible_name' | 'address'>): boolean {
  return Boolean(o.name?.trim()) && Boolean(o.address?.trim()) && Boolean(o.siret?.trim() || o.responsible_name?.trim());
}

export function checklist(o: OrgAccount): ChecklistStep[] {
  return [
    { id: 'legal', done: legalComplete(o), title: 'Informations légales de l’organisation',
      hint: 'Nom de la structure, SIRET (ou nom et prénom du responsable) et adresse : elles figurent sur chaque billet PDF.',
      href: '/organisateur/parametres#legal', cta: 'Renseigner' },
    { id: 'stripe', done: Boolean(o.stripe_ready), title: 'Compte de paiement Stripe',
      hint: 'Stripe, notre prestataire de paiement, a besoin des détails de votre organisation pour encaisser et verser vos ventes.',
      href: '/organisateur/paiements', cta: 'Connecter Stripe' },
    { id: 'email', done: Boolean(o.contact_email?.trim()), title: 'Adresse d’envoi des emails',
      hint: 'Les participants y répondent quand vous leur écrivez : sans elle, aucun message ne peut partir.',
      href: '/organisateur/parametres#email', cta: 'Renseigner' },
  ];
}

export const canPublish = (o: OrgAccount): boolean => checklist(o).every((s) => s.done);
