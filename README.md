# Daily Scéal

**Foghlaim Gaeilge gach lá · Learn Irish every day**

[Live site](https://joelucadooley.github.io/daily-sceal)

Daily Scéal takes real news from RTÉ and lets you read it at whatever level of Irish you like. A slider moves the balance from mostly English at one end to fully Irish at the other. Tap any blue word to see what it means and hear it spoken.

---

## How it works

Each morning at 6:30am Irish time, a GitHub Action automatically:

1. Fetches the top stories from RTÉ News
2. Scrapes the full article text from each story page
3. Translates key words into Irish at five preset levels using the free [MyMemory](https://mymemory.translated.net/) translation API
4. Saves everything as a static `today.json` file
5. Deploys the updated site to GitHub Pages

Every user gets the same pre-generated content. No AI calls per user, no ongoing cost.

## Levels

| Level | Irish | What gets translated |
|-------|-------|----------------------|
| Beginner | 10% | Key nouns only |
| Elementary | 25% | Nouns and verbs |
| Intermediate | 50% | Most content words |
| Advanced | 75% | Near-fluent |
| As Gaeilge | 100% | Full Irish |

## The method

The approach draws on a well-established idea in language learning: you absorb a language best when you can follow most of what you are reading but encounter enough unfamiliar words to learn from. The five levels are designed around that principle.

## Tech stack

- [React](https://react.dev/) and [Vite](https://vitejs.dev/)
- [GitHub Actions](https://github.com/features/actions) for daily generation
- [GitHub Pages](https://pages.github.com/) for hosting
- [MyMemory](https://mymemory.translated.net/) for Irish translation
- News sourced from [RTÉ News](https://www.rte.ie/news/)

## Project structure

```
daily-sceal/
├── src/
│   ├── App.jsx          # Main React app
│   └── main.jsx         # Entry point
├── scripts/
│   └── generate.js      # Daily story generation script
├── public/
│   └── data/
│       └── today.json   # Generated daily, do not edit manually
├── .github/
│   └── workflows/
│       ├── daily.yml    # Runs generate.js every morning at 6:30am IST
│       └── deploy.yml   # Deploys to GitHub Pages on every push
├── index.html
├── vite.config.js
└── package.json
```

## Running locally

```bash
npm install
npm run dev
```

To generate fresh stories locally:

```bash
npm install @xmldom/xmldom
node scripts/generate.js
```

---

Created by [Joe Luca Dooley](https://github.com/joelucadooley) · Open source · Made with 💚 for the Irish language
