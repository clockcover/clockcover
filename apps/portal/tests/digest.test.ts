import { test } from "node:test";
import assert from "node:assert/strict";
import { dateTime, dayMonthYear, detail, groupByDay, longDate, shortDate, slaStatus } from "../src/digest.ts";
import { setLocale, tr } from "../src/i18n.ts";
import { escalationTokenFromPath, tokenFromPath } from "../src/api.ts";
import type { DigestGap } from "../src/api.ts";

const gap = (over: Partial<DigestGap> = {}): DigestGap => ({
  id: "g1", employeeName: "Ada Sample", gapDate: "2026-08-26", gapType: "no_clockout",
  shift: { plannedStart: "07:00", plannedEnd: "15:00" }, record: { clockIn: "06:52", clockOut: null },
  managerNotifiedAt: "2026-08-27T08:00:00Z", escalated: false, ...over,
});

test("dates read like the design", () => {
  assert.equal(shortDate("2026-08-27"), "Thu 27 Aug");
  assert.equal(longDate("2026-08-27"), "Thu 27 Aug 2026");
  assert.equal(dateTime("2026-08-26T08:00:00Z"), "Wed 26 Aug, 08:00");
  assert.equal(dayMonthYear("2026-09-10T08:00:00Z"), "10 Sep 2026");
});

test("detail line per gap type", () => {
  assert.equal(detail(gap()), "shift 07:00–15:00 · clocked in 06:52 · no clock-out");
  assert.equal(detail(gap({ gapType: "no_clockin", record: { clockIn: null, clockOut: "15:04" } })), "shift 07:00–15:00 · clocked out 15:04 · no clock-in");
  assert.equal(detail(gap({ gapType: "no_record_at_all", record: null })), "shift 07:00–15:00 · no attendance record");
});

test("SLA line: notified → urgent under 24 h → escalated", () => {
  const notified = "2026-08-27T08:00:00Z";
  assert.deepEqual(slaStatus(gap(), 48, new Date("2026-08-27T10:00:00Z")), { text: "Notified Thu 27 Aug, 08:00", tone: "muted" });
  assert.deepEqual(slaStatus(gap(), 48, new Date("2026-08-28T20:00:00Z")), { text: "Escalates to the payroll accountant in 12 h", tone: "warn" });
  assert.deepEqual(slaStatus(gap(), 48, new Date("2026-08-29T09:00:00Z")), { text: "Escalated to the payroll accountant — SLA passed", tone: "danger" });
  assert.deepEqual(slaStatus(gap({ escalated: true, managerNotifiedAt: notified }), 48, new Date("2026-08-27T09:00:00Z")).tone, "danger");
  assert.deepEqual(slaStatus(gap({ managerNotifiedAt: null }), 48, new Date()), { text: "Not yet in a digest", tone: "muted" });
});

test("groups by day, newest first, names alphabetical", () => {
  const days = groupByDay([
    gap({ id: "a", gapDate: "2026-08-25", employeeName: "Zed" }),
    gap({ id: "b", gapDate: "2026-08-26", employeeName: "Mia" }),
    gap({ id: "c", gapDate: "2026-08-26", employeeName: "Ada" }),
  ]);
  assert.deepEqual(days.map((d) => [d.day, d.gaps.map((g) => g.employeeName)]), [["2026-08-26", ["Ada", "Mia"]], ["2026-08-25", ["Zed"]]]);
});

test("token comes only from /d/<token>", () => {
  assert.equal(tokenFromPath("/d/abc.def"), "abc.def");
  assert.equal(tokenFromPath("/d/abc.def/"), "abc.def");
  assert.equal(tokenFromPath("/"), null);
  assert.equal(tokenFromPath("/d/"), null);
  assert.equal(tokenFromPath("/d/a/b"), null);
});

test("escalation token comes only from /e/<token>", () => {
  assert.equal(escalationTokenFromPath("/e/abc.def"), "abc.def");
  assert.equal(escalationTokenFromPath("/d/abc.def"), null);
  assert.equal(escalationTokenFromPath("/e/"), null);
});

test("Hebrew copy and dates", () => {
  assert.equal(shortDate("2026-08-27", "he"), "יום ה׳ 27 אוג׳");
  assert.equal(tr("he", "digest.open", { n: 2, noun: tr("he", "digest.gaps") }), "2 פערים פתוחים בצוות שלך");
  setLocale("he", false);
  assert.equal(detail(gap({ gapType: "no_record_at_all", record: null })), "משמרת 07:00–15:00 · אין רישום נוכחות");
  assert.deepEqual(slaStatus(gap({ escalated: true }), 48, new Date()).text, "הועבר לחשב/ת השכר — זמן התגובה עבר");
  setLocale("en", false);
  assert.equal(detail(gap()), "shift 07:00–15:00 · clocked in 06:52 · no clock-out");
});
