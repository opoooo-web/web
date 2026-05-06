# Musk's Palimpsest

Static-first automated news framework using GitHub Actions and Cloudflare Pages.

## How It Works

1. `src/collector.mjs` fetches configured RSS or Atom feeds.
2. Items are normalized, deduplicated, sorted, and written to `public/data/news.json`.
3. `src/enrich-xai.mjs` optionally uses xAI/Grok search to write `external-signals.json` when `XAI_API_KEY` is configured.
4. GitHub Actions uses `google-github-actions/run-gemini-cli` to generate `daily-brief.json` and `topics.json` from collected source data when `GEMINI_API_KEY` is configured.
5. `src/enrich-gemini.mjs` validates Gemini CLI output. If the CLI step is skipped or the files are missing, it writes a deterministic local fallback.
6. `src/prepare-data.mjs` writes `latest.json`, `manifest.json`, and paginated `pages/*.json`.
7. Vite builds the static interface from `index.html` and `src/main.js` into `dist/`.
8. GitHub Actions runs hourly at minute 17 and commits generated output.
9. Cloudflare Pages serves the built site as static files.

This keeps the first version close to zero cost because page views do not invoke Cloudflare Workers.

## Local Commands

```bash
npm test
npm run dev
npm run collect
npm run enrich:xai
npm run enrich:gemini
npm run prepare:data
npm run build
npm run update
```

## Configure Sources

Edit `src/config.mjs`:

```js
export const sources = [
  {
    id: 'example',
    name: 'Example',
    category: 'Tech',
    url: 'https://example.com/rss.xml'
  }
];
```

Use RSS, Atom, or official APIs where possible. Avoid republishing full article text unless you have permission.

The default source set now covers AI labs, infrastructure vendors, developer platforms, technology media, Hacker News, and science/future-oriented feeds. Each source is isolated during collection, so one failed feed is recorded in `public/data/status.json` without blocking the rest of the site.

## Gemini Enrichment

Add `GEMINI_API_KEY` as a GitHub Actions secret to enable Gemini CLI daily briefs during the scheduled update job. The workflow uses the official `google-github-actions/run-gemini-cli` action and asks it to edit `public/data/daily-brief.json` and `public/data/topics.json` directly. Optionally set repository variable `GEMINI_MODEL`; the default is `gemini-2.5-flash`.

After Gemini CLI runs, the local `npm run enrich:gemini` step validates the generated files. Without a key, or if the CLI output is missing, the pipeline still succeeds and writes `daily-brief.json` using source metadata. This keeps local development and free static deployment stable.

## xAI / Grok External Signals

Add `XAI_API_KEY` as a GitHub Actions secret to enable optional xAI/Grok search enrichment. The script writes `public/data/external-signals.json` and is safe to run without a key.

Optional repository variable:

- `XAI_MODEL`: defaults to `grok-4.20`

This is not an X RSS replacement. X does not provide official RSS feeds, so xAI is used only as a conservative external-signal layer. The main dataset still comes from RSS/Atom feeds, and every external signal must include a source URL.

## Static Data Shape

- `public/data/latest.json`: first page for fast initial load
- `public/data/pages/*.json`: paginated archives for the Load more button
- `public/data/manifest.json`: total counts, categories, source counts, and feed errors
- `public/data/daily-brief.json`: model-assisted or fallback editorial synthesis
- `public/data/topics.json`: topic summaries for UI and future search
- `public/data/external-signals.json`: optional xAI/Grok search signals

## Cloudflare Pages Setup

Create a Pages project connected to the GitHub repository.

- Build command: `npm run build`
- Build output directory: `dist`
- Production branch: `main`

If you let GitHub Actions commit generated data files, Cloudflare Pages can build the Vite app from committed `public/data/*.json` without fetching feeds during the Pages build.

## Growth Path

- Add Cloudflare Workers only for dynamic APIs or cache endpoints.
- Add KV for cached category snapshots.
- Add D1 when you need structured search, source management, or analytics.
- Add paid monitoring once the update workflow becomes business-critical.
