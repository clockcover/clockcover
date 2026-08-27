import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv, parseRoster, readCsv } from "../src/adapters/csv.ts";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url).pathname, "utf8");

test("readCsv handles quotes, escaped quotes, CRLF and blank lines", () => {
  const rows = readCsv('a,b\r\n"x, y","he said ""hi"""\r\n\r\n1,2\n');
  assert.deepEqual(rows, [["a", "b"], ["x, y", 'he said "hi"'], ["1", "2"]]);
});

test("parseCsv splits rows into shifts and records; a row can be both", () => {
  const { shifts, records, errors } = parseCsv(fixture("day-1.csv"));
  assert.deepEqual(errors, []);
  assert.equal(shifts.length, 3);
  assert.deepEqual(records.map((r) => [r.employeeExternalId, r.clockIn, r.clockOut]), [
    ["E-002", "08:01", null],
    ["E-003", "07:58", "16:03"],
    ["E-003", "09:00", "17:00"],
  ]);
});

test("parseCsv reports line-numbered errors and rejects half a shift", () => {
  const { errors } = parseCsv([
    "employee_id,date,planned_start,planned_end,clock_in,clock_out",
    "E-001,2026-3-2,08:00,16:00,,",
    ",2026-03-02,08:00,16:00,,",
    "E-001,2026-03-02,08:00,,,",
    "E-001,2026-03-02,,,,",
    "E-001,2026-03-02,,,8am,",
  ].join("\n"));
  assert.deepEqual(errors, [
    "line 2: date must be YYYY-MM-DD",
    "line 3: employee_id is empty",
    "line 4: planned_start and planned_end must both be set",
    "line 5: neither planned nor clock times",
    "line 6: clock_in must be HH:MM",
  ]);
});

test("parseCsv rejects a file without the required columns", () => {
  assert.deepEqual(parseCsv("name,when\nx,y").errors, ["missing columns: employee_id, date"]);
  assert.deepEqual(parseCsv("").errors, ["empty file"]);
});

test("parseRoster reads employees with their managers", () => {
  const { rows, errors } = parseRoster(fixture("roster.csv"));
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    employeeExternalId: "E-001", employeeName: "Ada Sample",
    managerExternalId: "M-100", managerName: "Manager North", managerEmail: "north@example.com",
  });
  assert.deepEqual(parseRoster("employee_id,employee_name,manager_id,manager_name,manager_email\nE-1,A,M-1,B,not-an-email").errors,
    ["line 2: manager_email is not an email"]);
});
