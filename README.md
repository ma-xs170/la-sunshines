# LA SUNSHINES — site

Base Vite (vanilla JS) + GSAP (animations/scroll reveal) + Lenis (smooth scroll).
Style "liquid glass" : `backdrop-filter: blur()`, bordures fines, reflet spéculaire au hover sur `.glass`.

## Installer et lancer en local

Dans VS Code, ouvre un terminal (`` Ctrl+` ``) à la racine du dossier, puis :

```bash
npm install
npm run dev
```

Ça lance le serveur local (Vite) — l'URL s'affiche dans le terminal, en général :

```
http://localhost:5173
```

Ouvre-la dans le navigateur. Le hot-reload est actif : chaque sauvegarde dans VS Code met à jour la page automatiquement, pas besoin de Live Server.

## Build de prod (pour déployer sur Vercel ensuite)

```bash
npm run build
npm run preview   # pour tester le build localement avant de déployer
```

## Extensions VS Code utiles

- **ESLint** (`dbaeumer.vscode-eslint`) — si Claude Code ajoute du JS plus poussé
- **Prettier** (`esbenp.prettier-vscode`) — formatage auto
- **Tailwind CSS IntelliSense** — seulement si tu ajoutes Tailwind plus tard

Installation en ligne de commande (si `code` est dans ton PATH) :

```bash
code --install-extension esbenp.prettier-vscode
code --install-extension dbaeumer.vscode-eslint
```

## Structure

```
la-sunshines/
├── index.html        → structure de la page
├── src/
│   ├── style.css      → tous les styles (tokens couleur en haut du fichier)
│   └── main.js        → countdown, parallax glow, animations GSAP scroll-reveal
├── package.json
```

## Pour la suite avec Claude Code

Dis-lui directement dans le terminal du projet :

```bash
claude
```

puis demande-lui d'intégrer Bizouk (billetterie), de brancher les vraies éditions/flyers, ou de découper en plusieurs pages (Éditions, Line-up, Contact) — tout le style/tokens sont déjà posés dans `src/style.css`, il n'a qu'à réutiliser les classes `.glass`, `.btn`, `.ed-card`, etc.
