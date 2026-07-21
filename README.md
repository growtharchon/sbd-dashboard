# SB Mobile Detailing — Marketing Dashboard

A self-updating dashboard for SBD's Google Ads, Google Analytics (GA4), Search
Console, and optional Fieldd revenue performance. **Daily data, last 90 days.**

```
Google Ads ──► ads tab ─────┐
Google Analytics ► analytics┤─► ONE Google Sheet ──published CSV──► index.html
Search Console ─► search tab┘   (auto-synced daily)     (reads live on load)
Fieldd webhook ─► fieldd_revenue tab
```

## Status: LIVE ✅
`index.html` is already wired to the published Google Sheet (CSV links are in the
CONFIG block at the top of the file). Open it **over http** (hosted) and it pulls
real data. Note: opening the file directly by double-click (`file://`) will show
sample data — browsers block cross-site fetch from `file://`. Host it to see live data.

## Files
- **index.html** — the dashboard (the only file you host).
- **google-ads-script.js** — runs in Google Ads, writes the `ads` tab daily.
- **apps-script.gs** — runs in the Sheet, writes `analytics` + `search` daily,
  and can receive Fieldd webhooks into `fieldd_revenue`.
- **SETUP-GUIDE.md** — the full one-time setup walkthrough.
- **Time_series(...).csv** — original raw export (reference only).

## Keep it updating automatically
1. **Google Ads:** the script is scheduled **Daily** (Ads → Tools → Scripts → Schedule).
2. **GA4 + Search Console:** each has a **daily time-trigger** (Apps Script → Triggers).
3. **Sheet stays Published to web** (do not unpublish) so the dashboard can read it.

That's it — every morning the Sheet refreshes; whenever someone opens the
dashboard it redraws with the latest. No exports, no downloads, no rebuilds.

## Host it on GitHub Pages (free)
1. github.com → **New repository** → name `sbd-dashboard` → **Public** → Create.
2. **Add file → Upload files** → drag in **index.html** → **Commit**.
3. **Settings → Pages → Source: Deploy from a branch → main → /(root) → Save**.
4. Wait ~1 min → your link: `https://<your-username>.github.io/sbd-dashboard/`

Send that link to the client. To change the design later, edit `index.html` and
re-upload; the data keeps flowing on its own.

## Notes
- Search Console data always lags ~2–3 days (Google's own delay) — normal.
- Metrics shown: Ads (spend, conversions, CPL, clicks) · GA4 (sessions, users,
  engaged, page views, key events) · Search (clicks, impressions, CTR, position)
  · optional Fieldd revenue events.
- Funnel / CAC / closed-won still needs CRM or lead-sheet data — not in any Google
  source. Add that source if you want that section.
