export type * from "./types.ts";
export type { Store } from "./store.ts";
export { detectGaps, runDetection } from "./detect.ts";
export type { DetectionInput, DetectionResult, DetectionOutcome } from "./detect.ts";
export { runDailyDigest, resolveByManager, isoDate } from "./digest.ts";
export type { DigestMessage, SendDigest } from "./digest.ts";
export { computeEscalations, runEscalations, resolveByPayroll } from "./escalate.ts";
export type { Sla } from "./escalate.ts";
