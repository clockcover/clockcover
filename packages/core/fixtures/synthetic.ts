// Synthetic fixtures for the acceptance scenarios in docs/core-design.md.
// Every person here is invented; emails use the reserved example.com domain (docs/privacy.md).
import type { AttendanceRecord, Employee, Employer, Import, Manager, ScheduledShift } from "../src/types.ts";

export const employer: Employer = { id: "emp-1", name: "Example Logistics", payrollEmail: "payroll@example.com", timezone: "UTC", operatorEmail: "operator@example.com", slaHours: 48 };

export const theImport: Import = { id: "imp-1", employerId: employer.id, source: "csv", importedAt: new Date("2026-03-01T06:00:00Z"), rowCount: 0 };

export const managers = {
  north: { id: "mgr-north", employerId: employer.id, externalId: "M-100", fullName: "Manager North", email: "north@example.com", whatsappNumber: null },
  south: { id: "mgr-south", employerId: employer.id, externalId: "M-200", fullName: "Manager South", email: "south@example.com", whatsappNumber: null },
} satisfies Record<string, Manager>;

export const employees = {
  ada: { id: "e-ada", employerId: employer.id, externalId: "E-001", fullName: "Ada Sample", managerId: managers.north.id, active: true },
  ben: { id: "e-ben", employerId: employer.id, externalId: "E-002", fullName: "Ben Sample", managerId: managers.north.id, active: true },
  cyd: { id: "e-cyd", employerId: employer.id, externalId: "E-003", fullName: "Cyd Sample", managerId: managers.south.id, active: true },
} satisfies Record<string, Employee>;

export const DAY = "2026-03-02";
export const period = { from: DAY, to: DAY };

let seq = 0;
export function shift(employee: Employee, shiftDate = DAY): ScheduledShift {
  return { id: `s-${++seq}`, employerId: employer.id, employeeId: employee.id, shiftDate, plannedStart: "08:00", plannedEnd: "16:00", importId: theImport.id };
}

export function record(employee: Employee, clockIn: string | null, clockOut: string | null, recordDate = DAY): AttendanceRecord {
  return { id: `r-${++seq}`, employerId: employer.id, employeeId: employee.id, recordDate, clockIn, clockOut, importId: theImport.id };
}

export const at = (iso: string) => new Date(iso);
export const HOURS = 3_600_000;
