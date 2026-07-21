# SBD Dashboard — Full Setup Guide (Option A: auto-fed, no downloads)

**End state:** one Google Sheet with tabs (`ads`, `analytics`, `search`, plus
optional `fieldd_revenue`), each
refilled automatically every day by Google's own servers. The dashboard
(`index.html`, hosted on GitHub Pages) reads the Sheet live. After setup, **you
never download or export anything again.**

```
Google Ads ──► ads tab ─────┐
Google Analytics ► analytics┤─► ONE Google Sheet ──published as CSV──► index.html
Search Console ─► search tab┘
Fieldd webhook ─► fieldd_revenue tab
```

Work top to bottom. Each part is independent — if one connector isn't ready, the
others still work.

---

## PART 0 — Create the Sheet (2 min)

1. Go to **sheets.google.com** → **Blank spreadsheet**.
2. Rename it (top-left): `SBD Marketing Dashboard`.
3. At the bottom, make **three tabs** named exactly (lowercase):
   `ads`  ·  `analytics`  ·  `search`
   (Double-click a tab to rename; click **+** to add more.)
4. Leave them empty — the scripts fill them.

> ✅ Use this same Google account for everything below. It must have access to
> SBD's Google Ads account, GA4 property, and Search Console.

---

## PART 1 — Google Ads → `ads` tab

**File:** `google-ads-script.js`

1. Copy the Sheet's URL from your browser bar (the whole `https://docs.google.com/spreadsheets/d/..../edit` string).
2. Open **Google Ads** → top menu **Tools** → **Bulk actions** → **Scripts**.
   - *If "Scripts" is greyed out / missing:* your login is read-only. Ask whoever
     owns the account for **Standard** access, then come back.
3. Click the blue **+** → you get a code editor.
4. Delete the sample code, paste **all** of `google-ads-script.js`.
5. Near the top, set:
   - `SHEET_URL` = the URL you copied (keep the quotes).
   - Leave `TAB_NAME = "ads"`.
6. Click **Authorize** → choose your Google account → **Allow**.
7. Click **Run**. Wait ~30s. Open the Sheet — the `ads` tab should now have rows.
8. Click **Schedule** → **Frequency: Daily** → save. ✅ Ads now updates itself.

---

## PART 2 — Google Analytics (GA4) + Search Console → `analytics` / `search` tabs

**File:** `apps-script.gs` — this one lives *inside the Sheet*.

### 2a. Find your two IDs first
- **GA4 property ID:** in Google Analytics → **Admin** (bottom-left gear) →
  **Property settings** → copy the **Property ID** (a number like `345678901`).
- **Search Console URL:** in Search Console, the property is either
  - a **URL-prefix** property → use it exactly, e.g. `https://sbd-example.com/`
    (include `https://` and the trailing `/`), **or**
  - a **Domain** property → use `sc-domain:sbd-example.com` (no https, no slash).

### 2b. Paste the script
1. In the Sheet: **Extensions** → **Apps Script**. A new tab opens.
2. Delete the sample `function myFunction(){}` and paste **all** of `apps-script.gs`.
3. At the top, fill in `GA4_PROPERTY_ID` and `GSC_SITE_URL` (keep the quotes).

### 2c. Turn on the GA4 service
1. Left sidebar → **Services** (the **+** next to "Services").
2. Find **Google Analytics Data API** → **Add**.

### 2d. Set the permissions (manifest)
1. Left sidebar → **Project Settings** (gear icon).
2. Tick **“Show ‘appsscript.json’ manifest file in editor.”**
3. Left sidebar → **Editor** (`< >`) → open **appsscript.json**.
4. Replace its contents with this (keep your own `timeZone` if you prefer):

```json
{
  "timeZone": "America/New_York",
  "dependencies": {
    "enabledAdvancedServices": [
      { "userSymbol": "AnalyticsData", "serviceId": "analyticsdata", "version": "v1beta" }
    ]
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/script.external_request"
  ],
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}
```
5. **Save** (Ctrl/Cmd-S).

### 2e. Run + authorize each function
1. In the function dropdown (toolbar) pick **pullGA4** → **Run**.
   - First run pops an auth screen → your account → **Advanced** →
     “Go to (project) (unsafe)” is normal for your own script → **Allow**.
   - Open the Sheet → `analytics` tab should fill with monthly rows.
   - *If it errors on `keyEvents`*, open the script, change `"keyEvents"` to
     `"conversions"`, save, run again.
2. Pick **pullSearchConsole** → **Run** → authorize.
   - Open the Sheet → `search` tab should fill.
   - *If it errors*, double-check `GSC_SITE_URL` matches your property type
     (url-prefix vs `sc-domain:`) exactly.

### 2f. Schedule them
1. Left sidebar → **Triggers** (clock icon) → **+ Add Trigger** (bottom-right).
2. Function: **pullGA4** · Event source: **Time-driven** · **Day timer** ·
   pick an early-morning hour → **Save**.
3. Repeat **+ Add Trigger** for **pullSearchConsole**.
   ✅ GA4 + Search Console now update themselves daily.

---

### 2g. Optional: Fieldd webhook → `fieldd_revenue`

Use this if Fieldd's Toolkit has **Webhooks**.

1. In Apps Script, keep using the same `apps-script.gs` file.
2. Optional but recommended: Project Settings → **Script Properties** → add:
   - Property: `FIELDD_WEBHOOK_SECRET`
   - Value: any private random string
3. Top-right **Deploy** → **New deployment**.
4. Type: **Web app**.
5. Execute as: **Me**.
6. Who has access: **Anyone**.
7. Deploy, authorize, and copy the Web App URL.
8. In Fieldd Toolkit → Webhooks, paste the URL.
   - If you set a secret, use: `WEB_APP_URL?token=YOUR_SECRET`
9. Choose the closest event to actual revenue:
   - Best: `payment received`, `invoice paid`, or `job completed`.
   - Okay for testing: `booking created` or `job updated`.
10. Send a test webhook. The Sheet should create a new `fieldd_revenue` tab.

The first test stores the full raw payload in the last column, so we can confirm
Fieldd's exact revenue, status, customer, and attribution field names before
turning it into dashboard ROAS.

---

## PART 3 — Publish the tabs as CSV

For **each** tab (`ads`, `analytics`, `search`, and `fieldd_revenue` if using Fieldd):

1. **File** → **Share** → **Publish to web**.
2. In the dialog: left dropdown = the tab (e.g. `ads`); right dropdown =
   **Comma-separated values (.csv)**.
3. **Publish** → confirm → **copy the link** (ends in `output=csv`).

You now have **3 CSV URLs**, or **4** if you also published `fieldd_revenue`.
Send them to me — I'll drop them into the dashboard.

> These links always return the *current* tab contents, so the dashboard is
> always live against the latest data.

---

## PART 4 — Wire up + host the dashboard

1. In `index.html`, the config block will hold your three URLs:
   ```js
   const ADS_CSV       = "…output=csv";
   const ANALYTICS_CSV = "…output=csv";
   const SEARCH_CSV    = "…output=csv";
   ```
   (I'll finalize this once you send the URLs.)
2. **Host on GitHub Pages:** create a repo, upload `index.html`,
   **Settings → Pages → Deploy from branch → main → /(root) → Save**.
3. You get a public link to share with SBD. Upload once; it shows live data forever.

---

## Daily reality after setup
- **Overnight:** the Ads Script + the two Apps Script triggers refill the Sheet.
- **Anytime the link is opened:** the dashboard pulls the latest and redraws.
- **You:** do nothing. No exports, no downloads, no rebuilds.

## What each source provides
| Tab | Metrics |
|---|---|
| `ads` | Spend, Clicks, Conversions, Cost/conv. (quarterly) |
| `analytics` | Sessions, Users, Engaged sessions, Page views, Key events (monthly) |
| `search` | Clicks, Impressions, CTR, Avg position (monthly) |
| `fieldd_revenue` | Fieldd webhook events, paid/completed revenue, raw payload |

*(Funnel / CAC / closed-won still needs a CRM or lead sheet — not in any of these
three Google sources. Tell me where SBD tracks deals if you want that section.)*
