/**
 * SBD dashboard — Google Analytics (GA4) + Search Console → Google Sheet
 * ============================================================================
 * This script lives INSIDE your Google Sheet (Extensions → Apps Script).
 * It pulls GA4 and Search Console data and writes them to the `analytics`
 * and `search` tabs. Put both functions on a DAILY trigger and the Sheet
 * (and the dashboard) stay current with zero downloads.
 *
 * ── ONE-TIME SETUP (details in SETUP-GUIDE.md) ──────────────────────────────
 * 1. Open your Sheet → Extensions → Apps Script. Delete the sample code,
 *    paste this whole file.
 * 2. Fill in GA4_PROPERTY_ID and GSC_SITE_URL below.
 * 3. Left sidebar → "Services" (the + icon) → add "Google Analytics Data API".
 * 4. Left sidebar → Project Settings (gear) → tick "Show appsscript.json".
 *    Open appsscript.json and make its "oauthScopes" match the block in
 *    SETUP-GUIDE.md (adds Search Console + external-request permissions).
 * 5. Select pullGA4 in the toolbar → Run → authorize when prompted.
 *    Then select pullSearchConsole → Run → authorize.
 * 6. Left sidebar → Triggers (clock icon) → add a daily trigger for each
 *    function. Done — it now updates itself.
 * ============================================================================
 */

// ── FILL THESE IN ───────────────────────────────────────────────────────────
var GA4_PROPERTY_ID = "311415479";                   // SB Mobile Detailing GA4 property
var GSC_SITE_URL    = "sc-domain:sbmobiledetailing.com";  // Search Console domain property
var DAYS_BACK       = 90;                            // rolling window of history to pull
var GA4_TAB         = "analytics";
var GSC_TAB         = "search";
var FIELDD_TAB      = "fieldd_revenue";

// Klaviyo (email/SMS). Put the PRIVATE key in Script Properties as KLAVIYO_KEY
// (Project Settings → Script Properties) — NOT here in the code.
var KLAVIYO_TAB     = "klaviyo";
var KLAVIYO_REV     = "2024-10-15";
var KLAVIYO_CONV_METRIC = "Rja2JP";                  // "Received Email" metric id (report requires one; its conv stats are unused)

// ── Helpers ──────────────────────────────────────────────────────────────────
function tz_()    { return Session.getScriptTimeZone(); }
function today_() { return Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd"); }
function startDate_() {
  var d = new Date();
  d.setDate(d.getDate() - DAYS_BACK);
  return Utilities.formatDate(d, tz_(), "yyyy-MM-dd");
}
function num_(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function writeTab_(name, values) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  sh.getRange(1, 1, values.length, values[0].length).setValues(values);
}
function grid_(rows, w) { return rows.map(function (r) { var a = r.slice(); while (a.length < w) a.push(""); return a; }); }
function r2_(n) { return Math.round(n * 100) / 100; }

// ── Fieldd webhook → `fieldd_revenue` tab ────────────────────────────────────
// Deploy this Apps Script as a Web App and paste the URL into Fieldd's webhook
// settings. If you set Script Property FIELDD_WEBHOOK_SECRET, add
// ?token=YOUR_SECRET to the webhook URL.
function doPost(e) {
  var secret = PropertiesService.getScriptProperties().getProperty("FIELDD_WEBHOOK_SECRET");
  if (secret && (!e || !e.parameter || e.parameter.token !== secret)) {
    return jsonResponse_({ ok: false, error: "unauthorized" });
  }

  var body = parsePostBody_(e);
  appendFielddEvent_(body);
  return jsonResponse_({ ok: true });
}

function parsePostBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  var raw = e.postData.contents;
  try {
    return JSON.parse(raw);
  } catch (err) {
    var out = { raw: raw };
    Object.keys(e.parameter || {}).forEach(function (k) { out[k] = e.parameter[k]; });
    return out;
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function path_(obj, p) {
  var cur = obj, parts = p.split(".");
  for (var i = 0; i < parts.length; i++) {
    if (cur == null || cur[parts[i]] == null) return "";
    cur = cur[parts[i]];
  }
  return cur == null ? "" : cur;
}

function first_(obj, paths) {
  for (var i = 0; i < paths.length; i++) {
    var v = path_(obj, paths[i]);
    if (v !== "" && v !== null && v !== undefined) return v;
  }
  return "";
}

function moneyField_(obj, amountPaths, centsPaths) {
  var cents = first_(obj, centsPaths || []);
  if (cents !== "") return r2_(num_(cents) / 100);
  var amount = first_(obj, amountPaths || []);
  return amount === "" ? "" : r2_(num_(amount));
}

function appendFielddEvent_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(FIELDD_TAB) || ss.insertSheet(FIELDD_TAB);
    var header = [
      "Received At", "Event", "Fieldd ID", "Customer", "Email", "Phone",
      "Service Date", "Status", "Payment Status", "Total", "Paid Amount",
      "Currency", "Source", "UTM Source", "UTM Campaign", "Raw JSON"
    ];
    if (sh.getLastRow() === 0) sh.appendRow(header);

    var eventName = first_(body, ["event", "event_type", "eventType", "topic", "type", "data.type"]);
    var id = first_(body, ["id", "booking_id", "bookingId", "job_id", "jobId", "order_id", "orderId", "invoice_id", "invoiceId", "data.id", "data.attributes.id"]);
    var customer = first_(body, ["customer.name", "customer.full_name", "customerName", "client.name", "data.attributes.customer.name", "data.attributes.customerName"]);
    var email = first_(body, ["customer.email", "email", "client.email", "data.attributes.customer.email", "data.attributes.email"]);
    var phone = first_(body, ["customer.phone", "phone", "client.phone", "data.attributes.customer.phone", "data.attributes.phone"]);
    var serviceDate = first_(body, ["service_date", "serviceDate", "scheduled_at", "scheduledAt", "appointment_at", "appointmentAt", "completed_at", "completedAt", "data.attributes.service_date", "data.attributes.scheduled_at"]);
    var status = first_(body, ["status", "job_status", "jobStatus", "booking_status", "bookingStatus", "data.attributes.status"]);
    var paymentStatus = first_(body, ["payment_status", "paymentStatus", "payment.status", "invoice.status", "data.attributes.payment_status"]);
    var total = moneyField_(body,
      ["total", "total_amount", "totalAmount", "grand_total", "grandTotal", "amount", "price", "revenue", "invoice.total", "payment.total", "order.total", "booking.total", "job.total", "data.attributes.total", "data.attributes.amount"],
      ["total_cents", "totalCents", "amount_cents", "amountCents", "invoice.total_cents", "payment.amount_cents", "data.attributes.total_cents"]);
    var paid = moneyField_(body,
      ["paid_amount", "paidAmount", "amount_paid", "amountPaid", "payment.amount", "payment.paid_amount", "invoice.amount_paid", "data.attributes.paid_amount"],
      ["paid_amount_cents", "paidAmountCents", "amount_paid_cents", "amountPaidCents", "payment.amount_cents", "data.attributes.paid_amount_cents"]);
    var currency = first_(body, ["currency", "payment.currency", "invoice.currency", "data.attributes.currency"]);
    var source = first_(body, ["source", "lead_source", "leadSource", "referral_source", "referralSource", "customer.source", "data.attributes.source"]);
    var utmSource = first_(body, ["utm_source", "utm.source", "utmSource", "metadata.utm_source", "data.attributes.utm_source"]);
    var utmCampaign = first_(body, ["utm_campaign", "utm.campaign", "utmCampaign", "metadata.utm_campaign", "data.attributes.utm_campaign"]);
    var raw = JSON.stringify(body);

    sh.appendRow([
      Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd HH:mm:ss"),
      eventName, id, customer, email, phone, String(serviceDate).substring(0, 19),
      status, paymentStatus, total, paid, currency, source, utmSource, utmCampaign, raw
    ]);
  } finally {
    lock.releaseLock();
  }
}

// ── Klaviyo (email + SMS) → `klaviyo` tab ─────────────────────────────────────
function pullKlaviyo() {
  var key = PropertiesService.getScriptProperties().getProperty("KLAVIYO_KEY");
  if (!key) throw new Error("Set Script Property KLAVIYO_KEY first (Project Settings → Script Properties).");
  function kf(path, method, body) {
    var opt = { method: method || "get", muteHttpExceptions: true,
      headers: { "Authorization": "Klaviyo-API-Key " + key, "revision": KLAVIYO_REV, "accept": "application/json" } };
    if (body) { opt.contentType = "application/json"; opt.payload = JSON.stringify(body); }
    return JSON.parse(UrlFetchApp.fetch("https://a.klaviyo.com/api/" + path, opt).getContentText());
  }

  // campaign performance (email + sms, last 30 days)
  var rep = kf("campaign-values-reports/", "post", { data: { type: "campaign-values-report", attributes: {
    timeframe: { key: "last_30_days" }, conversion_metric_id: KLAVIYO_CONV_METRIC,
    statistics: ["recipients", "delivered", "clicks_unique", "click_rate"] } } });
  var results = (rep.data && rep.data.attributes && rep.data.attributes.results) || [];

  // campaign names + send dates
  var names = {};
  ["email", "sms"].forEach(function (ch) {
    var d = kf("campaigns/?filter=equals(messages.channel,'" + ch + "')");
    (d.data || []).forEach(function (c) { names[c.id] = { name: c.attributes.name, send: (c.attributes.send_time || "").substring(0, 10) }; });
  });

  var chan = { email: { n: 0, rec: 0, clk: 0 }, sms: { n: 0, rec: 0, clk: 0 } }, camps = [];
  results.forEach(function (x) {
    var g = x.groupings, s = x.statistics, ch = g.send_channel;
    if (chan[ch]) { chan[ch].n++; chan[ch].rec += s.recipients || 0; chan[ch].clk += s.clicks_unique || 0; }
    var nm = names[g.campaign_id] || {};
    camps.push({ date: nm.send || "", channel: ch, name: nm.name || "(campaign)",
      rec: Math.round(s.recipients || 0), clk: Math.round(s.clicks_unique || 0), ctr: r2_((s.click_rate || 0) * 100) });
  });
  camps.sort(function (a, b) { return a.date < b.date ? 1 : -1; });

  // list sizes (consent / growth)
  var lists = [];
  (kf("lists/").data || []).forEach(function (x) {
    var one = kf("lists/" + x.id + "/?additional-fields[list]=profile_count");
    var cnt = one.data && one.data.attributes ? one.data.attributes.profile_count : "";
    lists.push([x.attributes.name, (cnt == null ? "" : cnt)]);
  });

  var out = [["KLAVIYO - EMAIL & SMS SUMMARY"],
    ["Generated", Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd HH:mm")],
    ["Window", "last 30 days"], [],
    ["CHANNEL SUMMARY"], ["Channel", "Campaigns", "Recipients", "Clicks", "CTR %"]];
  ["email", "sms"].forEach(function (ch) { var c = chan[ch];
    out.push([ch === "email" ? "Email" : "SMS", c.n, c.rec, c.clk, c.rec ? r2_(c.clk / c.rec * 100) : 0]); });
  out.push([], ["RECENT CAMPAIGNS"], ["Date", "Channel", "Campaign", "Recipients", "Clicks", "CTR %"]);
  camps.slice(0, 16).forEach(function (c) { out.push([c.date, c.channel === "email" ? "Email" : "SMS", c.name, c.rec, c.clk, c.ctr]); });
  out.push([], ["LISTS"], ["List", "Subscribers"]);
  lists.forEach(function (l) { out.push(l); });

  writeTab_(KLAVIYO_TAB, grid_(out, 6));
  Logger.log("Klaviyo: wrote " + camps.length + " campaigns, " + lists.length + " lists.");
}

// ── GA4 → `analytics` tab ────────────────────────────────────────────────────
function pullGA4() {
  var report = AnalyticsData.Properties.runReport({
    dateRanges: [{ startDate: DAYS_BACK + "daysAgo", endDate: "today" }],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "engagedSessions" },
      { name: "screenPageViews" },
      { name: "keyEvents" }          // if this errors on your property, change to "conversions"
    ],
    orderBys: [{ dimension: { dimensionName: "date" } }],
    limit: 100000
  }, "properties/" + GA4_PROPERTY_ID);

  var out = [["Date", "Sessions", "Users", "Engaged sessions", "Page views", "Key events"]];
  (report.rows || []).forEach(function (r) {
    var d = r.dimensionValues[0].value;                  // "YYYYMMDD"
    var date = d.substring(0, 4) + "-" + d.substring(4, 6) + "-" + d.substring(6, 8);
    var m = r.metricValues;
    out.push([date, num_(m[0].value), num_(m[1].value), num_(m[2].value), num_(m[3].value), num_(m[4].value)]);
  });
  writeTab_(GA4_TAB, out);
  Logger.log("GA4: wrote " + (out.length - 1) + " days.");
}

// ── Search Console → `search` tab ────────────────────────────────────────────
function pullSearchConsole() {
  var url = "https://searchconsole.googleapis.com/webmasters/v3/sites/"
          + encodeURIComponent(GSC_SITE_URL) + "/searchAnalytics/query";
  var res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({
      startDate: startDate_(),
      endDate: today_(),
      dimensions: ["date"],
      rowLimit: 25000
    }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error("Search Console error " + res.getResponseCode() + ": " + res.getContentText());
  }
  var rows = (JSON.parse(res.getContentText()).rows) || [];
  rows.sort(function (a, b) { return a.keys[0] < b.keys[0] ? -1 : 1; });

  var out = [["Date", "Clicks", "Impressions", "CTR", "Position"]];
  rows.forEach(function (row) {
    var date = row.keys[0];                              // "YYYY-MM-DD"
    var ctr  = row.impressions ? (row.clicks / row.impressions) * 100 : 0;
    out.push([date, Math.round(row.clicks), Math.round(row.impressions),
              Math.round(ctr * 100) / 100, Math.round(row.position * 10) / 10]);
  });
  writeTab_(GSC_TAB, out);
  Logger.log("Search Console: wrote " + (out.length - 1) + " days.");
}
