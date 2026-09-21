'use client';

import { useRouter } from 'next/navigation';

/** Choix de l'événement (page Participants / Analyse) : change l'URL sans bouton, en gardant l'accessibilité d'un vrai <select>. */
export default function EventPicker({ options, value, param = 'evenement', label = 'Événement' }: { options: { slug: string; label: string }[]; value: string; param?: string; label?: string }) {
  const router = useRouter();
  return (
    <label className="admin-field org-picker">
      <span>{label}</span>
      <select value={value} onChange={(e) => router.push(`?${param}=${encodeURIComponent(e.target.value)}`)}>
        {options.map((o) => <option key={o.slug} value={o.slug}>{o.label}</option>)}
      </select>
    </label>
  );
}
