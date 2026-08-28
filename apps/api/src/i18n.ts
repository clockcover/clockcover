// Email copy in both languages. Keys are stable; `he` is right-to-left.
// Terms follow docs/glossary.md: gap = פער, digest = תקציר, escalation = הועבר לחשב/ת השכר.
import type { GapType, Locale, Outcome } from "@clockcover/core";

export const isRtl = (l: Locale) => l === "he";

export const GAP_LABEL: Record<Locale, Record<GapType, string>> = {
  en: { no_clockin: "No clock-in", no_clockout: "No clock-out", no_record_at_all: "No record" },
  he: { no_clockin: "אין החתמת כניסה", no_clockout: "אין החתמת יציאה", no_record_at_all: "אין רישום כלל" },
};

export const OUTCOME_LABEL: Record<Locale, Record<Outcome, string>> = {
  en: { present: "hours approved", absent: "absence reported" },
  he: { present: "השעות אושרו", absent: "דווחה היעדרות" },
};

type Vars = Record<string, string | number>;
const fill = (s: string, v: Vars = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? `{${k}}`));

const MESSAGES = {
  en: {
    // digest
    "digest.subject": "{n} {noun} on your team — {date}",
    "digest.gap": "clock gap", "digest.gaps": "clock gaps",
    "digest.greeting": "Good morning {name} —",
    "digest.lead": "{n} of your team's scheduled shifts {verb} missing clock entries. Each one escalates to payroll if it isn't resolved within {sla} hours.",
    "digest.is": "is", "digest.are": "are",
    "digest.cta": "Review and resolve",
    "digest.footer.link": "This link is signed for you and expires {date}. No account or password needed.",
    "digest.footer.why": "You're receiving this because you're the manager of record for these employees at {employer}.",
    // escalation
    "esc.subject": "Escalation — gap unresolved after {sla} h ({employee}, {date})",
    "esc.badge": "SLA breach",
    "esc.title": "A gap passed its SLA without manager action",
    "esc.lead": "{manager} was notified and did not act within {sla} hours. This gap is now yours to follow up.",
    "esc.employee": "Employee", "esc.gap": "Gap", "esc.manager": "Manager", "esc.notified": "Notified", "esc.escalated": "Escalated",
    "esc.notified.none": "never",
    "esc.notified.noAction": "{when} — no action recorded since",
    "esc.cta": "Mark handled",
    "esc.cta.help": "Use it when the clock entry will never arrive (leaver, retroactive leave, broken terminal). If the entry is coming with the next export, do nothing — the gap closes itself.",
    "esc.footer.link": "This link closes only this gap, needs a note, and expires {date}.",
    "esc.footer.only": "You receive only escalations — gaps managers resolve on time never reach you.",
    "esc.footer.sent": "This is the only notice for this gap. Sent to {to} for {employer}.",
    "esc.detail.shift": "shift {start}–{end}", "esc.detail.noShift": "no scheduled shift",
    "esc.detail.noRecord": "no attendance record",
    "esc.detail.noClockin": "clocked out {out} · no clock-in", "esc.detail.noClockout": "clocked in {in} · no clock-out",
    // magic link
    "magic.subject.console": "Sign in to the ClockCover console — {employer}",
    "magic.subject.admin": "Sign in to ClockCover admin",
    "magic.title": "Your sign-in link",
    "magic.lead.console": "Open the console for {employer}: imports, settings and the SLA overview.",
    "magic.lead.admin": "Open the admin area: every employer, its operator, headcount and health.",
    "magic.cta.console": "Open the console", "magic.cta.admin": "Open admin",
    "magic.footer.valid": "This link signs you in for 7 days (until {date}) and works only for {to}.",
    "magic.footer.ignore": "If you did not ask for it, ignore this email — nothing happens without the link.",
    // import failure
    "imp.subject": "ClockCover: today's {step} import failed — {employer}",
    "imp.badge": "import failed",
    "imp.title": "The scheduled {step} import did not run",
    "imp.lead": "{message}. Today's digests were sent from the data already in ClockCover.",
    "imp.cta": "Open imports",
    "imp.footer": "Fix the file at its URL and press “Run import now” in the console, or upload the file by hand. The next scheduled run will try again anyway.",
    "imp.more": "… and {n} more",
    "step.roster": "roster", "step.import": "export",
  },
  he: {
    "digest.subject": "{n} {noun} בצוות שלך — {date}",
    "digest.gap": "פער החתמה", "digest.gaps": "פערי החתמה",
    "digest.greeting": "בוקר טוב {name},",
    "digest.lead": "ב-{n} ממשמרות הצוות שלך חסרות החתמות. כל פער שלא יטופל בתוך {sla} שעות יועבר לחשב/ת השכר.",
    "digest.is": "", "digest.are": "",
    "digest.cta": "לצפייה ולטיפול",
    "digest.footer.link": "הקישור חתום עבורך בלבד ותקף עד {date}. אין צורך בחשבון או בסיסמה.",
    "digest.footer.why": "קיבלת הודעה זו כי את/ה המנהל/ת הרשום/ה של העובדים האלה ב{employer}.",
    "esc.subject": "העברה לשכר — פער לא טופל בתוך {sla} שעות ({employee}, {date})",
    "esc.badge": "חריגה מזמן התגובה",
    "esc.title": "פער עבר את זמן התגובה ללא טיפול המנהל/ת",
    "esc.lead": "{manager} קיבל/ה הודעה ולא טיפל/ה בתוך {sla} שעות. הפער הזה עובר עכשיו לטיפולך.",
    "esc.employee": "עובד/ת", "esc.gap": "פער", "esc.manager": "מנהל/ת", "esc.notified": "הודעה נשלחה", "esc.escalated": "הועבר",
    "esc.notified.none": "לא נשלחה",
    "esc.notified.noAction": "{when} — לא נרשמה פעולה מאז",
    "esc.cta": "סימון כטופל",
    "esc.cta.help": "לשימוש כשההחתמה לא תגיע לעולם (עובד/ת שסיים/ה, חופשה בדיעבד, שעון תקול). אם ההחתמה תגיע בייצוא הבא — אין צורך לעשות דבר, הפער ייסגר מעצמו.",
    "esc.footer.link": "הקישור סוגר רק את הפער הזה, דורש הערה ותקף עד {date}.",
    "esc.footer.only": "מגיעים אליך רק פערים שהועברו — פערים שמנהלים מטפלים בהם בזמן לא מגיעים אליך כלל.",
    "esc.footer.sent": "זו ההודעה היחידה על הפער הזה. נשלחה אל {to} עבור {employer}.",
    "esc.detail.shift": "משמרת {start}–{end}", "esc.detail.noShift": "ללא משמרת מתוכננת",
    "esc.detail.noRecord": "אין רישום נוכחות",
    "esc.detail.noClockin": "יציאה {out} · אין החתמת כניסה", "esc.detail.noClockout": "כניסה {in} · אין החתמת יציאה",
    "magic.subject.console": "כניסה ללוח הבקרה של ClockCover — {employer}",
    "magic.subject.admin": "כניסה לניהול ClockCover",
    "magic.title": "קישור הכניסה שלך",
    "magic.lead.console": "כניסה ללוח הבקרה של {employer}: ייבוא, הגדרות וסקירת זמני התגובה.",
    "magic.lead.admin": "כניסה לאזור הניהול: כל המעסיקים, המפעילים, מספר העובדים והמצב.",
    "magic.cta.console": "ללוח הבקרה", "magic.cta.admin": "לאזור הניהול",
    "magic.footer.valid": "הקישור מכניס אותך למערכת ל-7 ימים (עד {date}) ותקף רק עבור {to}.",
    "magic.footer.ignore": "אם לא ביקשת אותו — אפשר להתעלם מההודעה; בלי הקישור לא קורה דבר.",
    "imp.subject": "ClockCover: ייבוא {step} של היום נכשל — {employer}",
    "imp.badge": "הייבוא נכשל",
    "imp.title": "ייבוא {step} המתוזמן לא רץ",
    "imp.lead": "{message}. התקצירים של היום נשלחו על בסיס הנתונים שכבר קיימים ב-ClockCover.",
    "imp.cta": "לייבוא",
    "imp.footer": "תקנו את הקובץ בכתובתו ולחצו \"הרצת ייבוא עכשיו\" בלוח הבקרה, או העלו את הקובץ ידנית. הריצה המתוזמנת הבאה תנסה שוב בכל מקרה.",
    "imp.more": "… ועוד {n}",
    "step.roster": "רשימת העובדים", "step.import": "הייצוא",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type MessageKey = keyof typeof MESSAGES.en;

export const t = (locale: Locale, key: MessageKey, vars?: Vars): string => fill(MESSAGES[locale][key], vars);

// ---- dates
const WD: Record<Locale, string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  he: ["יום א׳", "יום ב׳", "יום ג׳", "יום ד׳", "יום ה׳", "יום ו׳", "שבת"],
};
const MON: Record<Locale, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  he: ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"],
};

/** "2026-08-27" → "Thu 27 Aug" / "יום ה׳ 27 אוג׳" */
export function shortDate(isoDate: string, locale: Locale = "en"): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${WD[locale][d.getUTCDay()]} ${d.getUTCDate()} ${MON[locale][d.getUTCMonth()]}`;
}
export const longDate = (isoDate: string, locale: Locale = "en") => `${shortDate(isoDate, locale)} ${isoDate.slice(0, 4)}`;

/** Instant → "Wed 26 Aug, 08:00" (UTC) */
export function dateTime(d: Date, locale: Locale = "en"): string {
  const hh = String(d.getUTCHours()).padStart(2, "0"), mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${shortDate(d.toISOString().slice(0, 10), locale)}, ${hh}:${mm}`;
}
/** Instant → "10 Sep 2026" */
export const dayMonthYear = (d: Date, locale: Locale = "en") => `${d.getUTCDate()} ${MON[locale][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
