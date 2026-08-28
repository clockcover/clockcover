// Email adapter — plain functions, no interface (ADR-0003). Renders the digest,
// escalation, sign-in and import-failure emails in the employer's language (en/he,
// Hebrew right-to-left) as HTML with a plain-text twin, and posts them to Resend's
// HTTP API (Workers cannot speak SMTP). The provider is a two-way door: only this
// file knows about it.
import type { Escalation, Gap, Locale, Manager } from "@clockcover/core";
import { GAP_LABEL, dateTime, dayMonthYear, isRtl, longDate, shortDate, t } from "../i18n.ts";

export interface EmailConfig {
  apiKey: string;
  from: string;
}

export interface Email { to: string; subject: string; text: string; html: string }

/** What the templates need about one gap beyond the row itself. */
export interface GapView {
  gap: Gap;
  employeeName: string;
  shift: { plannedStart: string; plannedEnd: string } | null;
  record: { clockIn: string | null; clockOut: string | null } | null;
}

// Email clients do not understand oklch; these are the design tokens as hex.
const C = {
  bg: "#ecedf1", card: "#ffffff", border: "#e0e1e7", rule: "#ececf0",
  text: "#2b2c33", body: "#4c4e59", muted: "#6d6f7c", faint: "#8b8d99", fainter: "#9a9ca7",
  accent: "#5b67a8", badgeBg: "#ededf0", badgeFg: "#5d5f6b", strongBg: "#e3e7f7", strongFg: "#4e5ba0",
  breachBg: "#f7ece0", breachFg: "#a06a2a", panel: "#f7f7f9",
};
const SANS = "'Schibsted Grotesk','Heebo',Helvetica,Arial,sans-serif";
const MONO = "'Fragment Mono',Menlo,Consolas,monospace";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function shell(locale: Locale, subject: string, body: string): string {
  const dir = isRtl(locale) ? "rtl" : "ltr";
  const align = isRtl(locale) ? "right" : "left";
  return `<!doctype html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:${C.bg};font-family:${SANS};color:${C.text};text-align:${align}" dir="${dir}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}" style="max-width:600px;background:${C.card};border:1px solid ${C.border};border-radius:10px"><tr><td style="padding:36px 40px;text-align:${align}">
${body}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

const brand = (locale: Locale, right: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${isRtl(locale) ? "rtl" : "ltr"}"><tr>
<td style="font-family:${MONO};font-size:13px;letter-spacing:0.08em;color:${C.accent}" dir="ltr">CLOCKCOVER</td>
<td align="${isRtl(locale) ? "left" : "right"}">${right}</td></tr></table>`;

const badge = (label: string, bg: string, fg: string) =>
  `<span style="font-family:${MONO};font-size:10.5px;letter-spacing:0.07em;text-transform:uppercase;padding:3px 8px;border-radius:4px;background:${bg};color:${fg};white-space:nowrap">${esc(label)}</span>`;

const footer = (lines: string[]) =>
  `<div style="border-top:1px solid ${C.rule};padding-top:16px;margin-top:24px;font-size:12.5px;line-height:1.5;color:${C.fainter}">${lines.map((l) => `<div>${l}</div>`).join("")}</div>`;

const button = (href: string, label: string) =>
  `<div style="margin-top:24px"><a href="${esc(href)}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px">${esc(label)}</a></div>`;

export function gapDetail(v: GapView, locale: Locale): string {
  const shift = v.shift ? t(locale, "esc.detail.shift", { start: v.shift.plannedStart, end: v.shift.plannedEnd }) : t(locale, "esc.detail.noShift");
  const rec = !v.record || v.gap.gapType === "no_record_at_all" ? t(locale, "esc.detail.noRecord")
    : v.gap.gapType === "no_clockin" ? t(locale, "esc.detail.noClockin", { out: v.record.clockOut ?? "?" })
    : t(locale, "esc.detail.noClockout", { in: v.record.clockIn ?? "?" });
  return `${shift} · ${rec}`;
}

export interface DigestEmailInput {
  locale: Locale;
  manager: Manager;
  employerName: string;
  gaps: GapView[];
  digestDate: string;
  slaHours: number;
  /** Signed link to the manager's digest page (ADR-0004). */
  link: string;
  linkExpires: Date;
}

export function renderDigest(input: DigestEmailInput): Email {
  const { locale: L, manager, gaps, slaHours, link } = input;
  const n = gaps.length;
  const noun = t(L, n === 1 ? "digest.gap" : "digest.gaps");
  const sorted = gaps.slice().sort((a, b) => b.gap.gapDate.localeCompare(a.gap.gapDate) || a.employeeName.localeCompare(b.employeeName));
  const firstName = manager.fullName.split(" ")[0] ?? manager.fullName;
  const subject = t(L, "digest.subject", { n, noun, date: shortDate(input.digestDate, L) });
  const lead = t(L, "digest.lead", { n, verb: t(L, n === 1 ? "digest.is" : "digest.are"), sla: slaHours }).replace(/\s{2,}/g, " ");

  const rows = sorted.map((v) => {
    const strong = v.gap.gapType === "no_record_at_all";
    return `<tr>
<td style="padding:12px 0;border-bottom:1px solid ${C.rule};font-size:14.5px;font-weight:600">${esc(v.employeeName)}</td>
<td style="padding:12px 14px;border-bottom:1px solid ${C.rule};font-family:${MONO};font-size:12px;color:${C.muted};white-space:nowrap">${shortDate(v.gap.gapDate, L)}</td>
<td align="${isRtl(L) ? "left" : "right"}" style="padding:12px 0;border-bottom:1px solid ${C.rule}">${badge(GAP_LABEL[L][v.gap.gapType], strong ? C.strongBg : C.badgeBg, strong ? C.strongFg : C.badgeFg)}</td>
</tr>`;
  }).join("");

  const html = shell(L, subject, `
${brand(L, `<span style="font-family:${MONO};font-size:12px;color:${C.faint}">${longDate(input.digestDate, L)}</span>`)}
<div style="margin-top:24px;font-size:22px;font-weight:700;letter-spacing:-0.01em">${esc(t(L, "digest.greeting", { name: firstName }))}</div>
<div style="margin-top:8px;font-size:15px;line-height:1.5;color:${C.body}">${esc(lead)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid ${C.rule}">${rows}</table>
${button(link, t(L, "digest.cta"))}
${footer([
  esc(t(L, "digest.footer.link", { date: dayMonthYear(input.linkExpires, L) })),
  esc(t(L, "digest.footer.why", { employer: input.employerName })),
])}`);

  const text = [
    t(L, "digest.greeting", { name: firstName }),
    "",
    lead,
    "",
    ...sorted.map((v) => `  ${shortDate(v.gap.gapDate, L)}  ${v.employeeName}  —  ${GAP_LABEL[L][v.gap.gapType].toLowerCase()}`),
    "",
    `${t(L, "digest.cta")}: ${link}`,
    "",
    t(L, "digest.footer.link", { date: dayMonthYear(input.linkExpires, L) }),
    t(L, "digest.footer.why", { employer: input.employerName }),
  ].join("\n");

  return { to: manager.email, subject, text, html };
}

export interface EscalationEmailInput {
  locale: Locale;
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
  const { locale: L, escalation, view, manager, slaHours } = input;
  const g = view.gap;
  const subject = t(L, "esc.subject", { sla: slaHours, employee: view.employeeName, date: shortDate(g.gapDate, L) });
  const notified = g.managerNotifiedAt ? t(L, "esc.notified.noAction", { when: dateTime(g.managerNotifiedAt, L) }) : t(L, "esc.notified.none");
  const gapLine = `${GAP_LABEL[L][g.gapType]} · ${shortDate(g.gapDate, L)} · ${gapDetail(view, L)}`;
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px ${isRtl(L) ? "0 4px 20px" : "20px 4px 0"};font-family:${MONO};font-size:12px;color:${C.faint};vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0;font-size:14px">${v}</td></tr>`;

  const html = shell(L, subject, `
${brand(L, badge(t(L, "esc.badge"), C.breachBg, C.breachFg))}
<div style="margin-top:24px;font-size:22px;font-weight:700;letter-spacing:-0.01em">${esc(t(L, "esc.title"))}</div>
<div style="margin-top:8px;font-size:15px;line-height:1.5;color:${C.body}">${esc(t(L, "esc.lead", { manager: manager.fullName, sla: slaHours }))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;background:${C.panel};border:1px solid ${C.rule};border-radius:8px"><tr><td style="padding:14px 20px">
<table role="presentation" cellpadding="0" cellspacing="0">
${row(t(L, "esc.employee"), `<span style="font-weight:600">${esc(view.employeeName)}</span>`)}
${row(t(L, "esc.gap"), esc(gapLine))}
${row(t(L, "esc.manager"), esc(manager.fullName))}
${row(t(L, "esc.notified"), esc(notified))}
${row(t(L, "esc.escalated"), esc(dateTime(escalation.escalatedAt, L)))}
</table></td></tr></table>
${button(input.link, t(L, "esc.cta"))}
<div style="margin-top:10px;font-size:13px;line-height:1.5;color:${C.muted}">${esc(t(L, "esc.cta.help"))}</div>
${footer([
  esc(t(L, "esc.footer.link", { date: dayMonthYear(input.linkExpires, L) })),
  esc(t(L, "esc.footer.only")),
  esc(t(L, "esc.footer.sent", { to: escalation.escalatedTo, employer: input.employerName })),
])}`);

  const text = [
    t(L, "esc.title") + ".",
    "",
    t(L, "esc.lead", { manager: manager.fullName, sla: slaHours }),
    "",
    `  ${t(L, "esc.employee")}:  ${view.employeeName}`,
    `  ${t(L, "esc.gap")}:  ${gapLine}`,
    `  ${t(L, "esc.manager")}:  ${manager.fullName}`,
    `  ${t(L, "esc.notified")}:  ${notified}`,
    `  ${t(L, "esc.escalated")}:  ${dateTime(escalation.escalatedAt, L)}`,
    "",
    `${t(L, "esc.cta")}: ${input.link}`,
    t(L, "esc.footer.link", { date: dayMonthYear(input.linkExpires, L) }),
    "",
    t(L, "esc.footer.only"),
    t(L, "esc.footer.sent", { to: escalation.escalatedTo, employer: input.employerName }),
  ].join("\n");

  return { to: escalation.escalatedTo, subject, text, html };
}

export function renderMagicLink(input: { locale: Locale; to: string; employerName: string; link: string; expires: Date; area?: "console" | "admin" }): Email {
  const L = input.locale;
  const area = input.area ?? "console";
  const subject = area === "admin" ? t(L, "magic.subject.admin") : t(L, "magic.subject.console", { employer: input.employerName });
  const lead = area === "admin" ? t(L, "magic.lead.admin") : t(L, "magic.lead.console", { employer: input.employerName });
  const html = shell(L, subject, `
${brand(L, "")}
<div style="margin-top:24px;font-size:22px;font-weight:700;letter-spacing:-0.01em">${esc(t(L, "magic.title"))}</div>
<div style="margin-top:8px;font-size:15px;line-height:1.5;color:${C.body}">${esc(lead)}</div>
${button(input.link, t(L, area === "admin" ? "magic.cta.admin" : "magic.cta.console"))}
${footer([
  esc(t(L, "magic.footer.valid", { date: dayMonthYear(input.expires, L), to: input.to })),
  esc(t(L, "magic.footer.ignore")),
])}`);
  const text = [subject + ":", "", input.link, "", t(L, "magic.footer.valid", { date: dayMonthYear(input.expires, L), to: input.to }), t(L, "magic.footer.ignore")].join("\n");
  return { to: input.to, subject, text, html };
}

export function renderImportFailure(input: { locale: Locale; to: string; employerName: string; step: "roster" | "import"; message: string; details: string[]; consoleUrl: string }): Email {
  const L = input.locale;
  const step = t(L, input.step === "roster" ? "step.roster" : "step.import");
  const subject = t(L, "imp.subject", { step, employer: input.employerName });
  const list = input.details.slice(0, 20);
  const more = input.details.length > 20 ? t(L, "imp.more", { n: input.details.length - 20 }) : "";
  const html = shell(L, subject, `
${brand(L, badge(t(L, "imp.badge"), C.breachBg, C.breachFg))}
<div style="margin-top:24px;font-size:22px;font-weight:700;letter-spacing:-0.01em">${esc(t(L, "imp.title", { step }))}</div>
<div style="margin-top:8px;font-size:15px;line-height:1.5;color:${C.body}">${esc(t(L, "imp.lead", { message: input.message }))}</div>
${list.length ? `<pre dir="ltr" style="margin-top:16px;padding:14px 16px;background:${C.panel};border:1px solid ${C.rule};border-radius:8px;font-family:${MONO};font-size:12px;line-height:1.5;white-space:pre-wrap;text-align:left">${esc(list.join("\n"))}${more ? `\n${esc(more)}` : ""}</pre>` : ""}
${button(`${input.consoleUrl}/console/imports`, t(L, "imp.cta"))}
${footer([esc(t(L, "imp.footer"))])}`);
  const text = [
    t(L, "imp.title", { step }) + ": " + input.message + ".",
    ...(list.length ? ["", ...list, more].filter(Boolean) : []),
    "",
    t(L, "imp.footer"),
    `${input.consoleUrl}/console/imports`,
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
