// Email adapter — plain functions, no interface (ADR-0003). Renders the digest and
// escalation emails (design: "Digest Email" / "Escalation Email" artboards) as HTML
// with a plain-text twin, and posts them to Resend's HTTP API (Workers cannot speak
// SMTP). The provider is a two-way door: only this file knows about it.
import type { Escalation, Gap, GapType, Manager } from "@clockcover/core";
import { dateTime, dayMonthYear, longDate, shortDate } from "../format.ts";

export interface EmailConfig {
  apiKey: string;
  from: string;
}

export interface Email { to: string; subject: string; text: string; html: string }

export const GAP_LABEL: Record<GapType, string> = {
  no_clockin: "No clock-in",
  no_clockout: "No clock-out",
  no_record_at_all: "No record",
};

/** What the templates need about one gap beyond the row itself. */
export interface GapView {
  gap: Gap;
  employeeName: string;
  shift: { plannedStart: string; plannedEnd: string } | null;
  record: { clockIn: string | null; clockOut: string | null } | null;
}

export interface DigestEmailInput {
  manager: Manager;
  employerName: string;
  gaps: GapView[];
  digestDate: string;
  slaHours: number;
  /** Signed link to the manager's digest page (ADR-0004). */
  link: string;
  linkExpires: Date;
}

// Email clients do not understand oklch; these are the design tokens as hex.
const C = {
  bg: "#ecedf1", card: "#ffffff", border: "#e0e1e7", rule: "#ececf0",
  text: "#2b2c33", body: "#4c4e59", muted: "#6d6f7c", faint: "#8b8d99", fainter: "#9a9ca7",
  accent: "#5b67a8", badgeBg: "#ededf0", badgeFg: "#5d5f6b", strongBg: "#e3e7f7", strongFg: "#4e5ba0",
  breachBg: "#f7ece0", breachFg: "#a06a2a", panel: "#f7f7f9",
};
const SANS = "'Schibsted Grotesk',Helvetica,Arial,sans-serif";
const MONO = "'Fragment Mono',Menlo,Consolas,monospace";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function shell(subject: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:${C.bg};font-family:${SANS};color:${C.text}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.card};border:1px solid ${C.border};border-radius:10px"><tr><td style="padding:36px 40px">
${body}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

const brand = (right: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-family:${MONO};font-size:13px;letter-spacing:0.08em;color:${C.accent}">CLOCKCOVER</td>
<td align="right">${right}</td></tr></table>`;

const badge = (label: string, bg: string, fg: string) =>
  `<span style="font-family:${MONO};font-size:10.5px;letter-spacing:0.07em;text-transform:uppercase;padding:3px 8px;border-radius:4px;background:${bg};color:${fg};white-space:nowrap">${esc(label)}</span>`;

const footer = (lines: string[]) =>
  `<div style="border-top:1px solid ${C.rule};padding-top:16px;margin-top:24px;font-size:12.5px;line-height:1.5;color:${C.fainter}">${lines.map((l) => `<div>${l}</div>`).join("")}</div>`;

function gapDetail(v: GapView): string {
  const shift = v.shift ? `shift ${v.shift.plannedStart}–${v.shift.plannedEnd}` : "no scheduled shift";
  const rec = !v.record ? "no attendance record"
    : v.gap.gapType === "no_clockin" ? `clocked out ${v.record.clockOut ?? "?"} · no clock-in`
    : v.gap.gapType === "no_clockout" ? `clocked in ${v.record.clockIn ?? "?"} · no clock-out`
    : "no attendance record";
  return `${shift} · ${rec}`;
}

export function renderDigest(input: DigestEmailInput): Email {
  const { manager, gaps, slaHours, link } = input;
  const n = gaps.length;
  const noun = n === 1 ? "clock gap" : "clock gaps";
  const sorted = gaps.slice().sort((a, b) => b.gap.gapDate.localeCompare(a.gap.gapDate) || a.employeeName.localeCompare(b.employeeName));
  const firstName = manager.fullName.split(" ")[0] ?? manager.fullName;
  const subject = `${n} ${noun} on your team — ${shortDate(input.digestDate)}`;

  const rows = sorted.map((v) => {
    const strong = v.gap.gapType === "no_record_at_all";
    return `<tr>
<td style="padding:12px 0;border-bottom:1px solid ${C.rule};font-size:14.5px;font-weight:600">${esc(v.employeeName)}</td>
<td style="padding:12px 14px;border-bottom:1px solid ${C.rule};font-family:${MONO};font-size:12px;color:${C.muted};white-space:nowrap">${shortDate(v.gap.gapDate)}</td>
<td align="right" style="padding:12px 0;border-bottom:1px solid ${C.rule}">${badge(GAP_LABEL[v.gap.gapType], strong ? C.strongBg : C.badgeBg, strong ? C.strongFg : C.badgeFg)}</td>
</tr>`;
  }).join("");

  const html = shell(subject, `
${brand(`<span style="font-family:${MONO};font-size:12px;color:${C.faint}">${longDate(input.digestDate)}</span>`)}
<div style="margin-top:24px;font-size:22px;font-weight:700;letter-spacing:-0.01em">Good morning ${esc(firstName)} —</div>
<div style="margin-top:8px;font-size:15px;line-height:1.5;color:${C.body}">${n} of your team's scheduled shifts ${n === 1 ? "is" : "are"} missing clock entries. Each one escalates to payroll if it isn't resolved within ${slaHours} hours.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid ${C.rule}">${rows}</table>
<div style="margin-top:24px"><a href="${esc(link)}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px">Review and resolve</a></div>
${footer([
  `This link is signed for you and expires ${dayMonthYear(input.linkExpires)}. No account or password needed.`,
  `You're receiving this because you're the manager of record for these employees at ${esc(input.employerName)}.`,
])}`);

  const text = [
    `Good morning ${firstName} —`,
    "",
    `${n} of your team's scheduled shifts ${n === 1 ? "is" : "are"} missing clock entries. Each one escalates to payroll if it isn't resolved within ${slaHours} hours.`,
    "",
    ...sorted.map((v) => `  ${shortDate(v.gap.gapDate)}  ${v.employeeName}  —  ${GAP_LABEL[v.gap.gapType].toLowerCase()}`),
    "",
    `Review and resolve: ${link}`,
    "",
    `This link is signed for you and expires ${dayMonthYear(input.linkExpires)}. No account or password needed.`,
    `You're receiving this because you're the manager of record for these employees at ${input.employerName}.`,
  ].join("\n");

  return { to: manager.email, subject, text, html };
}

export interface EscalationEmailInput {
  escalation: Escalation;
  view: GapView;
  manager: Manager;
  employerName: string;
  slaHours: number;
  /** Signed link to close this gap as handled by payroll. */
  link: string;
  linkExpires: Date;
}

export function renderEscalation(input: EscalationEmailInput): Email {
  const { escalation, view, manager, slaHours } = input;
  const g = view.gap;
  const subject = `Escalation — gap unresolved after ${slaHours} h (${view.employeeName}, ${shortDate(g.gapDate)})`;
  const notified = g.managerNotifiedAt ? `${dateTime(g.managerNotifiedAt)} — no action recorded since` : "never";
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 20px 4px 0;font-family:${MONO};font-size:12px;color:${C.faint};vertical-align:top;white-space:nowrap">${k}</td><td style="padding:4px 0;font-size:14px">${v}</td></tr>`;

  const html = shell(subject, `
${brand(badge("SLA breach", C.breachBg, C.breachFg))}
<div style="margin-top:24px;font-size:22px;font-weight:700;letter-spacing:-0.01em">A gap passed its SLA without manager action</div>
<div style="margin-top:8px;font-size:15px;line-height:1.5;color:${C.body}">${esc(manager.fullName)} was notified and did not act within ${slaHours} hours. This gap is now yours to follow up.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;background:${C.panel};border:1px solid ${C.rule};border-radius:8px"><tr><td style="padding:14px 20px">
<table role="presentation" cellpadding="0" cellspacing="0">
${row("Employee", `<span style="font-weight:600">${esc(view.employeeName)}</span>`)}
${row("Gap", `${esc(GAP_LABEL[g.gapType])} · ${shortDate(g.gapDate)} · ${esc(gapDetail(view))}`)}
${row("Manager", esc(manager.fullName))}
${row("Notified", esc(notified))}
${row("Escalated", esc(dateTime(escalation.escalatedAt)))}
</table></td></tr></table>
<div style="margin-top:24px"><a href="${esc(input.link)}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px">Mark handled</a></div>
<div style="margin-top:10px;font-size:13px;line-height:1.5;color:${C.muted}">Use it when the clock entry will never arrive (leaver, retroactive leave, broken terminal). If the entry is coming with the next export, do nothing — the gap closes itself.</div>
${footer([
  `This link closes only this gap, needs a note, and expires ${dayMonthYear(input.linkExpires)}.`,
  "You receive only escalations — gaps managers resolve on time never reach you.",
  `This is the only notice for this gap. Sent to ${esc(escalation.escalatedTo)} for ${esc(input.employerName)}.`,
])}`);

  const text = [
    "A gap passed its SLA without manager action.",
    "",
    `${manager.fullName} was notified and did not act within ${slaHours} hours. This gap is now yours to follow up.`,
    "",
    `  Employee:  ${view.employeeName}`,
    `  Gap:       ${GAP_LABEL[g.gapType]} · ${shortDate(g.gapDate)} · ${gapDetail(view)}`,
    `  Manager:   ${manager.fullName}`,
    `  Notified:  ${notified}`,
    `  Escalated: ${dateTime(escalation.escalatedAt)}`,
    "",
    `Mark handled (when the entry will never arrive): ${input.link}`,
    `This link closes only this gap, needs a note, and expires ${dayMonthYear(input.linkExpires)}.`,
    "",
    "You receive only escalations — gaps managers resolve on time never reach you.",
    `This is the only notice for this gap. Sent to ${escalation.escalatedTo} for ${input.employerName}.`,
  ].join("\n");

  return { to: escalation.escalatedTo, subject, text, html };
}

export function renderMagicLink(input: { to: string; employerName: string; link: string; expires: Date }): Email {
  const subject = `Sign in to the ClockCover console — ${input.employerName}`;
  const html = shell(subject, `
${brand("")}
<div style="margin-top:24px;font-size:22px;font-weight:700;letter-spacing:-0.01em">Your sign-in link</div>
<div style="margin-top:8px;font-size:15px;line-height:1.5;color:${C.body}">Open the console for ${esc(input.employerName)}: imports, settings and the SLA overview.</div>
<div style="margin-top:24px"><a href="${esc(input.link)}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px">Open the console</a></div>
${footer([
  `This link signs you in for 7 days (until ${dayMonthYear(input.expires)}) and works only for ${esc(input.to)}.`,
  "If you did not ask for it, ignore this email — nothing happens without the link.",
])}`);
  const text = [
    `Your sign-in link for the ClockCover console (${input.employerName}):`,
    "",
    input.link,
    "",
    `Valid for 7 days (until ${dayMonthYear(input.expires)}), only for ${input.to}. If you did not ask for it, ignore this email.`,
  ].join("\n");
  return { to: input.to, subject, text, html };
}

export type SendEmail = (email: Email) => Promise<void>;

/** Sends through Resend. Throws on non-2xx so the caller does not record a digest that was not sent. */
export function resendSender(config: EmailConfig, fetchFn: typeof fetch = fetch): SendEmail {
  return async (email) => {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: config.from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
      throw new Error(`email provider returned ${res.status} for ${email.to}: ${detail}`);
    }
  };
}
