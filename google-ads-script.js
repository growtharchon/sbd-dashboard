/**
 * SBD — Google Ads → Google Sheet auto-sync  (daily feed + KAs-style analysis)
 * ----------------------------------------------------------------------------
 * Writes TWO tabs into your Google Sheet:
 *   • "ads"          — daily time series (rolling 90 days) for trend charts
 *   • "00-analysis"  — KAs-style breakdown: campaign KPIs (CPL/CTR/CVR),
 *                      device split, conversion actions (by value), change log
 *
 * SETUP (one time)
 *   1. Google Ads → Tools → Bulk actions → Scripts → +  (blue plus).
 *   2. Paste this whole file, replacing the default code.
 *   3. SHEET_URL is already set below. Authorize, then Run once.
 *   4. Schedule → Daily.
 * ----------------------------------------------------------------------------
 */

var SHEET_URL     = "https://docs.google.com/spreadsheets/d/1HXHr0EvYV2WnkpcrISxjIoTp5GmZzwg_93Cjuj5ejjE/edit";
var DAILY_TAB     = "ads";          // daily time series
var ANALYSIS_TAB  = "00-analysis";  // KAs-style breakdown
var DAYS_BACK     = 90;             // rolling window for the daily tab

function main() {
  try { writeDailyTab(); }    catch (e) { Logger.log("daily tab failed: " + e); }
  try { writeAnalysisTab(); } catch (e) { Logger.log("analysis tab failed: " + e); }
}

function round2(n) { return Math.round(n * 100) / 100; }
function ss_()     { return SpreadsheetApp.openByUrl(SHEET_URL); }
function tab_(name){ return ss_().getSheetByName(name) || ss_().insertSheet(name); }
function writeGrid_(name, rows, width) {
  var norm = rows.map(function (r) { var a = r.slice(); while (a.length < width) a.push(""); return a; });
  var sh = tab_(name); sh.clearContents();
  sh.getRange(1, 1, norm.length, width).setValues(norm);
}

/* ── daily time series → "ads" ────────────────────────────────────────────── */
function writeDailyTab() {
  var tz = AdsApp.currentAccount().getTimeZone();
  var end = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  var startD = new Date(); startD.setDate(startD.getDate() - DAYS_BACK);
  var start = Utilities.formatDate(startD, tz, "yyyy-MM-dd");

  var rows = AdsApp.report(
    "SELECT segments.date, metrics.clicks, metrics.conversions, metrics.cost_micros " +
    "FROM customer WHERE segments.date BETWEEN '" + start + "' AND '" + end + "' " +
    "ORDER BY segments.date ASC").rows();

  var out = [["Date", "Clicks", "Conversions", "Cost / conv.", "Cost"]];
  while (rows.hasNext()) {
    var r = rows.next();
    var date = String(r["segments.date"]).substring(0, 10);
    var clicks = parseInt(r["metrics.clicks"], 10) || 0;
    var conv = parseFloat(r["metrics.conversions"]) || 0;
    var cost = (parseInt(r["metrics.cost_micros"], 10) || 0) / 1e6;
    out.push([date, clicks, round2(conv), round2(conv ? cost / conv : 0), round2(cost)]);
  }
  writeGrid_(DAILY_TAB, out, 5);
  Logger.log("Wrote " + (out.length - 1) + " days to '" + DAILY_TAB + "'.");
}

/* ── KAs-style breakdown → "00-analysis" ──────────────────────────────────── */
function writeAnalysisTab() {
  var tz = AdsApp.currentAccount().getTimeZone();
  var out = [];
  out.push(["SBD GOOGLE ADS - ANALYSIS SUMMARY"]);
  out.push(["Generated", Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm") + " " + tz]);
  out.push(["Windows", "metrics = LAST_30_DAYS ; change-history = LAST_14_DAYS (cap 10000)"]);
  out.push([]);

  // CAMPAIGN KPIs
  out.push(["CAMPAIGN KPIs (active or has-spend)"]);
  out.push(["Campaign", "Status", "Clicks", "Impr", "Cost USD", "Conv", "CPL", "CTR %", "CVR %"]);
  var tot = { clicks: 0, impr: 0, cost: 0, conv: 0 }, camps = [];
  var cq = AdsApp.report(
    "SELECT campaign.name, campaign.status, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions " +
    "FROM campaign WHERE segments.date DURING LAST_30_DAYS").rows();
  while (cq.hasNext()) {
    var c = cq.next();
    var clicks = parseInt(c["metrics.clicks"], 10) || 0;
    var impr = parseInt(c["metrics.impressions"], 10) || 0;
    var cost = (parseInt(c["metrics.cost_micros"], 10) || 0) / 1e6;
    var conv = parseFloat(c["metrics.conversions"]) || 0;
    var status = c["campaign.status"];
    if (cost <= 0 && status !== "ENABLED") continue;
    camps.push({ name: c["campaign.name"], status: status, clicks: clicks, impr: impr, cost: cost, conv: conv });
    tot.clicks += clicks; tot.impr += impr; tot.cost += cost; tot.conv += conv;
  }
  camps.sort(function (a, b) { return b.cost - a.cost; });
  camps.forEach(function (c) {
    out.push([c.name, c.status, c.clicks, c.impr, round2(c.cost), round2(c.conv),
      round2(c.conv ? c.cost / c.conv : 0), round2(c.impr ? c.clicks / c.impr * 100 : 0), round2(c.clicks ? c.conv / c.clicks * 100 : 0)]);
  });
  out.push(["ACCOUNT TOTAL", "", tot.clicks, tot.impr, round2(tot.cost), round2(tot.conv),
    round2(tot.conv ? tot.cost / tot.conv : 0), round2(tot.impr ? tot.clicks / tot.impr * 100 : 0), round2(tot.clicks ? tot.conv / tot.clicks * 100 : 0)]);
  out.push([]);

  // DEVICE SPLIT
  out.push(["DEVICE SPLIT"]);
  out.push(["Device", "Clicks", "Cost USD", "Conv", "CPL"]);
  var dev = {};
  var dq = AdsApp.report(
    "SELECT segments.device, metrics.clicks, metrics.cost_micros, metrics.conversions " +
    "FROM campaign WHERE segments.date DURING LAST_30_DAYS").rows();
  while (dq.hasNext()) {
    var d = dq.next(), k = d["segments.device"];
    if (!dev[k]) dev[k] = { clicks: 0, cost: 0, conv: 0 };
    dev[k].clicks += parseInt(d["metrics.clicks"], 10) || 0;
    dev[k].cost += (parseInt(d["metrics.cost_micros"], 10) || 0) / 1e6;
    dev[k].conv += parseFloat(d["metrics.conversions"]) || 0;
  }
  Object.keys(dev).forEach(function (k) {
    var x = dev[k];
    out.push([k, x.clicks, round2(x.cost), round2(x.conv), x.conv ? round2(x.cost / x.conv) : "-"]);
  });
  out.push([]);

  // CONVERSION ACTIONS (by type + value — this is where the phone-lead $0 issue shows)
  out.push(["CONVERSION ACTIONS"]);
  out.push(["Action", "Category", "Conversions", "Value"]);
  var ca = {};
  var aq = AdsApp.report(
    "SELECT segments.conversion_action_name, segments.conversion_action_category, metrics.conversions, metrics.conversions_value " +
    "FROM campaign WHERE segments.date DURING LAST_30_DAYS").rows();
  while (aq.hasNext()) {
    var a = aq.next(), nm = a["segments.conversion_action_name"];
    if (!nm) continue;
    if (!ca[nm]) ca[nm] = { cat: a["segments.conversion_action_category"], conv: 0, val: 0 };
    ca[nm].conv += parseFloat(a["metrics.conversions"]) || 0;
    ca[nm].val += parseFloat(a["metrics.conversions_value"]) || 0;
  }
  Object.keys(ca).forEach(function (nm) { out.push([nm, ca[nm].cat, round2(ca[nm].conv), round2(ca[nm].val)]); });
  out.push([]);

  // CHANGE HISTORY (best-effort — the change_event query is the one most likely to need a tweak)
  out.push(["CHANGE HISTORY (last 14 days)"]);
  try {
    var byUser = {}, byType = {}, total = 0, auto = 0, minD = null, maxD = null;
    var hq = AdsApp.report(
      "SELECT change_event.change_date_time, change_event.user_email, change_event.change_resource_type, change_event.client_type " +
      "FROM change_event WHERE change_event.change_date_time DURING LAST_14_DAYS " +
      "ORDER BY change_event.change_date_time DESC LIMIT 9999").rows();
    while (hq.hasNext()) {
      var e = hq.next(); total++;
      var dt = e["change_event.change_date_time"];
      if (!minD || dt < minD) minD = dt;
      if (!maxD || dt > maxD) maxD = dt;
      var ct = String(e["change_event.client_type"] || "");
      var typ = String(e["change_event.change_resource_type"] || "");
      if (ct.indexOf("RECOMMENDATION") >= 0) auto++;
      else { var u = e["change_event.user_email"] || "(system)"; byUser[u] = (byUser[u] || 0) + 1; }
      byType[typ] = (byType[typ] || 0) + 1;
    }
    out.push(["Total events", total]);
    out.push(["Date range", (minD || "") + " -> " + (maxD || "")]);
    out.push([]);
    out.push(["By user", "Count"]);
    Object.keys(byUser).forEach(function (u) { out.push([u, byUser[u]]); });
    out.push(["Recommendations Auto-Apply", auto]);
    out.push([]);
    out.push(["By change type", "Count"]);
    Object.keys(byType).sort(function (a, b) { return byType[b] - byType[a]; }).forEach(function (t) { out.push([t, byType[t]]); });
  } catch (err) {
    out.push(["Total events", 0]);
    out.push(["(change history query needs a tweak: " + err + ")"]);
  }

  writeGrid_(ANALYSIS_TAB, out, 9);
  Logger.log("Wrote '" + ANALYSIS_TAB + "' (" + camps.length + " campaigns).");
}
