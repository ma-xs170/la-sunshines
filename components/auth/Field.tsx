import type { InputHTMLAttributes } from 'react';

// Champ de formulaire : réutilise les styles .contact-field du design system.
export default function Field({
  label,
  id,
  hint,
  ...input
}: { label: string; id: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="contact-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={id} {...input} />
      {hint && <p className="auth-hint">{hint}</p>}
    </div>
  );
}
