<script setup lang="ts">
import { onMounted, ref } from "vue";
import { defaultRange, downloadCorrections, listImports, runImportNow, uploadImport, uploadRoster } from "../console-api.ts";
import type { ImportOutcome, ImportRun, ImportSummary } from "../console-api.ts";
import { dateTime } from "../digest.ts";

const history = ref<ImportRun[]>([]);
const rosterResult = ref<string | null>(null);
const importResult = ref<ImportOutcome | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);
const runResult = ref<ImportSummary | null>(null);
const range = ref(defaultRange(new Date()));
const exportError = ref<string | null>(null);

async function runNow() {
  busy.value = true; error.value = null; runResult.value = null;
  try { runResult.value = await runImportNow(); await refresh(); }
  catch (e) { error.value = e instanceof Error ? e.message : "Import failed."; }
  finally { busy.value = false; }
}

async function exportCsv() {
  exportError.value = null;
  try { await downloadCorrections(range.value.from, range.value.to); }
  catch (e) { exportError.value = e instanceof Error ? e.message : "Export failed."; }
}

async function refresh() { history.value = (await listImports()).imports; }
onMounted(() => { refresh().catch(() => {}); });

async function readFile(ev: Event): Promise<string | null> {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  return file ? file.text() : null;
}

async function onRoster(ev: Event) {
  const csv = await readFile(ev); if (!csv) return;
  busy.value = true; error.value = null; rosterResult.value = null;
  try { const r = await uploadRoster(csv); rosterResult.value = `${r.employees} employees on the roster.`; }
  catch (e) { error.value = e instanceof Error ? e.message : "Upload failed."; }
  finally { busy.value = false; }
}

async function onImport(ev: Event) {
  const csv = await readFile(ev); if (!csv) return;
  busy.value = true; error.value = null; importResult.value = null;
  try { importResult.value = await uploadImport(csv); await refresh(); }
  catch (e) { error.value = e instanceof Error ? e.message : "Upload failed."; }
  finally { busy.value = false; }
}
</script>

<template>
  <section class="flex flex-col gap-6">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
      <div class="bg-white border border-line rounded-[10px] p-5 flex flex-col gap-3">
        <div class="text-[16px] font-semibold">Roster</div>
        <p class="text-[13.5px] text-muted text-pretty">Who reports to whom. Columns: <code class="font-mono text-[12px]">employee_id, employee_name, manager_id, manager_name, manager_email</code>. Re-upload to record changes; detected gaps keep their manager.</p>
        <label class="self-start cursor-pointer border border-field hover:border-accent hover:text-accent rounded-[7px] px-3.5 py-[7px] text-[13.5px] font-medium text-ink-soft">
          Upload roster CSV<input type="file" accept=".csv,text/csv" class="hidden" :disabled="busy" @change="onRoster" />
        </label>
        <p v-if="rosterResult" class="text-[13.5px] text-ok">✓ {{ rosterResult }}</p>
      </div>
      <div class="bg-white border border-line rounded-[10px] p-5 flex flex-col gap-3">
        <div class="text-[16px] font-semibold">Shifts &amp; clock entries</div>
        <p class="text-[13.5px] text-muted text-pretty">The export from your attendance system. Columns: <code class="font-mono text-[12px]">employee_id, date, planned_start, planned_end, clock_in, clock_out</code>. One row per employee per day. Detection runs on upload.</p>
        <label class="self-start cursor-pointer bg-accent hover:bg-accent-deep text-white rounded-[7px] px-4 py-2 text-[13.5px] font-medium">
          Upload export CSV<input type="file" accept=".csv,text/csv" class="hidden" :disabled="busy" @change="onImport" />
        </label>
        <div v-if="importResult" class="text-[13.5px] flex flex-col gap-1">
          <div class="text-ok">✓ {{ importResult.shifts }} shifts, {{ importResult.records }} records for {{ importResult.period.from }} – {{ importResult.period.to }}</div>
          <div class="text-body">{{ importResult.gapsCreated }} new gaps · {{ importResult.gapsResolved }} gaps closed by this file</div>
          <div v-if="importResult.unknownEmployees.length" class="text-warn">Not on the roster, rows skipped: {{ importResult.unknownEmployees.join(", ") }}</div>
        </div>
      </div>
    </div>
    <p v-if="error" class="text-[13.5px] text-danger whitespace-pre-wrap">{{ error }}</p>

    <div class="bg-white border border-line rounded-[10px] p-5 flex flex-col gap-3">
      <div class="flex justify-between items-baseline gap-4 flex-wrap">
        <div class="text-[16px] font-semibold">Daily import from URL</div>
        <button type="button" :disabled="busy" class="border border-field hover:border-accent hover:text-accent rounded-[7px] px-3.5 py-[7px] text-[13.5px] font-medium text-ink-soft disabled:opacity-60" @click="runNow">Run import now</button>
      </div>
      <p class="text-[13.5px] text-muted text-pretty">Runs every morning before the digests if a URL is set in Settings. Use the button to fetch immediately — after fixing a file, or to check a new URL.</p>
      <div v-if="runResult" class="text-[13.5px] flex flex-col gap-1">
        <div v-if="runResult.roster" class="text-ok">✓ Roster: {{ runResult.roster.employees }} employees</div>
        <div v-if="runResult.import" class="text-ok">✓ Export: {{ runResult.import.shifts }} shifts, {{ runResult.import.records }} records · {{ runResult.import.gapsCreated }} new gaps · {{ runResult.import.gapsResolved }} closed</div>
        <div v-if="runResult.import?.unknownEmployees.length" class="text-warn">Not on the roster: {{ runResult.import.unknownEmployees.join(", ") }}</div>
      </div>
    </div>

    <div class="bg-white border border-line rounded-[10px] p-5 flex flex-col gap-3">
      <div class="text-[16px] font-semibold">Export corrections</div>
      <p class="text-[13.5px] text-muted text-pretty">Gaps closed by a manager or by payroll in the period — approved hours and reported absences with their notes — as CSV, for carrying into your attendance or payroll system.</p>
      <div class="flex flex-wrap items-end gap-3">
        <label class="flex flex-col gap-1 text-[12.5px] text-muted">From<input v-model="range.from" type="date" class="border border-field rounded-[7px] px-3 py-[7px] text-[13.5px] outline-none focus:border-accent" /></label>
        <label class="flex flex-col gap-1 text-[12.5px] text-muted">To<input v-model="range.to" type="date" class="border border-field rounded-[7px] px-3 py-[7px] text-[13.5px] outline-none focus:border-accent" /></label>
        <button type="button" class="bg-accent hover:bg-accent-deep text-white rounded-[7px] px-4 py-2 text-[13.5px] font-medium" @click="exportCsv">Download CSV</button>
        <span v-if="exportError" class="text-[13.5px] text-danger">{{ exportError }}</span>
      </div>
    </div>

    <div class="flex flex-col gap-2.5">
      <div class="font-mono text-xs tracking-[0.06em] text-faint uppercase">Import history</div>
      <div v-if="history.length === 0" class="text-[14px] text-muted">No imports yet.</div>
      <div v-else class="bg-white border border-line rounded-[10px] divide-y divide-line-soft">
        <div v-for="r in history" :key="r.id" class="flex justify-between items-baseline px-5 py-3 font-mono text-[12.5px]">
          <span class="text-ink">{{ dateTime(r.importedAt) }}</span>
          <span class="text-muted">{{ r.trigger === "url" ? "fetched from URL" : "uploaded" }} · {{ r.rowCount }} rows</span>
        </div>
      </div>
    </div>
  </section>
</template>
