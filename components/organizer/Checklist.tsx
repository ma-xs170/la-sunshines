import Icon from '../Icon';
import { checklist, type OrgAccount } from '@/lib/organizer/readiness';

/** « Complétez votre compte pour pouvoir publier votre événement » — les étapes faites sont cochées. Seul le propriétaire peut les remplir. */
export default function Checklist({ org, editable }: { org: OrgAccount; editable: boolean }) {
  const steps = checklist(org);
  if (steps.every((s) => s.done)) return null;
  return (
    <section className="org-check glass" aria-labelledby="org-check-h">
      <h2 id="org-check-h"><Icon name="alert" />Complétez votre compte pour pouvoir publier votre événement</h2>
      <ol className="org-check__list">
        {steps.map((s) => (
          <li key={s.id} className={'org-check__step' + (s.done ? ' is-done' : '')}>
            <span className="org-check__mark" aria-hidden="true">{s.done && <Icon name="check" />}</span>
            <div className="org-check__txt">
              <strong>{s.title}{s.done && <span className="sr-only"> — fait</span>}</strong>
              {!s.done && <p>{s.hint}</p>}
            </div>
            {!s.done && (editable
              ? <a className="btn btn--outline" href={s.href}>{s.cta}</a>
              : <span className="org-muted">À faire par le propriétaire</span>)}
          </li>
        ))}
      </ol>
    </section>
  );
}
