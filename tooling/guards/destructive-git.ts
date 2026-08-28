// Guard: destructive git commands need a human. Force-pushes that can drop
// others' commits are denied outright; commands that discard local work or
// rewrite history make the tool ask before running.

export type Level = "deny" | "ask";
export interface Finding { level: Level; reason: string }

const RULES: Array<{ level: Level; test: RegExp; reason: string }> = [
  { level: "deny", test: /\bpush\b(?=.*(?:\s--force\b(?!-with-lease|-if-includes)|\s-[a-zA-Z]*f[a-zA-Z]*\b|\s\+\S))/, reason: "force-push without --force-with-lease can drop others' commits" },
  { level: "ask",  test: /\bpush\b.*--force-(?:with-lease|if-includes)/, reason: "force-push rewrites remote history" },
  { level: "ask",  test: /\breset\b.*--(?:hard|merge)/, reason: "reset --hard/--merge discards uncommitted work" },
  { level: "ask",  test: /\bcheckout\b(?:\s+\S+)*?\s+(?:--(?:\s|$)|\.(?:\s|$))/, reason: "checkout -- / checkout . discards uncommitted work" },
  { level: "ask",  test: /\bcheckout\b.*\s(?:-[a-zA-Z]*f[a-zA-Z]*|--force)\b/, reason: "checkout -f discards uncommitted work" },
  { level: "ask",  test: /\bswitch\b.*\s(?:-[a-zA-Z]*f[a-zA-Z]*|--force|--discard-changes)\b/, reason: "switch --discard-changes discards uncommitted work" },
  { level: "ask",  test: /\brestore\b(?!.*--staged)/, reason: "restore discards uncommitted work" },
  { level: "ask",  test: /\bclean\b.*\s(?:-[a-zA-Z]*[fxX]|--force)/, reason: "clean -f deletes untracked files" },
  { level: "ask",  test: /\bbranch\b(?=.*\s-[a-zA-Z]*D\b|(?=.*\s(?:-[a-zA-Z]*d[a-zA-Z]*|--delete)\b)(?=.*\s(?:-[a-zA-Z]*f[a-zA-Z]*|--force)\b))/, reason: "branch -D / --delete --force deletes an unmerged branch" },
  { level: "ask",  test: /\bstash\b\s+(?:drop|clear)\b/, reason: "stash drop/clear deletes stashed work" },
  { level: "ask",  test: /\brebase\b/, reason: "rebase rewrites history" },
  { level: "ask",  test: /\bcommit\b.*--amend/, reason: "amend rewrites the last commit" },
];

// `git` wherever a command can start: segment start, after whitespace, `$(`, a backtick
// or a quote (`xargs git …`, `bash -c 'git …'`, `$(git …)`), with or without a path (`/usr/bin/git`).
const GIT = /(?:^|[\s$(`'"])(?:\S*\/)?git\b/;

/** Split a shell line into simple commands (&&, ||, ;, |, newline). Heuristic, not a parser. */
function segments(cmd: string): string[] {
  return cmd.split(/&&|\|\||;|\||\n/).map((s) => s.trim());
}

export function findings(command: string): Finding[] {
  const out: Finding[] = [];
  for (const seg of segments(command)) {
    if (!GIT.test(seg)) continue;
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
    if (!localSha || !remoteRef || !remoteSha) continue;
    const branch = remoteRef.replace(/^refs\/heads\//, "");
    if (!protectedBranches.includes(branch)) continue;
    if (ZERO.test(localSha)) out.push(`deleting ${branch} on the remote`);
    else if (!ZERO.test(remoteSha) && !isAncestor(remoteSha, localSha)) out.push(`non-fast-forward (force) push to ${branch}`);
  }
  return out;
}
