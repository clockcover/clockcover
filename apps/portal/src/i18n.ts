// UI copy in both languages for the portal (manager page, payroll page), the console
// and the admin area. Hebrew is right-to-left. Terms follow docs/glossary.md.
import { computed, ref } from "vue";

export type Locale = "en" | "he";
export const isRtl = (l: Locale) => l === "he";

type Vars = Record<string, string | number>;
const fill = (s: string, v: Vars = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? `{${k}}`));

const M = {
  en: {
    // shared
    "lang.switch": "עברית",
    "brand.console": "console", "brand.admin": "admin",
    "loading": "Loading…", "signOut": "Sign out", "save": "Save", "saved": "Saved", "cancel": "Cancel",
    "link.invalid.title": "Link not valid",
    "link.invalid.digest": "This link has expired or is not valid. Open the newest digest email — every day's email carries a fresh link.",
    "link.invalid.escalation": "This link has expired or is not valid. Escalation links work for 14 days and only for the address they were sent to.",
    "error.load": "Could not load. Please try again in a moment.",
    // landing (no token)
    "landing.title": "Open your digest from the email",
    "landing.lead": "The link in your daily digest is the only way in — it is signed for you and needs no account or password.",
    "landing.operators": "Operators:", "landing.consoleLink": "sign in to the console",
    // gap types / outcomes
    "gap.no_clockin": "No clock-in", "gap.no_clockout": "No clock-out", "gap.no_record_at_all": "No record",
    "outcome.present.label": "Approve the hours — was at work, clock entry missing",
    "outcome.absent.label": "Report an absence — was not at work, explain below",
    "outcome.present.short": "hours approved", "outcome.absent.short": "absence reported",
    "detail.shift": "shift {start}–{end}", "detail.noShift": "no scheduled shift", "detail.noRecord": "no attendance record",
    "detail.noClockin": "clocked out {out} · no clock-in", "detail.noClockout": "clocked in {in} · no clock-out",
    // digest page
    "digest.header": "digest · {date}",
    "digest.allClear.title": "All clear",
    "digest.allClear.lead": "Every scheduled shift on your team has a complete clock record for this period. Nothing to resolve.",
    "digest.open": "{n} open {noun} on your team", "digest.gap": "gap", "digest.gaps": "gaps",
    "digest.what": "What happened on {date}?",
    "digest.note.absent": "Required — what happened? e.g. sick, called in at 07:30",
    "digest.note.present": "Optional note — e.g. badge left at home, confirmed by phone",
    "digest.resolve": "Resolve", "digest.resolveGap": "Resolve gap",
    "digest.resolvedNow": "✓ Resolved by you just now — {outcome}",
    "digest.already": "That gap was already resolved.", "digest.resolveFailed": "Could not resolve the gap. Please try again.",
    "sla.escalated": "Escalated to payroll — SLA passed", "sla.soon": "Escalates to payroll in {h} h", "sla.notified": "Notified {when}", "sla.notYet": "Not yet in a digest",
    "digest.unscheduled.title": "Unscheduled attendance — not a gap",
    "digest.unscheduled.line": "{name} clocked {in}–{out} on {date} with no scheduled shift. Nothing to resolve — noted as a sanity check.",
    "digest.footer.link": "This link is yours alone · expires {date}",
    "digest.footer.sla": "Unresolved gaps escalate to payroll after {h} h",
    // escalation page
    "esc.badge": "SLA breach", "esc.title": "Escalated gap", "esc.sub": "{employer} · manager {manager}",
    "esc.notified": "Manager notified {when} — no action recorded", "esc.never": "never", "esc.escalated": "Escalated {when}",
    "esc.closed": "✓ Closed — {outcome}", "esc.by.payroll": "by payroll", "esc.by.manager": "by the manager", "esc.by.record": "a record arrived",
    "esc.mark": "Mark handled",
    "esc.help": "Use this when the clock entry will never arrive. If it is coming with the next export, do nothing — the gap closes itself and counts as worked.",
    "esc.note": "Required — why will the entry never arrive? e.g. left the company on 1 March",
    "esc.close": "Close gap", "esc.already": "This gap was already closed.", "esc.failed": "Could not close the gap.",
    "esc.footer.link": "This link closes only this gap · expires {date}",
    "esc.footer.only": "You receive only escalations — gaps managers resolve on time never reach you",
    // console
    "c.signin.title": "Sign in to the console",
    "c.signin.lead": "Enter the operator email for your employer. We'll send a link that signs you in for 7 days — no password.",
    "c.signin.send": "Send sign-in link", "c.signin.expired": "Your sign-in link has expired or is not valid. Request a new one.", "c.signin.api": "Could not reach the API.", "c.signedOut": "Signed out.",
    "c.tab.overview": "Overview", "c.tab.imports": "Imports", "c.tab.settings": "Settings",
    "c.ov.open": "Open gaps", "c.ov.escalatedN": "{n} already escalated", "c.ov.acted": "Acted within SLA · {d} d", "c.ov.ofNotified": "{a} of {n} gaps in a digest",
    "c.ov.escalated": "Escalated · {d} d", "c.ov.closedBy": "{p} closed by payroll · {r} closed by a later import",
    "c.ov.outcomes": "Outcomes · {d} d", "c.ov.present": "hours approved (entry missing)", "c.ov.absent": "absences reported",
    "c.ov.byManager": "Open gaps by manager", "c.ov.allClear": "All clear — no open gaps.", "c.ov.row": "{n} open · oldest {date}",
    "c.ov.note": "Individual gaps are the managers' to resolve; you are emailed only when one passes the SLA.",
    "c.imp.roster": "Roster", "c.imp.roster.lead": "Who reports to whom. Columns: {cols}. Re-upload to record changes; detected gaps keep their manager.",
    "c.imp.roster.btn": "Upload roster CSV", "c.imp.roster.done": "{n} employees on the roster.",
    "c.imp.export": "Shifts & clock entries", "c.imp.export.lead": "The export from your attendance system. Columns: {cols}. One row per employee per day. Detection runs on upload.",
    "c.imp.export.btn": "Upload export CSV", "c.imp.export.done": "✓ {s} shifts, {r} records for {from} – {to}",
    "c.imp.gaps": "{c} new gaps · {r} gaps closed by this file", "c.imp.unknown": "Not on the roster, rows skipped: {list}",
    "c.imp.url.title": "Daily import from URL", "c.imp.url.run": "Run import now",
    "c.imp.url.lead": "Runs every morning before the digests if a URL is set in Settings. Use the button to fetch immediately — after fixing a file, or to check a new URL.",
    "c.imp.url.roster": "✓ Roster: {n} employees", "c.imp.url.export": "✓ Export: {s} shifts, {r} records · {c} new gaps · {x} closed",
    "c.imp.exp.title": "Export corrections",
    "c.imp.exp.lead": "Gaps closed by a manager or by payroll in the period — approved hours and reported absences with their notes — as CSV, for carrying into your attendance or payroll system.",
    "c.imp.exp.from": "From", "c.imp.exp.to": "To", "c.imp.exp.btn": "Download CSV",
    "c.imp.history": "Import history", "c.imp.none": "No imports yet.", "c.imp.fetched": "fetched from URL", "c.imp.uploaded": "uploaded", "c.imp.rows": "{n} rows",
    "c.set.name": "Employer name", "c.set.payroll": "Payroll accountant email — receives escalations", "c.set.operator": "Operator email — may sign in here",
    "c.set.tz": "Timezone (IANA)", "c.set.sla": "SLA, hours before escalation", "c.set.locale": "Language of emails and pages",
    "c.set.url.title": "Daily import from a URL",
    "c.set.url.lead": "If your attendance system publishes its export at a fixed https address, put it here: every morning ClockCover fetches it before sending digests, and emails you if the fetch or the file fails. Leave empty to upload files by hand. The URL itself is the credential — use one with a secret in it.",
    "c.set.url.export": "Shifts & clock entries export (CSV, https)", "c.set.url.roster": "Roster (CSV, https) — optional",
    "c.set.note": "\"Today\" for digests follows the timezone; the daily job runs at 08:00 UTC. Changing the operator email signs the old address out. Your session lasts until {date}.",
    // admin
    "a.signin.title": "Sign in to admin", "a.signin.lead": "The owner's address only. A link that signs you in for 7 days arrives by email.",
    "a.employers": "Employers", "a.new": "New employer", "a.create": "Create and invite", "a.created": "Created — invite sent to {email}.",
    "a.opChanged": "Operator changed — invite sent to {email}.", "a.inviteSent": "Invite sent to {email}.",
    "a.f.name": "Employer name", "a.f.tz": "Timezone (IANA)", "a.f.payroll": "Payroll accountant email", "a.f.operator": "Operator email — gets the console invite", "a.f.locale": "Language",
    "a.slaNote": "SLA starts at 48 h; the operator can change it in the console.",
    "a.none": "No employers yet.",
    "a.th.employer": "Employer", "a.th.operator": "Operator", "a.th.employees": "Employees", "a.th.tier": "Tier", "a.th.open": "Open gaps", "a.th.lastImport": "Last import", "a.th.source": "Source",
    "a.change": "change", "a.none.op": "none", "a.mgr": "mgr", "a.esc": "esc.", "a.never": "never", "a.upload": "upload", "a.url": "URL", "a.resend": "Resend invite",
    "a.tierNote": "Tier is by active employees on the roster (ADR-0006): Team ≤ 50 ($49), Company ≤ 200 ($149), Site ≤ 500 ($349), Larger by agreement.",
    "lang.en": "English", "lang.he": "עברית",
  },
  he: {
    "lang.switch": "English",
    "brand.console": "לוח הבקרה", "brand.admin": "ניהול",
    "loading": "טוען…", "signOut": "יציאה", "save": "שמירה", "saved": "נשמר", "cancel": "ביטול",
    "link.invalid.title": "הקישור אינו תקף",
    "link.invalid.digest": "הקישור פג או אינו תקף. פתחו את מייל התקציר האחרון — בכל מייל יומי יש קישור חדש.",
    "link.invalid.escalation": "הקישור פג או אינו תקף. קישורי העברה לשכר תקפים 14 יום ורק לכתובת שאליה נשלחו.",
    "error.load": "לא ניתן לטעון. נסו שוב בעוד רגע.",
    "landing.title": "פתחו את התקציר מהמייל",
    "landing.lead": "הקישור בתקציר היומי הוא הדרך היחידה להיכנס — הוא חתום עבורכם ולא דורש חשבון או סיסמה.",
    "landing.operators": "מפעילים:", "landing.consoleLink": "כניסה ללוח הבקרה",
    "gap.no_clockin": "אין החתמת כניסה", "gap.no_clockout": "אין החתמת יציאה", "gap.no_record_at_all": "אין רישום כלל",
    "outcome.present.label": "אישור שעות — היה/תה בעבודה, ההחתמה חסרה",
    "outcome.absent.label": "דיווח היעדרות — לא היה/תה בעבודה, פרטו למטה",
    "outcome.present.short": "השעות אושרו", "outcome.absent.short": "דווחה היעדרות",
    "detail.shift": "משמרת {start}–{end}", "detail.noShift": "ללא משמרת מתוכננת", "detail.noRecord": "אין רישום נוכחות",
    "detail.noClockin": "יציאה {out} · אין החתמת כניסה", "detail.noClockout": "כניסה {in} · אין החתמת יציאה",
    "digest.header": "תקציר · {date}",
    "digest.allClear.title": "הכול תקין",
    "digest.allClear.lead": "לכל משמרת מתוכננת בצוות שלכם יש רישום החתמות מלא לתקופה הזו. אין מה לטפל.",
    "digest.open": "{n} {noun} פתוחים בצוות שלך", "digest.gap": "פער", "digest.gaps": "פערים",
    "digest.what": "מה קרה ב{date}?",
    "digest.note.absent": "חובה — מה קרה? למשל: מחלה, הודיע/ה ב-07:30",
    "digest.note.present": "הערה (לא חובה) — למשל: הכרטיס נשאר בבית, אומת טלפונית",
    "digest.resolve": "טיפול", "digest.resolveGap": "סגירת הפער",
    "digest.resolvedNow": "✓ טופל על ידך הרגע — {outcome}",
    "digest.already": "הפער הזה כבר טופל.", "digest.resolveFailed": "לא ניתן לסגור את הפער. נסו שוב.",
    "sla.escalated": "הועבר לחשב/ת השכר — זמן התגובה עבר", "sla.soon": "יועבר לשכר בעוד {h} שעות", "sla.notified": "הודעה נשלחה {when}", "sla.notYet": "עדיין לא נכלל בתקציר",
    "digest.unscheduled.title": "נוכחות ללא משמרת — לא פער",
    "digest.unscheduled.line": "{name} החתים/ה {in}–{out} ב{date} ללא משמרת מתוכננת. אין מה לטפל — נרשם לבדיקה בלבד.",
    "digest.footer.link": "הקישור הזה שלך בלבד · תקף עד {date}",
    "digest.footer.sla": "פערים שלא טופלו עוברים לחשב/ת השכר אחרי {h} שעות",
    "esc.badge": "חריגה מזמן התגובה", "esc.title": "פער שהועבר לשכר", "esc.sub": "{employer} · מנהל/ת {manager}",
    "esc.notified": "המנהל/ת קיבל/ה הודעה {when} — לא נרשמה פעולה", "esc.never": "מעולם לא", "esc.escalated": "הועבר {when}",
    "esc.closed": "✓ נסגר — {outcome}", "esc.by.payroll": "על ידי חשב/ת השכר", "esc.by.manager": "על ידי המנהל/ת", "esc.by.record": "הגיע רישום",
    "esc.mark": "סימון כטופל",
    "esc.help": "לשימוש כשההחתמה לא תגיע לעולם. אם היא תגיע בייצוא הבא — אין צורך לעשות דבר; הפער ייסגר מעצמו וייספר כעבודה.",
    "esc.note": "חובה — למה ההחתמה לא תגיע? למשל: סיים/ה לעבוד ב-1 במרץ",
    "esc.close": "סגירת הפער", "esc.already": "הפער הזה כבר נסגר.", "esc.failed": "לא ניתן לסגור את הפער.",
    "esc.footer.link": "הקישור סוגר רק את הפער הזה · תקף עד {date}",
    "esc.footer.only": "מגיעים אליך רק פערים שהועברו — פערים שמנהלים מטפלים בהם בזמן לא מגיעים אליך",
    "c.signin.title": "כניסה ללוח הבקרה",
    "c.signin.lead": "הזינו את כתובת המפעיל/ה של המעסיק. נשלח קישור שמכניס אותכם ל-7 ימים — בלי סיסמה.",
    "c.signin.send": "שליחת קישור כניסה", "c.signin.expired": "קישור הכניסה פג או אינו תקף. בקשו קישור חדש.", "c.signin.api": "אין חיבור ל-API.", "c.signedOut": "יצאת מהמערכת.",
    "c.tab.overview": "סקירה", "c.tab.imports": "ייבוא", "c.tab.settings": "הגדרות",
    "c.ov.open": "פערים פתוחים", "c.ov.escalatedN": "{n} כבר הועברו לשכר", "c.ov.acted": "טופלו בזמן התגובה · {d} ימים", "c.ov.ofNotified": "{a} מתוך {n} פערים שנכללו בתקציר",
    "c.ov.escalated": "הועברו לשכר · {d} ימים", "c.ov.closedBy": "{p} נסגרו על ידי השכר · {r} נסגרו בייבוא מאוחר",
    "c.ov.outcomes": "תוצאות · {d} ימים", "c.ov.present": "שעות שאושרו (החתמה חסרה)", "c.ov.absent": "היעדרויות שדווחו",
    "c.ov.byManager": "פערים פתוחים לפי מנהל/ת", "c.ov.allClear": "הכול תקין — אין פערים פתוחים.", "c.ov.row": "{n} פתוחים · הישן ביותר {date}",
    "c.ov.note": "פערים בודדים הם באחריות המנהלים; תקבלו מייל רק כשפער עובר את זמן התגובה.",
    "c.imp.roster": "רשימת עובדים", "c.imp.roster.lead": "מי מדווח/ת למי. עמודות: {cols}. העלו שוב לרישום שינויים; פערים שזוהו שומרים את המנהל/ת שלהם.",
    "c.imp.roster.btn": "העלאת רשימת עובדים (CSV)", "c.imp.roster.done": "{n} עובדים ברשימה.",
    "c.imp.export": "משמרות והחתמות", "c.imp.export.lead": "קובץ הייצוא ממערכת הנוכחות. עמודות: {cols}. שורה אחת לעובד/ת ליום. הזיהוי רץ עם ההעלאה.",
    "c.imp.export.btn": "העלאת קובץ ייצוא (CSV)", "c.imp.export.done": "✓ {s} משמרות, {r} רישומים עבור {from} – {to}",
    "c.imp.gaps": "{c} פערים חדשים · {r} פערים שנסגרו על ידי הקובץ", "c.imp.unknown": "לא ברשימת העובדים, שורות שנדלגו: {list}",
    "c.imp.url.title": "ייבוא יומי מכתובת URL", "c.imp.url.run": "הרצת ייבוא עכשיו",
    "c.imp.url.lead": "רץ בכל בוקר לפני התקצירים אם הוגדרה כתובת בהגדרות. הכפתור מושך מיד — אחרי תיקון קובץ או לבדיקת כתובת חדשה.",
    "c.imp.url.roster": "✓ רשימת עובדים: {n} עובדים", "c.imp.url.export": "✓ ייצוא: {s} משמרות, {r} רישומים · {c} פערים חדשים · {x} נסגרו",
    "c.imp.exp.title": "ייצוא תיקונים",
    "c.imp.exp.lead": "פערים שנסגרו על ידי מנהל/ת או השכר בתקופה — שעות שאושרו והיעדרויות שדווחו עם ההערות — כ-CSV, להעברה למערכת הנוכחות או השכר.",
    "c.imp.exp.from": "מתאריך", "c.imp.exp.to": "עד תאריך", "c.imp.exp.btn": "הורדת CSV",
    "c.imp.history": "היסטוריית ייבוא", "c.imp.none": "עדיין אין ייבוא.", "c.imp.fetched": "נמשך מכתובת URL", "c.imp.uploaded": "הועלה", "c.imp.rows": "{n} שורות",
    "c.set.name": "שם המעסיק", "c.set.payroll": "כתובת חשב/ת השכר — מקבל/ת העברות", "c.set.operator": "כתובת המפעיל/ה — רשאי/ת להיכנס כאן",
    "c.set.tz": "אזור זמן (IANA)", "c.set.sla": "זמן תגובה, שעות עד העברה לשכר", "c.set.locale": "שפת המיילים והדפים",
    "c.set.url.title": "ייבוא יומי מכתובת URL",
    "c.set.url.lead": "אם מערכת הנוכחות מפרסמת את הייצוא בכתובת https קבועה — הזינו אותה כאן: בכל בוקר ClockCover מושך אותה לפני שליחת התקצירים, ושולח לכם מייל אם המשיכה או הקובץ נכשלו. השאירו ריק כדי להעלות ידנית. הכתובת עצמה היא הסיסמה — השתמשו בכתובת עם סוד.",
    "c.set.url.export": "ייצוא משמרות והחתמות (CSV, https)", "c.set.url.roster": "רשימת עובדים (CSV, https) — לא חובה",
    "c.set.note": "\"היום\" של התקצירים נקבע לפי אזור הזמן; המשימה היומית רצה ב-08:00 UTC. שינוי כתובת המפעיל/ה מנתק את הכתובת הישנה. ההתחברות שלך תקפה עד {date}.",
    "a.signin.title": "כניסה לניהול", "a.signin.lead": "כתובת הבעלים בלבד. קישור שמכניס ל-7 ימים יגיע במייל.",
    "a.employers": "מעסיקים", "a.new": "מעסיק חדש", "a.create": "יצירה ושליחת הזמנה", "a.created": "נוצר — הזמנה נשלחה אל {email}.",
    "a.opChanged": "המפעיל/ה הוחלף/ה — הזמנה נשלחה אל {email}.", "a.inviteSent": "הזמנה נשלחה אל {email}.",
    "a.f.name": "שם המעסיק", "a.f.tz": "אזור זמן (IANA)", "a.f.payroll": "כתובת חשב/ת השכר", "a.f.operator": "כתובת המפעיל/ה — מקבל/ת את ההזמנה ללוח הבקרה", "a.f.locale": "שפה",
    "a.slaNote": "זמן התגובה מתחיל ב-48 שעות; המפעיל/ה יכול/ה לשנות בלוח הבקרה.",
    "a.none": "עדיין אין מעסיקים.",
    "a.th.employer": "מעסיק", "a.th.operator": "מפעיל/ה", "a.th.employees": "עובדים", "a.th.tier": "מסלול", "a.th.open": "פערים פתוחים", "a.th.lastImport": "ייבוא אחרון", "a.th.source": "מקור",
    "a.change": "שינוי", "a.none.op": "אין", "a.mgr": "מנהלים", "a.esc": "הועברו", "a.never": "מעולם לא", "a.upload": "העלאה", "a.url": "URL", "a.resend": "שליחת הזמנה מחדש",
    "a.tierNote": "המסלול נקבע לפי עובדים פעילים ברשימה (ADR-0006): Team ≤ 50 ($49), Company ≤ 200 ($149), Site ≤ 500 ($349), Larger בהסכמה.",
    "lang.en": "English", "lang.he": "עברית",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type Key = keyof typeof M.en;

const KEY = "clockcover.locale";
const fromUrl = (): Locale | null => { try { const l = new URLSearchParams(location.search).get("lang"); return l === "he" || l === "en" ? l : null; } catch { return null; } };
const fromStorage = (): Locale | null => { try { const l = localStorage.getItem(KEY); return l === "he" || l === "en" ? l : null; } catch { return null; } };
const fromBrowser = (): Locale => (typeof navigator !== "undefined" && /^he\b/i.test(navigator.language) ? "he" : "en");

/** Current UI language. Pages tied to an employer call `setLocale(employer.locale)` once loaded. */
export const locale = ref<Locale>(fromUrl() ?? fromStorage() ?? fromBrowser());
export const dir = computed(() => (isRtl(locale.value) ? "rtl" : "ltr"));

export function setLocale(l: Locale, remember = true) {
  locale.value = l;
  if (remember) { try { localStorage.setItem(KEY, l); } catch { /* ignore */ } }
  if (typeof document !== "undefined") {
    document.documentElement.lang = l;
    document.documentElement.dir = isRtl(l) ? "rtl" : "ltr";
  }
}
export const toggleLocale = () => setLocale(locale.value === "he" ? "en" : "he");

export const t = (key: Key, vars?: Vars): string => fill(M[locale.value][key] ?? M.en[key], vars);
/** Pure variant for tests and non-reactive code. */
export const tr = (l: Locale, key: Key, vars?: Vars): string => fill(M[l][key] ?? M.en[key], vars);

// ---- dates
const WD: Record<Locale, string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  he: ["יום א׳", "יום ב׳", "יום ג׳", "יום ד׳", "יום ה׳", "יום ו׳", "שבת"],
};
const MON: Record<Locale, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  he: ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"],
};
export function shortDate(isoDate: string, l: Locale = locale.value): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${WD[l][d.getUTCDay()]} ${d.getUTCDate()} ${MON[l][d.getUTCMonth()]}`;
}
export const longDate = (isoDate: string, l: Locale = locale.value) => `${shortDate(isoDate, l)} ${isoDate.slice(0, 4)}`;
export function dateTime(iso: string, l: Locale = locale.value): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0"), mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${shortDate(iso.slice(0, 10), l)}, ${hh}:${mm}`;
}
export function dayMonthYear(iso: string, l: Locale = locale.value): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MON[l][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
