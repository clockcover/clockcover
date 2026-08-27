// Guard: commits are authored by humans only — no trailer that credits an AI agent.
const AI_TRAILER =
  /(Co-authored-by|Signed-off-by):.*(claude|anthropic|copilot|openai|chatgpt|gpt|gemini|cursor|codex|devin|aider|noreply@anthropic\.com)/i;

/** `text` is a commit message, or a shell command that embeds one. */
export function check(text: string): string[] {
  const m = text.match(AI_TRAILER);
  return m ? [`AI-agent co-author trailer is not allowed: "${m[0].trim()}"`] : [];
}
