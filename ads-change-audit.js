/**
 * SBD — Google Ads change-history audit  (ONE-OFF DIAGNOSTIC, not scheduled)
 * ----------------------------------------------------------------------------
 * Dumps every change event from the last 14 days, one row per change, into a
 * "00-change-audit" tab: who, when, what resource, which operation, which
 * fields, and the campaign it belongs to.
 *
 * Written to investigate 280 CAMPAIGN_CRITERION changes made between
 * 2026-08-03 and 2026-08-12 by an unrecognised account.
 *
 * USE
 *   1. Google Ads → Tools → Bulk actions → Scripts → + (new script).
 *   2. Paste this file. Authorize. Run `auditChanges`.
 *   3. Open the "00-change-audit" tab in the Sheet.
 *   Leave it UNSCHEDULED — it is a diagnostic, not part of the daily sync.
 *
 * NOTE: Google Ads change history does NOT record conversion-action config
 * changes, so this cannot prove or disprove that a conversion action was
 * paused. It shows campaign/ad-group level edits only.
 * ----------------------------------------------------------------------------
 */

var SHEET_URL  = "https://docs.google.com/spreadsheets/d/1HXHr0EvYV2WnkpcrISxjIoTp5GmZzwg_93Cjuj5ejjE/edit";
var AUDIT_TAB  = "00-change-audit";

// Set to an email to isolate one user, or "" for every user.
var ONLY_USER  = "";

function auditChanges() {
  var rows = AdsApp.report(
    "SELECT change_event.change_date_time, change_event.user_email, " +
    "change_event.client_type, change_event.change_resource_type, " +
    "change_event.change_resource_name, change_event.resource_change_operation, " +
    "change_event.changed_fields, change_event.campaign " +
    "FROM change_event " +
    "WHERE change_event.change_date_time DURING LAST_14_DAYS " +
    "ORDER BY change_event.change_date_time DESC LIMIT 9999").rows();

  var out = [["When", "User", "Client", "Operation", "Resource type", "Changed fields", "Campaign", "Resource"]];
  var byUserDay = {}, ops = {}, n = 0;

  while (rows.hasNext()) {
    var e = rows.next();
    var user = String(e["change_event.user_email"] || "(system)");
    if (ONLY_USER && user !== ONLY_USER) continue;

    var when = String(e["change_event.change_date_time"] || "");
    var op   = String(e["change_event.resource_change_operation"] || "");
    var day  = when.substring(0, 10);

    out.push([
      when, user,
      String(e["change_event.client_type"] || ""),
      op,
      String(e["change_event.change_resource_type"] || ""),
      String(e["change_event.changed_fields"] || ""),
      String(e["change_event.campaign"] || ""),
      String(e["change_event.change_resource_name"] || "")
    ]);

    var key = user + " | " + day;
    byUserDay[key] = (byUserDay[key] || 0) + 1;
    ops[op] = (ops[op] || 0) + 1;
    n++;
  }

  // summary block first, detail underneath
  var head = [["CHANGE AUDIT — last 14 days"], ["Rows", n],
              ["Filter", ONLY_USER || "(all users)"], [],
              ["BY USER + DAY", "Count"]];
  Object.keys(byUserDay).sort().forEach(function (k) { head.push([k, byUserDay[k]]); });
  head.push([], ["BY OPERATION", "Count"]);
  Object.keys(ops).sort(function (a, b) { return ops[b] - ops[a]; })
    .forEach(function (o) { head.push([o, ops[o]]); });
  head.push([], ["DETAIL"]);

  var grid = head.concat(out).map(function (r) {
    var a = r.slice(); while (a.length < 8) a.push(""); return a;
  });

  var ss = SpreadsheetApp.openByUrl(SHEET_URL);
  var sh = ss.getSheetByName(AUDIT_TAB) || ss.insertSheet(AUDIT_TAB);
  sh.clearContents();
  sh.getRange(1, 1, grid.length, 8).setValues(grid);
  Logger.log("Change audit: " + n + " events written to '" + AUDIT_TAB + "'.");
}
