# Cloner Collegue CLI v2

Outil en ligne de commande pour transformer n'importe quel collegue en **double numerique IA**.

Tu fournis ses messages, emails et documents. L'outil genere une IA qui travaille et communique exactement comme lui/elle. Ensuite, tu discutes avec le clone directement dans le terminal.

Fonctionne avec **Claude, ChatGPT, Mistral et Ollama** (modeles locaux).

---

## Installation

```bash
git clone <url-du-repo> cloner-collegue-cli
cd cloner-collegue-cli
npm install
```

### Installation globale (optionnel)

```bash
npm link
```

Apres ca, la commande `cloner` est disponible partout dans ton terminal.

---

## Configuration

### Option 1 — Fichier .env

```bash
cp .env.example .env
# Edite .env avec tes cles API
```

### Option 2 — Mode interactif

```bash
cloner config
```

### Option 3 — Commande directe

```bash
cloner config --set claude.apiKey=sk-ant-xxx
cloner config --set openai.apiKey=sk-xxx
cloner config --set defaultProvider=openai
```

### Voir la config actuelle

```bash
cloner config --show
```

---

## Utilisation

### Creer un clone

```bash
cloner clone                    # Avec Claude (defaut)
cloner clone -p openai          # Avec ChatGPT
cloner clone -p mistral         # Avec Mistral
cloner clone -p ollama          # Avec un modele local
cloner clone -p claude -m claude-opus-4-20250514  # Modele specifique
```

L'outil te guide en 3 phases interactives :
1. Infos de base (prenom, poste, personnalite)
2. Import des materiaux (fichiers, messages, texte libre)
3. Modelisation automatique par l'IA

### Discuter avec un clone

```bash
cloner chat marie-dupont                  # Clone complet
cloner chat marie-dupont --metier         # Profil metier uniquement
cloner chat marie-dupont --comportement   # Empreinte comportementale
cloner chat marie-dupont -p openai        # Utiliser ChatGPT pour la conversation
```

### Enrichir un clone

```bash
cloner enrichir marie-dupont
```

Ajoute des materiaux supplementaires sans ecraser l'existant. Le clone evolue et la version s'incremente.

### Lister les clones

```bash
cloner liste
```

### Supprimer un clone

```bash
cloner supprimer marie-dupont
```

---

## Fournisseurs IA supportes

| Fournisseur | Flag | Modeles disponibles |
|-------------|------|---------------------|
| **Claude** (Anthropic) | `-p claude` | claude-sonnet-4-20250514, claude-opus-4-20250514, claude-haiku-4-20250414 |
| **ChatGPT** (OpenAI) | `-p openai` | gpt-4o, gpt-4o-mini, gpt-4-turbo, o3-mini |
| **Mistral** | `-p mistral` | mistral-large-latest, mistral-medium-latest, mistral-small-latest |
| **Ollama** (local) | `-p ollama` | llama3.1, mistral, gemma2, phi3 |

Tu peux meme utiliser un provider pour creer le clone et un autre pour discuter avec.

---

## Ce qui est genere

Pour chaque clone, un dossier `colleagues/{slug}/` :

```
colleagues/marie-dupont/
├── clone.md          ← double complet (metier + comportement)
├── work.md           ← profil metier
├── persona.md        ← empreinte comportementale (6 strates)
├── meta.json         ← metadonnees et historique
├── versions/         ← snapshots de chaque version
└── knowledge/        ← materiaux sources classes
    ├── emails/
    ├── messages/
    ├── documents/
    └── notes/
```

### Profil metier (work.md)

Comment la personne travaille : perimetre, processus, standards, convictions.

### Empreinte comportementale (persona.md)

Comment la personne communique et reagit, en 6 strates :

| Strate | Contenu |
|--------|---------|
| 1 — ADN comportemental | Regles d'action non-negociables |
| 2 — Carte d'identite | Poste, MBTI, rapport au travail |
| 3 — Voix et ton | Tics de langage, exemples de formulations |
| 4 — Reflexes de decision | Declencheurs, refus, gestion de l'incertitude |
| 5 — Posture relationnelle | Hierarchie, pairs, pression |
| 6 — Zones de friction | Inconfort et limites |

---

## Exemple complet

```
$ cloner clone

╔══════════════════════════════════════════════╗
║  🧬  CLONER COLLEGUE  v2.0                   ║
║  Par Kuate Joel Parfait                      ║
╚══════════════════════════════════════════════╝

  ── Phase 1 — Informations de base ──

  👤 Comment s'appelle ce collegue ? Thomas Martin
  ℹ Slug genere : thomas-martin

  🏢 Decris son profil : PM senior chez BNP, homme
  🧠 Decris sa personnalite : ENFJ, politique, style grand groupe

  ── Recapitulatif ──
  Prenom       Thomas Martin (/thomas-martin)
  Poste        PM chez BNP
  Personnalite politique
  Culture      style grand groupe

  ── Phase 2 — Import des materiaux ──

  📥 Comment veux-tu importer ?
  > 💬 Messages copies
  ✓ Recu : 847 mots de messages
  > ✅ Termine

  ── Phase 3 — Modelisation ──

  ℹ Utilisation de Claude (claude-sonnet-4-20250514)
  ✓ Modelisation terminee
  ✓ Clone construit

  ┌────────────────────────────────────────────────┐
  │  Clone cree : /thomas-martin                    │
  ├────────────────────────────────────────────────┤
  │  cloner chat thomas-martin  → discuter          │
  │  cloner enrichir thomas-martin → ajouter        │
  └────────────────────────────────────────────────┘

$ cloner chat thomas-martin

  ── Conversation avec Thomas Martin ──

  toi > Thomas, on lance la feature sans validation legal ?
  Thomas Martin : Ecoute, je comprends l'urgence, mais on ne peut
  pas se permettre de court-circuiter le process. Je propose qu'on
  cale un point rapide avec legal demain matin.
```

---

## Architecture du projet

```
cloner-collegue-cli/
├── bin/
│   └── cloner.js               ← point d'entree CLI
├── src/
│   ├── cli/                    ← commandes (clone, chat, liste, etc.)
│   ├── core/                   ← logique metier (intake, analyzer, builder)
│   ├── prompts/                ← templates de prompts systeme
│   ├── providers/              ← adaptateurs IA (Claude, OpenAI, Mistral, Ollama)
│   ├── storage/                ← gestion des fichiers clones
│   └── utils/                  ← config, UI terminal
├── colleagues/                 ← clones generes (gitignored)
├── .env.example
└── package.json
```

---

## Vie privee

Toutes les donnees restent **100% en local** dans le dossier `colleagues/`. Les API sont appelees uniquement pour la modelisation et la conversation — aucun stockage cote serveur.

---

## Auteur

Concu et developpe par **Kuate Joel Parfait** — **Digital House Company**
https://www.linkedin.com/in/joelparfaitkuate/

## Licence

MIT — Copyright (c) 2026 Kuate Joel Parfait / Digital House Company
