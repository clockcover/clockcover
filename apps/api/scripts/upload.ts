// Operator tool: upload a roster or shift/attendance CSV to a deployed API.
//
//   node --env-file=.dev.vars scripts/upload.ts <roster|imports> <employerId> <file.csv>
//
// Reads API_URL and API_KEY from the environment (the env-file keeps the key out
// of shell history and transcripts). API_KEY is a per-employer key created in the
// console (Settings → API keys), shown once. Prints the API's JSON response.
import { readFileSync } from "node:fs";

const [kind, employerId, file] = process.argv.slice(2);
const { API_URL, API_KEY } = process.env;

if ((kind !== "roster" && kind !== "imports") || !employerId || !file) {
  console.error("usage: upload.ts <roster|imports> <employerId> <file.csv>");
  process.exit(2);
}
if (!API_URL || !API_KEY) {
  console.error("API_URL and API_KEY must be set (e.g. via --env-file=.dev.vars)");
  process.exit(2);
}

const res = await fetch(`${API_URL.replace(/\/$/, "")}/employers/${encodeURIComponent(employerId)}/${kind}`, {
  method: "POST",
  headers: { authorization: `Bearer ${API_KEY}`, "content-type": "text/csv" },
  body: readFileSync(file, "utf8"),
});
console.log(res.status, JSON.stringify(await res.json(), null, 2));
process.exit(res.ok ? 0 : 1);
