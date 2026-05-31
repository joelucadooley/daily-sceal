# Daily Scéal 📰

**Cad é an scéal? · Learn Irish through today's news**

**Live site:** [joelucadooley.github.io/daily-sceal](https://joelucadooley.github.io/daily-sceal) · **Instagram:** [@dailysceal](https://instagram.com/dailysceal)

[![Sponsor on GitHub](https://img.shields.io/badge/Sponsor%20on-GitHub-black?logo=github&style=for-the-badge)](https://github.com/joelucadooley)
[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/joelucadooley)

Daily Scéal takes real news from RTÉ and lets you read it at whatever level of Irish you like. A slider moves the balance from mostly English at one end towards fully Irish at the other. Tap any blue word to see what it means and hear it spoken.

---

## How it works

Each morning, a GitHub Action automatically:

1. Fetches the top stories from RTÉ News
2. Scrapes the full article text from each story page
3. Translates words into Irish at the preset levels using the free [MyMemory](https://mymemory.translated.net/) translation API
4. Saves everything as a static `today.json` file
5. Deploys the updated site to GitHub Pages

Every user gets the same pre-generated content. No AI calls per user, no ongoing cost.

## Levels

| Level | Irish | What gets translated |
|-------|-------|----------------------|
| Beginner | 10% | Key nouns only |
| Foundation | 25% | Nouns and verbs |
| Intermediate | 50% | Most content words |
| Advanced | 75% | Near-fluent |
| As Gaeilge | 100% | Full Irish (in development) |

The four active levels run on free machine translation, which works well at lower densities. Full, accurate Irish at the **As Gaeilge** level requires specialist linguistic resources and is the next goal for the project; in the app it is shown as a locked preview.

## The method

The approach draws on the idea of comprehensible input: you absorb a language best when you can follow most of what you are reading but meet enough unfamiliar words to learn from. Each level is built around that.

## Sharing

The reading view can generate a 1080×1080 share card for any story at the chosen level, drawn with the Canvas API (no external libraries). A private export page at `/#export` generates a full Instagram carousel for the day: a cover slide, one card per story, and a closing slide.

## Tech stack

- [React](https://react.dev/) and [Vite](https://vitejs.dev/)
- [GitHub Actions](https://github.com/features/actions) for daily generation
- [GitHub Pages](https://pages.github.com/) for hosting
- [MyMemory](https://mymemory.translated.net/) for Irish translation
- [GoatCounter](https://www.goatcounter.com/) for privacy-friendly analytics
- News sourced from [RTÉ News](https://www.rte.ie/news/)

## Project structure

```
daily-sceal/
├── src/
│   ├── App.jsx          # Main React app (feed, reader, export, share cards)
│   └── main.jsx         # Entry point
├── scripts/
│   └── generate.js      # Daily story generation script
├── public/
│   ├── og-image.png     # Social preview image
│   └── data/
│       └── today.json   # Generated daily, do not edit manually
├── .github/
│   └── workflows/
│       ├── daily.yml    # Runs generate.js each morning
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
