/**
 * SBD — Google Ads → Google Sheet auto-sync
 * ----------------------------------------------------------------------------
 * WHAT IT DOES
 *   Pulls SBD's Google Ads performance and writes a DAILY time series (rolling
 *   last 90 days) into your Google Sheet, in the exact format the dashboard
 *   reads. Run it on a DAILY schedule and the Sheet (and the dashboard) stays
 *   current with zero manual work.
 *
 * SETUP (one time)
 *   1. In Google Ads: Tools → Bulk actions → Scripts → +  (blue plus).
 *      (If "Scripts" is greyed out, you have read-only access — ask for
 *       "Standard" access, or use the manual-export fallback instead.)
 *   2. Paste this whole file in, replacing the default code.
 *   3. Put your Sheet's URL in SHEET_URL below, and the tab name in TAB_NAME.
 *   4. Click "Authorize", then "Run" once to test. Check the Sheet filled in.
 *   5. Click "Schedule" → Frequency: Daily. Done — it now updates itself.
 * ----------------------------------------------------------------------------
 */

var SHEET_URL   = "https://docs.google.com/spreadsheets/d/1HXHr0EvYV2WnkpcrISxjIoTp5GmZzwg_93Cjuj5ejjE/edit";
var TAB_NAME    = "ads";   // the tab this writes to
var DAYS_BACK   = 90;      // rolling window

function main() {
  var tz = AdsApp.currentAccount().getTimeZone();
  var end = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  var startD = new Date(); startD.setDate(startD.getDate() - DAYS_BACK);
  var start = Utilities.formatDate(startD, tz, "yyyy-MM-dd");

  var query =
    "SELECT segments.date, metrics.clicks, metrics.conversions, metrics.cost_micros " +
    "FROM customer " +
    "WHERE segments.date BETWEEN '" + start + "' AND '" + end + "' " +
    "ORDER BY segments.date ASC";

  var rows = AdsApp.report(query).rows();

  var out = [["Date", "Clicks", "Conversions", "Cost / conv.", "Cost"]];
  while (rows.hasNext()) {
    var r = rows.next();
    var date   = String(r["segments.date"]).substring(0, 10);   // "YYYY-MM-DD"
    var clicks = parseInt(r["metrics.clicks"], 10) || 0;
    var conv   = parseFloat(r["metrics.conversions"]) || 0;
    var cost   = (parseInt(r["metrics.cost_micros"], 10) || 0) / 1e6;
    var cpl    = conv ? cost / conv : 0;
    out.push([
      date,
      clicks,
      Math.round(conv * 100) / 100,
      Math.round(cpl * 100) / 100,
      Math.round(cost * 100) / 100
    ]);
  }

  var sheet = SpreadsheetApp.openByUrl(SHEET_URL).getSheetByName(TAB_NAME);
  if (!sheet) throw new Error("Tab '" + TAB_NAME + "' not found in the Sheet.");
  sheet.clearContents();
  sheet.getRange(1, 1, out.length, out[0].length).setValues(out);

  Logger.log("Wrote " + (out.length - 1) + " days to '" + TAB_NAME + "'.");
}
