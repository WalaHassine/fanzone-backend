# Requirements Traceability Matrix

> **Generated file — do not edit by hand.** Run `npm run test:trace` to refresh.
> Requirement IDs are extracted from test names, so this matrix reflects the suite
> exactly as it stands.

Source of requirements: [design-document.md](design-document.md) §7.
Testing approach: [test-strategy.md](test-strategy.md).

## Summary

| | |
|---|---|
| Backend functional requirements | 20 |
| Covered by tests | 2 |
| Not yet covered | 18 |
| Total tests in suite | 24 (24 passing, 0 failing) |

## Functional requirements (EF)

| ID | Requirement | Priority | Tests | Status |
|---|---|---|---|---|
| **EF-01** | Créer un compte via email et mot de passe | Haute | `src/modules/auth/dto/auth-dto.spec.ts` | ✅ 9 passing |
| **EF-02** | S'authentifier de manière sécurisée (JWT) | Haute | `src/modules/auth/dto/auth-dto.spec.ts` | ✅ 5 passing |
| **EF-03** | Sélectionner une ou plusieurs équipes favorites | Haute | — | ⬜ Not covered |
| **EF-04** | Définir sa ville / localisation | Moyenne | — | ⬜ Not covered |
| **EF-05** | Choisir une préférence d'ambiance | Moyenne | — | ⬜ Not covered |
| **EF-06** | Afficher la liste des matchs | Haute | — | ⬜ Not covered |
| **EF-07** | Filtrer les matchs par équipe | Haute | — | ⬜ Not covered |
| **EF-08** | Afficher les fan zones sur une carte interactive | Haute | — | — N/A (frontend) |
| **EF-09** | Afficher distance, capacité, disponibilité, équipes diffusées | Haute | — | ⬜ Not covered |
| **EF-10** | Check-in anonyme dans une fan zone | Haute | — | ⬜ Not covered |
| **EF-11** | Afficher une présence agrégée et anonyme par équipe | Haute | — | ⬜ Not covered |
| **EF-12** | Afficher le taux de remplissage d'une fan zone | Moyenne | — | ⬜ Not covered |
| **EF-13** | Recommander une fan zone adaptée au profil | Haute | — | ⬜ Not covered |
| **EF-14** | Fournir une explication textuelle de la recommandation | Haute | — | ⬜ Not covered |
| **EF-15** | Suggérer des alertes pertinentes | Moyenne | — | ⬜ Not covered |
| **EF-16** | Activer une alerte pour un match d'une équipe favorite | Moyenne | — | ⬜ Not covered |
| **EF-17** | Admin — ajouter et modifier des matchs | Haute | — | ⬜ Not covered |
| **EF-18** | Admin — ajouter et modifier des fan zones | Haute | — | ⬜ Not covered |
| **EF-19** | Admin — mettre à jour capacité, disponibilité, équipes, horaires | Haute | — | ⬜ Not covered |
| **EF-20** | Admin — consulter les statistiques de check-ins | Moyenne | — | ⬜ Not covered |
| **EF-21** | Générer automatiquement une description de fan zone | Basse | — | ⬜ Not covered |

## Non-functional requirements (ENF)

| ID | Requirement | Category | Tests | Status |
|---|---|---|---|---|
| **ENF-01** | Recommandation IA en moins de 3 secondes | Performance | — | ⬜ Not covered |
| **ENF-02** | Affichage de la carte en moins de 2 secondes | Performance | — | — N/A (frontend) |
| **ENF-03** | Mots de passe stockés hachés (bcrypt) | Sécurité | — | ⬜ Not covered |
| **ENF-04** | Accès administration restreint par rôle (RBAC) | Sécurité | — | ⬜ Not covered |
| **ENF-05** | Aucune donnée personnelle identifiable lors d'un check-in | Confidentialité | — | ⬜ Not covered |
| **ENF-06** | Interface responsive mobile et desktop | Utilisabilité | — | — N/A (frontend) |
| **ENF-07** | Gérer les erreurs de saisie sans interruption de service | Fiabilité | — | ⬜ Not covered |
| **ENF-08** | Code structuré en modules selon une architecture claire | Maintenabilité | — | — N/A (review) |
| **ENF-09** | Déployable sur environnements standards | Portabilité | — | — N/A (infra) |
| **ENF-10** | Compatible avec les navigateurs modernes | Compatibilité | — | — N/A (frontend) |
| **ENF-11** | Modèle de données extensible en géospatial (PostGIS) | Scalabilité | — | — N/A (review) |

## Legend

| Badge | Meaning |
|---|---|
| ✅ | Covered, all linked tests passing |
| ❌ | Covered, but at least one linked test failing |
| ⬜ | In scope for this repo, no tests yet |
| — | Out of backend scope (frontend, infra, or verified by code review) |
