# Site Olivier Louette — Artisan menuisier

## Contenu
- `index.html` — page d'accueil (savoir-faire, atelier, avis Google, devis par email)
- `realisations.html` — le journal de l'atelier (blog automatique)
- `posts.json` — les articles du journal (généré automatiquement)
- `automation/generate-posts.mjs` — le robot : Instagram/Facebook → Claude → articles
- `.github/workflows/journal.yml` — planification quotidienne (GitHub Actions)

## Mise en ligne
Hébergez le dossier tel quel (GitHub Pages, Netlify, OVH, o2switch…).
`realisations.html` lit `posts.json` : les deux fichiers doivent rester côte à côte.

## Activer le journal automatique (une seule fois)
1. **Compte Meta développeur** (developers.facebook.com) : créer une app,
   lier la page Facebook / le compte Instagram professionnel d'Olivier,
   générer un **token longue durée** avec les permissions
   `pages_read_engagement` (Facebook) et/ou `instagram_basic` (Instagram).
2. **Clé Claude** : créer une clé API sur console.anthropic.com.
3. Sur le dépôt GitHub du site → Settings → Secrets and variables → Actions,
   ajouter : `ANTHROPIC_API_KEY`, `META_ACCESS_TOKEN`, `IG_USER_ID` et/ou `FB_PAGE_ID`.
4. C'est tout : chaque matin, le robot lit les nouvelles publications,
   Claude les réécrit en articles (titre + texte, sans hashtags),
   et `posts.json` est mis à jour puis publié automatiquement.

Test manuel : onglet **Actions** → « Journal automatique » → *Run workflow*,
ou en local : `ANTHROPIC_API_KEY=... META_ACCESS_TOKEN=... IG_USER_ID=... node automation/generate-posts.mjs`

## Activer les avis Google
Dans `index.html`, renseigner `GOOGLE_AVIS.apiKey` (clé Google Cloud avec
l'API Places, restreinte au domaine du site) et `GOOGLE_AVIS.placeId`
(l'identifiant de la fiche Google d'Olivier). Les avis d'exemple seront
alors remplacés par les vrais avis, avec la note globale.
⚠️ Aucun avis Google public n'a été trouvé pour l'instant : les cartes
affichées sont des exemples, clairement marqués comme tels.

## Formulaire de devis
Le formulaire ouvre la messagerie du visiteur avec un email pré-rempli
adressé à `olivierlouette@hotmail.com` (adresse publiée sur la page
Facebook d'Olivier — modifiable via `EMAIL_DESTINATAIRE` dans `index.html`).
