// Guard: destructive git commands need a human. Force-pushes that can drop
// others' commits are denied outright; commands that discard local work or
// rewrite history make the tool ask before running.

export type Level = "deny" | "ask";
export interface Finding { level: Level; reason: string }

const RULES: Array<{ level: Level; test: RegExp; reason: string }> = [
  { level: "deny", test: /\bpush\b(?=.*(?:\s--force\b(?!-with-lease)|\s-[a-zA-Z]*f[a-zA-Z]*\b|\s\+\S))/, reason: "force-push without --force-with-lease can drop others' commits" },
  { level: "ask",  test: /\bpush\b.*--force-with-lease/, reason: "force-push rewrites remote history" },
  { level: "ask",  test: /\breset\b.*--hard/, reason: "reset --hard discards uncommitted work" },
  { level: "ask",  test: /\bcheckout\b\s+(?:--\s|\.(?:\s|$))/, reason: "checkout -- / checkout . discards uncommitted work" },
  { level: "ask",  test: /\brestore\b(?!.*--staged)/, reason: "restore discards uncommitted work" },
  { level: "ask",  test: /\bclean\b.*\s-[a-zA-Z]*[fxX]/, reason: "clean -f deletes untracked files" },
  { level: "ask",  test: /\bbranch\b.*\s-D\b/, reason: "branch -D deletes an unmerged branch" },
  { level: "ask",  test: /\bstash\b\s+(?:drop|clear)\b/, reason: "stash drop/clear deletes stashed work" },
  { level: "ask",  test: /\brebase\b/, reason: "rebase rewrites history" },
  { level: "ask",  test: /\bcommit\b.*--amend/, reason: "amend rewrites the last commit" },
];

/** Split a shell line into simple commands (&&, ||, ;, |). Heuristic, not a parser. */
function segments(cmd: string): string[] {
  return cmd.split(/&&|\|\||;|\|/).map((s) => s.trim());
}

export function findings(command: string): Finding[] {
  const out: Finding[] = [];
  for (const seg of segments(command)) {
    if (!/^(?:\S+=\S+\s+)*git\b/.test(seg)) continue;
    for (const r of RULES) if (r.test.test(seg)) out.push({ level: r.level, reason: `${r.reason}: \`${seg}\`` });
  }
  return out;
}

/** Guard contract: findings as strings, prefixed with the level. */
export function check(command: string): string[] {
  return findings(command).map((f) => `[${f.level}] ${f.reason}`);
}

export function level(command: string): Level | null {
  const f = findings(command);
  if (f.some((x) => x.level === "deny")) return "deny";
  return f.length ? "ask" : null;
}

/** pre-push: refs arrive as `<local_ref> <local_sha> <remote_ref> <remote_sha>` lines.
 *  A push to a protected branch whose remote tip is not an ancestor of the local
 *  tip is a non-fast-forward (force) push. `isAncestor` is injected so this stays pure. */
export function checkPushRefs(
  lines: string[],
  isAncestor: (ancestor: string, descendant: string) => boolean,
  protectedBranches = ["main"],
): string[] {
  const ZERO = /^0+$/;
  const out: string[] = [];
  for (const line of lines) {
    const [, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
    if (!remoteRef) continue;
    const branch = remoteRef.replace(/^refs\/heads\//, "");
    if (!protectedBranches.includes(branch)) continue;
    if (ZERO.test(localSha)) out.push(`deleting ${branch} on the remote`);
    else if (!ZERO.test(remoteSha) && !isAncestor(remoteSha, localSha)) out.push(`non-fast-forward (force) push to ${branch}`);
  }
  return out;
}
