// Email adapter — plain functions, no interface (ADR-0003). Renders a digest or an
// escalation and posts it to Resend's HTTP API (Workers cannot speak SMTP).
// Provider is a two-way door: only this file knows about it.
import type { DigestMessage, Escalation, Gap } from "@clockcover/core";

export interface EmailConfig {
  apiKey: string;
  from: string;
  /** Base URL of the digest page; the link itself waits for ADR-0004. */
  webUrl?: string;
}

export interface Email { to: string; subject: string; text: string }

const GAP_LABEL: Record<Gap["gapType"], string> = {
  no_clockin: "no clock-in",
  no_clockout: "no clock-out",
  no_record_at_all: "no clock entry at all",
};

export function renderDigest({ manager, gaps }: DigestMessage, employeeNames: Map<string, string>): Email {
  const lines = gaps
    .slice()
    .sort((a, b) => a.gapDate.localeCompare(b.gapDate) || a.employeeId.localeCompare(b.employeeId))
    .map((g) => `  ${g.gapDate}  ${employeeNames.get(g.employeeId) ?? g.employeeId}  —  ${GAP_LABEL[g.gapType]}`);
  return {
    to: manager.email,
    subject: `ClockCover: ${gaps.length} open clock ${gaps.length === 1 ? "gap" : "gaps"} on your team`,
    text: [
      `Hello ${manager.fullName},`,
      "",
      `Your team has ${gaps.length} open clock ${gaps.length === 1 ? "gap" : "gaps"}:`,
      "",
      ...lines,
      "",
      "Please follow up with each person, or reply if the entry is already fixed.",
      "Unresolved gaps are escalated to payroll after the SLA.",
    ].join("\n"),
  };
}

export function renderEscalation(e: Escalation, gap: Gap, employeeName: string, managerName: string): Email {
  return {
    to: e.escalatedTo,
    subject: `ClockCover escalation: ${employeeName}, ${gap.gapDate}, ${GAP_LABEL[gap.gapType]}`,
    text: [
      `A clock gap was not resolved within the SLA.`,
      "",
      `  Employee: ${employeeName}`,
      `  Date:     ${gap.gapDate}`,
      `  Gap:      ${GAP_LABEL[gap.gapType]}`,
      `  Manager:  ${managerName} (notified ${gap.managerNotifiedAt?.toISOString() ?? "never"})`,
    ].join("\n"),
  };
}

export type SendEmail = (email: Email) => Promise<void>;

/** Sends through Resend. Throws on non-2xx so the caller does not record a digest that was not sent. */
export function resendSender(config: EmailConfig, fetchFn: typeof fetch = fetch): SendEmail {
  return async (email) => {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: config.from, to: [email.to], subject: email.subject, text: email.text }),
    });
    if (!res.ok) throw new Error(`email provider returned ${res.status} for ${email.to}`);
  };
}
