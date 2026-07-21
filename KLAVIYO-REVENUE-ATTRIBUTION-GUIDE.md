# Klaviyo Revenue Attribution Setup Guide

This guide explains how to track revenue from Klaviyo email/SMS campaigns into
the SBD dashboard.

The goal is to answer:

> Which Klaviyo campaign generated booked/completed revenue?

The current dashboard can show Klaviyo sends, recipients, clicks, and CTR. It
cannot accurately show Klaviyo revenue yet because the current revenue CSV only
contains:

```csv
Job Completed On,Total Billed
```

To attribute revenue, every completed/paid booking needs campaign attribution
fields such as:

```text
utm_source
utm_medium
utm_campaign
customer email or phone
paid amount / total billed
booking or job id
```

## Recommended End State

If BigQuery is being set up for Fieldd revenue, use BigQuery as the source of
truth. This is the cleaner and more reliable path.

Recommended BigQuery-first flow:

```text
Klaviyo campaign link with UTMs
        ↓
SBD booking page / Fieldd booking flow
        ↓
Fieldd stores UTMs on the booking/customer/job
        ↓
Fieldd revenue lands in BigQuery
        ↓
BigQuery table stores event-level revenue + attribution
        ↓
Dashboard reads grouped revenue by Klaviyo campaign/channel
```

Temporary Apps Script fallback flow:

```text
Klaviyo campaign link with UTMs
        ↓
SBD booking page / Fieldd booking flow
        ↓
Fieldd stores UTMs on the booking/customer/job
        ↓
Fieldd webhook sends completed/paid booking data to Google Apps Script
        ↓
Google Sheet fieldd_revenue tab stores revenue + attribution
        ↓
Dashboard groups revenue by Klaviyo campaign
```

Optional but recommended:

```text
Fieldd webhook
        ↓
Apps Script sends a "Fieldd Paid Booking" event back into Klaviyo
        ↓
Klaviyo campaign reports can use the revenue metric
```

## BigQuery Recommendation

If Fieldd revenue is going into BigQuery, do not build the final Klaviyo revenue
attribution from the manual billed CSV or a fragile Google Sheet export.

The manual revenue CSV is useful for a temporary trend chart, but it is not
enough for campaign attribution because it only has:

```text
date
total billed
```

Klaviyo attribution needs event-level revenue rows. BigQuery should contain one
row per booking, job, invoice, or payment event with stable identifiers and UTM
fields.

Target BigQuery fields:

```text
booking_id
job_id
invoice_id
customer_id
customer_email
customer_phone
job_completed_at
payment_received_at
status
payment_status
total_amount
paid_amount
currency
source
utm_source
utm_medium
utm_campaign
utm_content
utm_term
created_at
updated_at
raw_payload
```

Minimum fields needed for Klaviyo campaign revenue:

```text
booking_id or job_id
customer_email or customer_phone
paid_amount or total_amount
job_completed_at or payment_received_at
payment_status or status
utm_source
utm_medium
utm_campaign
```

Best implementation order if BigQuery is coming:

1. Add UTMs to Klaviyo links now.
2. Get Fieldd revenue into BigQuery.
3. Confirm BigQuery rows include UTM fields.
4. Deduplicate revenue in BigQuery by booking/job/invoice id.
5. Build a BigQuery view for Klaviyo-attributed revenue.
6. Connect the dashboard to that view/export.
7. Optionally send paid booking events back into Klaviyo.

Do not wait to add UTMs. UTMs should be added immediately so future campaign
traffic starts collecting attribution data. But wait for BigQuery before
building the final revenue attribution logic.

### Recommended BigQuery View

Create a view similar to:

```sql
CREATE OR REPLACE VIEW analytics.klaviyo_revenue_attribution AS
SELECT
  LOWER(TRIM(utm_campaign)) AS utm_campaign,
  LOWER(TRIM(utm_medium)) AS channel,
  COUNT(DISTINCT COALESCE(invoice_id, job_id, booking_id)) AS orders,
  SUM(COALESCE(paid_amount, total_amount, 0)) AS revenue,
  MIN(DATE(COALESCE(payment_received_at, job_completed_at, created_at))) AS first_revenue_date,
  MAX(DATE(COALESCE(payment_received_at, job_completed_at, created_at))) AS last_revenue_date
FROM analytics.fieldd_revenue
WHERE LOWER(TRIM(utm_source)) = 'klaviyo'
  AND COALESCE(paid_amount, total_amount, 0) > 0
  AND LOWER(COALESCE(payment_status, status, '')) IN ('paid', 'completed', 'succeeded', 'complete')
GROUP BY 1, 2;
```

Adjust table and field names to match the actual BigQuery schema.

### Codex/Claude Prompt For BigQuery-First Attribution

Use this prompt once the Fieldd BigQuery table exists:

```text
We now have Fieldd revenue in BigQuery. Build Klaviyo revenue attribution from
BigQuery instead of the manual billed CSV.

Tasks:

1. Inspect the BigQuery Fieldd revenue schema.
2. Identify fields for booking/job/invoice id, customer email/phone, paid amount,
   completed/paid date, status, payment status, utm_source, utm_medium, and
   utm_campaign.
3. Create a deduped query or view for Klaviyo-attributed revenue.
4. Include only rows where utm_source = klaviyo.
5. Use paid_amount if available, otherwise total_amount.
6. Count only positive revenue.
7. Deduplicate by invoice_id, job_id, or booking_id.
8. Group by utm_campaign and utm_medium.
9. Expose this data to the dashboard through the project's preferred route
   (published CSV, API endpoint, or static export).
10. Update the dashboard's Email & SMS section to show:
    Campaign, Channel, Clicks, Orders, Revenue, Revenue / Click.
11. Keep the manual Revenue trend section intact unless told otherwise.
12. Verify with a local browser before pushing.
```

## Part 1 - Create a UTM Naming System

Use the same naming format every time. Do not improvise campaign names.

Recommended values:

```text
utm_source=klaviyo
utm_medium=email
utm_campaign=july_13_flash
```

For SMS:

```text
utm_source=klaviyo
utm_medium=sms
utm_campaign=july_13_flash
```

Use lowercase, no spaces, and underscores between words.

Good campaign names:

```text
july_13_flash
july_6_flash
ceramic_coating_push
maintenance_plan_reminder
fathers_day_offer
```

Bad campaign names:

```text
July 13 Flash
JULY FLASH!!!
email campaign 1
test
```

Why this matters:

- The dashboard groups rows by exact `utm_campaign`.
- `July 13 Flash`, `july_13_flash`, and `July_13_flash` would count as three
  different campaigns.
- Consistent naming makes revenue reporting clean.

## Part 2 - Add UTMs To Klaviyo Campaign Links

In Klaviyo, open the campaign email or SMS.

For every link that sends users to the booking site, add UTM parameters.

Example original link:

```text
https://sbmobiledetailing.com/book
```

Email campaign link:

```text
https://sbmobiledetailing.com/book?utm_source=klaviyo&utm_medium=email&utm_campaign=july_13_flash
```

SMS campaign link:

```text
https://sbmobiledetailing.com/book?utm_source=klaviyo&utm_medium=sms&utm_campaign=july_13_flash
```

If the URL already has a question mark, use `&` instead of `?`.

Example original link:

```text
https://sbmobiledetailing.com/book?service=detail
```

Correct UTM version:

```text
https://sbmobiledetailing.com/book?service=detail&utm_source=klaviyo&utm_medium=email&utm_campaign=july_13_flash
```

Do this for:

- Header buttons
- Body buttons
- Text links
- Image links
- Footer CTA links
- SMS short links, if Klaviyo lets you edit the destination URL before shortening

## Part 3 - Test The UTM Links Before Sending

Before sending the campaign, click every CTA in preview/test mode.

Confirm the browser address bar includes:

```text
utm_source=klaviyo
utm_medium=email
utm_campaign=...
```

For SMS, confirm:

```text
utm_source=klaviyo
utm_medium=sms
utm_campaign=...
```

If the UTM disappears after clicking through to booking, attribution may break.
That means the booking site or Fieldd flow is dropping URL parameters.

## Part 4 - Verify Fieldd Captures UTMs

This is the most important step.

Create one test campaign link:

```text
https://sbmobiledetailing.com/book?utm_source=klaviyo&utm_medium=email&utm_campaign=test_utm_capture
```

Then:

1. Open the link in a browser.
2. Start a test booking.
3. Complete enough of the booking flow for Fieldd to create a booking/job.
4. Check Fieldd admin for the booking.
5. Look for fields like:
   - Source
   - Lead source
   - UTM source
   - UTM medium
   - UTM campaign
   - Referrer
   - Notes
   - Custom fields
6. If Fieldd creates a webhook row in Google Sheets, inspect the raw JSON column.

The current Apps Script already attempts to store these fields:

```text
Source
UTM Source
UTM Campaign
Raw JSON
```

If `Raw JSON` contains UTM data but the columns are blank, Codex/Claude can
update the parser.

If `Raw JSON` does not contain UTM data, Fieldd is not passing the attribution
through the webhook.

## Part 5 - What The Fieldd Revenue Sheet Should Contain

The target `fieldd_revenue` tab should eventually have rows like:

```csv
Received At,Event,Fieldd ID,Customer,Email,Phone,Service Date,Status,Payment Status,Total,Paid Amount,Currency,Source,UTM Source,UTM Medium,UTM Campaign,Raw JSON
2026-07-14 12:30:00,job.completed,abc123,John Smith,john@example.com,5551234567,2026-07-14,completed,paid,299,299,USD,klaviyo,klaviyo,email,july_13_flash,{...}
```

Important fields:

- `Fieldd ID`: prevents duplicate revenue.
- `Email` or `Phone`: lets Klaviyo match the event to a profile.
- `Paid Amount` or `Total`: used as revenue.
- `UTM Source`: must be `klaviyo`.
- `UTM Medium`: should be `email` or `sms`.
- `UTM Campaign`: campaign name.
- `Payment Status` / `Status`: used to count only real paid/completed revenue.

## Part 6 - Update Apps Script To Store UTM Medium

The current Apps Script already has `UTM Source` and `UTM Campaign`. Add
`UTM Medium` too.

Ask Codex/Claude:

```text
In apps-script.gs, update the Fieldd webhook parser so the fieldd_revenue tab
stores UTM Medium between UTM Source and UTM Campaign.

Keep backwards compatibility with the existing sheet. Parse utm_medium from
these possible paths:

- utm_medium
- utm.medium
- utmMedium
- metadata.utm_medium
- data.attributes.utm_medium

Also keep source, utm_source, and utm_campaign parsing unchanged.
Do not change GA4, Search Console, or Klaviyo pull functions.
```

Expected header after the change:

```js
[
  "Received At", "Event", "Fieldd ID", "Customer", "Email", "Phone",
  "Service Date", "Status", "Payment Status", "Total", "Paid Amount",
  "Currency", "Source", "UTM Source", "UTM Medium", "UTM Campaign", "Raw JSON"
]
```

## Part 7 - Send Paid Booking Events Back To Klaviyo

This is optional, but it is the best long-term setup.

Klaviyo supports custom events through its Events API. An event is tied to:

- a metric name, such as `Fieldd Paid Booking`
- a profile, identified by email or phone
- optional `value`, such as the paid amount
- optional properties, such as booking id and UTM fields

Klaviyo docs:

- https://developers.klaviyo.com/en/reference/create_event
- https://developers.klaviyo.com/en/reference/events_api_overview

### Required Klaviyo API Key

In Google Apps Script:

1. Open Project Settings.
2. Open Script Properties.
3. Add:

```text
KLAVIYO_KEY = your_private_klaviyo_api_key
```

Do not paste the private key into code.

### Event Payload Shape

When a paid/completed Fieldd booking comes in, Apps Script should send this to
Klaviyo:

```json
{
  "data": {
    "type": "event",
    "attributes": {
      "time": "2026-07-14T12:30:00Z",
      "value": 299,
      "unique_id": "fieldd-abc123-paid",
      "properties": {
        "fieldd_id": "abc123",
        "service_date": "2026-07-14",
        "status": "completed",
        "payment_status": "paid",
        "utm_source": "klaviyo",
        "utm_medium": "email",
        "utm_campaign": "july_13_flash"
      },
      "metric": {
        "data": {
          "type": "metric",
          "attributes": {
            "name": "Fieldd Paid Booking"
          }
        }
      },
      "profile": {
        "data": {
          "type": "profile",
          "attributes": {
            "email": "customer@example.com"
          }
        }
      }
    }
  }
}
```

If email is not available but phone is available, use phone number as the profile
identifier.

### Codex/Claude Prompt To Add Klaviyo Event Sending

Use this prompt:

```text
Update apps-script.gs so Fieldd paid/completed bookings are also sent to Klaviyo
as a custom event named "Fieldd Paid Booking".

Requirements:

1. Use Script Property KLAVIYO_KEY for the private API key.
2. Do not hard-code any secrets.
3. Trigger only when the Fieldd event appears paid or completed.
4. Use Paid Amount if present, otherwise Total.
5. Do not send an event if revenue is missing or zero.
6. Use email as the Klaviyo profile identifier when available.
7. If email is missing and phone exists, use phone_number.
8. Include value equal to the paid revenue amount.
9. Include unique_id based on Fieldd ID and payment status to prevent duplicates.
10. Include properties:
    - fieldd_id
    - event
    - service_date
    - status
    - payment_status
    - source
    - utm_source
    - utm_medium
    - utm_campaign
11. Keep the existing fieldd_revenue append behavior.
12. Do not modify pullGA4, pullSearchConsole, or pullKlaviyo unless required.
13. Add small helper functions instead of duplicating parsing logic.
```

## Part 8 - Update The Dashboard To Show Klaviyo Revenue

Once the `fieldd_revenue` published CSV includes UTM fields, the dashboard can
group revenue by campaign.

Target table:

```text
Campaign | Channel | Clicks | Revenue | Revenue / Click
```

Target logic:

```text
Only include fieldd_revenue rows where:
- paid amount or total > 0
- payment status is paid, completed, succeeded, or blank if event is job completed
- utm_source = klaviyo
- utm_campaign is not blank
```

Group by:

```text
utm_campaign + utm_medium
```

Then join to Klaviyo campaign click data by normalized campaign name.

### Codex/Claude Prompt To Add Dashboard Revenue Attribution

Use this prompt:

```text
Update index.html to add Klaviyo revenue attribution.

Context:
- The dashboard already parses Klaviyo campaign data.
- The dashboard already has manual revenue data from Billed (1).csv.
- Add a new FIELD_REVENUE_CSV constant for the published fieldd_revenue CSV.
- Parse rows with Total, Paid Amount, UTM Source, UTM Medium, UTM Campaign,
  Payment Status, Status, and Fieldd ID.

Requirements:

1. Do not remove the existing manual Revenue section.
2. Add a Klaviyo revenue table under Email & SMS.
3. Table columns:
   Campaign, Channel, Clicks, Revenue, Revenue / Click
4. Include only rows where UTM Source is klaviyo.
5. Use Paid Amount if present, otherwise Total.
6. Count only positive revenue.
7. Dedupe by Fieldd ID when available.
8. Group by normalized UTM Campaign and UTM Medium.
9. Match Klaviyo campaign names to UTM Campaign using a simple normalize function:
   lowercase, remove [sms], replace non-alphanumeric with underscores,
   collapse duplicate underscores.
10. If no attributed revenue exists, show a clear note:
    "No Klaviyo-attributed revenue yet. Add UTMs to campaign links and confirm
    Fieldd passes them through."
11. Keep all existing Google Ads, GA4, Search Console, and Revenue behavior.
12. Verify in a local browser.
```

## Part 9 - How To Validate Everything

Run one full test before trusting the dashboard.

### Test Campaign

Use this URL:

```text
https://sbmobiledetailing.com/book?utm_source=klaviyo&utm_medium=email&utm_campaign=test_revenue_attribution
```

### Test Checklist

1. Open the URL.
2. Create a test booking.
3. Mark it paid/completed in Fieldd.
4. Confirm a row appears in `fieldd_revenue`.
5. Confirm the row has:
   - revenue amount
   - email or phone
   - `utm_source=klaviyo`
   - `utm_medium=email`
   - `utm_campaign=test_revenue_attribution`
6. Confirm Klaviyo profile activity shows `Fieldd Paid Booking`.
7. Confirm the dashboard shows the test campaign revenue.

## Part 10 - Common Problems

### UTMs disappear before booking

Cause:

The booking flow redirects and drops URL parameters.

Fix:

Fieldd or the website needs to preserve UTMs through the booking process. This
may require hidden form fields, custom fields, or a script that stores UTMs in
cookies/local storage and passes them into the booking.

### Fieldd webhook has no UTM fields

Cause:

Fieldd is not storing or sending UTMs.

Fix:

Check Fieldd settings for lead source, custom fields, tracking fields, or
webhook payload options.

### Klaviyo event appears but revenue is zero

Cause:

The event was sent without `value`, or revenue parsing returned zero.

Fix:

Check whether Fieldd sends cents or dollars. If cents, divide by 100.

### Duplicate revenue

Cause:

The same booking sends multiple webhooks.

Fix:

Dedupe by Fieldd ID and use Klaviyo `unique_id`.

### Campaign names do not match

Cause:

Klaviyo campaign name and `utm_campaign` are formatted differently.

Fix:

Use one strict naming convention. For example:

```text
july_13_flash
```

## Implementation Order

Do this in order:

1. Add UTMs to all future Klaviyo campaign links.
2. Run one test booking and inspect Fieldd raw webhook JSON.
3. Add `UTM Medium` to the Apps Script `fieldd_revenue` tab.
4. Confirm Fieldd sends UTM values.
5. Send `Fieldd Paid Booking` events to Klaviyo.
6. Add Klaviyo revenue attribution to the dashboard.
7. Validate with a real or test booking.

Do not start with dashboard changes until Fieldd is confirmed to pass UTMs.
Without UTMs in the revenue data, the dashboard cannot reliably attribute
revenue to campaigns.
