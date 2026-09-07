# Turning on daily ROAS for SBD Google Ads

**Status:** the daily Slack post already reports ROAS, but as a **rolling 30-day**
figure read off the `00-analysis` tab. One paste into Google Ads turns it into a
**daily** number with its own 7-day and month-to-date trend.

## Why it isn't daily yet

The `ads` tab's query never asked for conversion value:

```
SELECT segments.date, metrics.clicks, metrics.conversions, metrics.cost_micros
```

The value exists in the account — the `00-analysis` tab has been reporting it per
conversion action for months. It just never made it into the daily time series.

## The change (2 minutes)

`google-ads-script.js` in this folder is already updated. To deploy it:

1. Google Ads → **Tools** → **Bulk actions** → **Scripts**.
2. Open the existing SBD script (the one already on a Daily schedule).
3. Select all, delete, paste the whole updated `google-ads-script.js`.
4. **Run** once. Check the Sheet's `ads` tab: it should now end with three new
   columns — `Revenue value`, `Lead value`, `ROAS`.
5. Leave the Daily schedule as it is.

Nothing else needs touching. The client dashboard looks its columns up by header
name, so the five original columns keep working untouched, and the Slack agent
picks up the new ones automatically the first morning they appear.

## What the columns mean, and why there are two

Google Ads assigns value to five conversion actions, and they are not the same
kind of thing:

| Action | Category | 30d conv | 30d value |
|---|---|---|---|
| GA4 (web) purchase | PURCHASE | 22 | $8,048.83 |
| Booked Online (RT) | BOOK_APPOINTMENT | 3 | $917.00 |
| GA4 (web) booked_online | BOOK_APPOINTMENT | 1 | $299.00 |
| Calls From Ad Extension | PHONE_CALL_LEAD | 24 | $1,200.00 |
| Website Call (RT) | PHONE_CALL_LEAD | 4.5 | $0.00 |

`PURCHASE` and `BOOK_APPOINTMENT` carry real booking amounts. The phone-call
value is a flat assumption — 24 calls at exactly $50 each — which is a planning
figure, not money that arrived. So:

- **Revenue value** = PURCHASE + BOOK_APPOINTMENT. This is what ROAS divides by
  spend.
- **Lead value** = everything else, reported separately and never folded in.

Counting the call estimate would have put ROAS at 1.75x instead of **1.55x**.

## Two things to check in the account

1. **Possible double counting.** `GA4 (web) purchase`, `GA4 (web) booked_online`
   and `Booked Online (RT)` may all fire on the same booking from different
   tags. All five actions are primary (their conversions sum to the account
   total of 54.5), so any overlap is being counted twice and ROAS is overstated
   by that much. Worth an hour in the conversion-actions screen.
2. **ROAS understates phone bookings.** A customer who clicks an ad and then
   phones is recorded as a $50 lead, never as the job's real value. For a
   business where most bookings come by phone, real ROAS is materially higher
   than 1.55x. Closing that gap needs booking-level attribution in Fieldd, the
   same missing piece described in `KLAVIYO-REVENUE-ATTRIBUTION-GUIDE.md`.

## Also worth knowing

The 13-23 Aug conversion tracking break (4 conversions on 372 clicks, against
25 on 359 the fortnight before) sits inside the current 30-day ROAS window, so
today's figure is depressed by it. Daily ROAS will make a repeat of that
obvious within a day instead of a fortnight.
