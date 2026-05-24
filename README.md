# Daily Scéal 📰

**Foghlaim Gaeilge gach lá · Learn Irish every day**

[🌐 Live site](https://joelucadooley.github.io/daily-sceal)

Daily Scéal brings you real Irish news stories every day, with a simple slider to control how much of each article is in Irish. Start with just a few key words and work your way up at your own pace. No account, no pressure, no gamification — just read and pick up the language naturally.

---

## How it works

Each morning at 6:30am Irish time, a GitHub Action automatically:

1. Fetches the top stories from RTÉ News
2. Scrapes the full article text from each story page
3. Translates key words into Irish at 5 preset levels using the free [MyMemory](https://mymemory.translated.net/) translation API
4. Saves everything as a static `today.json` file
5. Deploys the updated site to GitHub Pages

Every user gets the same pre-generated content — no AI calls per user, no ongoing cost.

## The slider levels

| Level | % Irish | What's translated |
|-------|---------|-------------------|
| Beginner | 10% | Key nouns only |
| Elementary | 25% | Nouns and verbs |
| Intermediate | 50% | Most content words |
| Advanced | 75% | Near-fluent |
| As Gaeilge | 100% | Full immersion |

Tap any blue underlined word to see its English translation and hear it spoken aloud.

## The method

This approach is based on **comprehensible input** — a well-researched language learning theory that says we acquire language fastest when we understand most of what we're reading but are stretched just enough. The slider puts you in that sweet spot, wherever that is for you today.

## Tech stack

- [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- [GitHub Actions](https://github.com/features/actions) for daily generation
- [GitHub Pages](https://pages.github.com/) for hosting
- [MyMemory](https://mymemory.translated.net/) for free Irish translation
- News sourced from [RTÉ News](https://www.rte.ie/news/)
- Zero cost to run · No user accounts · No tracking

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
│       └── today.json   # Generated daily — do not edit manually
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

To generate fresh stories locally (requires internet access):

```bash
npm install @xmldom/xmldom
node scripts/generate.js
```

## About the Irish language

Irish (Gaeilge) is a Celtic language spoken natively in Gaeltacht communities along Ireland's western coast, and by communities worldwide. It is one of the oldest written languages in Europe, with a literary tradition stretching back 1,500 years. Despite centuries of decline, the language is experiencing a genuine revival — particularly among younger generations.

---

Created by [Joe Luca Dooley](https://github.com/joelucadooley) · Open source · Made with 💚 for the Irish language
