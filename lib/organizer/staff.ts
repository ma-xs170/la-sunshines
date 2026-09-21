// Membres et présences d'un évènement (fonction SQL org_staff) : types et libellés partagés par les pages Staff.
export interface StaffRow { user_id: string; role: 'owner' | 'manager' | 'staff' | null; name: string; email: string; scans: number; first_scan_at: string | null; last_scan_at: string | null }
export const STAFF_ROLE_LABEL: Record<string, string> = { owner: 'Propriétaire', manager: 'Gestionnaire', staff: 'Staff' };
export const ROLE_MATRIX: { role: 'owner' | 'manager' | 'staff'; can: string[] }[] = [
  { role: 'owner', can: ['Tout voir et tout modifier', 'Informations légales, paiements et finance', 'Membres et rôles de l’organisation', 'Scan à l’entrée'] },
  { role: 'manager', can: ['Créer et modifier les évènements, tarifs, codes de réduction', 'Participants, commandes, invitations, messages', 'Statistiques et exports', 'Scan à l’entrée'] },
  { role: 'staff', can: ['Scan des billets à l’entrée uniquement', 'Ne voit ni les chiffres ni les participants'] },
];
