# Dessine le Met

Dessine une forme au centre : les œuvres du Metropolitan Museum dont la silhouette ressemble le plus
à ton dessin apparaissent autour (30 max). Plus le dessin est détaillé, plus la sélection se resserre.

## Lancer

    python3 -m http.server 8765 -d site
    # puis ouvrir http://localhost:8765

(`site/index.html` s'ouvre aussi directement en double-cliquant.)

## Comment ça marche

- `build/fetch.py` récupère des œuvres « highlights » du Met (API publique, domaine public),
  télécharge chaque image et la réduit en 96×96 niveaux de gris (cache dans `build/cache/`).
  Le Met bloque les rafales : le script va à ~1 requête/s et reprend là où il s'est arrêté.
- `build/features.cjs` calcule pour chaque œuvre une signature de forme (contours orientés sur une
  grille 16×16) avec **le même code** (`site/features.js`) que celui appliqué au dessin dans le navigateur,
  et écrit `site/data/met-data.js`.
- Dans le navigateur, le dessin est réduit en 96×96, décrit de la même façon, puis comparé
  (similarité cosinus) à toutes les œuvres. Les meilleures sont placées autour du canevas,
  plus grandes quand elles ressemblent davantage.

## Descriptions

L'API publique du Met ne fournit pas le texte de présentation des œuvres, et les pages
metmuseum.org sont protégées contre l'accès automatisé. `build/enrich.py` récupère donc :
- depuis l'API du Met : nationalité de l'artiste, technique, culture, dimensions ;
- le résumé de l'article Wikipédia (anglais) lié à l'œuvre via l'identifiant Wikidata fourni par le Met,
  quand il existe. Sinon le panneau n'affiche que les informations du Met.

## Ajouter des œuvres

    pip install pillow numpy
    python3 build/fetch.py 1500     # nombre d'œuvres visé
    python3 build/enrich.py
    node build/features.cjs
