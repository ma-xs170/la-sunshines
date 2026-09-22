export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <h1 className="org-head__title">Clients</h1>
      <div className="clients-search glass"><span className="clients-skel" style={{ width: '100%', height: 24 }} /></div>
      <div className="org-table glass clients-table">
        <table><thead><tr><th>Prénom</th><th>NOM</th><th>E-mail</th><th>Téléphone</th><th>Naissance</th><th>À venir</th><th>Passés</th><th>Inscrit le</th><th>Statut</th></tr></thead>
          <tbody>{Array.from({ length: 8 }, (_, i) => <tr key={i}>{Array.from({ length: 9 }, (_, j) => <td key={j}><span className="clients-skel" /></td>)}</tr>)}</tbody></table>
      </div>
      <p className="sr-only">Chargement des clients…</p>
    </div>
  );
}
