<script setup lang="ts">
import { onMounted, ref } from "vue";
import { defaultRange, downloadCorrections, listImports, runImportNow, uploadImport, uploadRoster } from "../console-api.ts";
import type { ImportOutcome, ImportRun, ImportSummary } from "../console-api.ts";
import { dateTime, t } from "../i18n.ts";

const history = ref<ImportRun[]>([]);
const rosterResult = ref<string | null>(null);
const importResult = ref<ImportOutcome | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);
const runResult = ref<ImportSummary | null>(null);
const range = ref(defaultRange(new Date()));
const exportError = ref<string | null>(null);

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
  try { rosterResult.value = t("c.imp.roster.done", { n: (await uploadRoster(csv)).employees }); }
  catch (e) { error.value = e instanceof Error ? e.message : t("error.load"); }
  finally { busy.value = false; }
}
async function onImport(ev: Event) {
  const csv = await readFile(ev); if (!csv) return;
  busy.value = true; error.value = null; importResult.value = null;
  try { importResult.value = await uploadImport(csv); await refresh(); }
  catch (e) { error.value = e instanceof Error ? e.message : t("error.load"); }
  finally { busy.value = false; }
}
async function runNow() {
  busy.value = true; error.value = null; runResult.value = null;
  try { runResult.value = await runImportNow(); await refresh(); }
  catch (e) { error.value = e instanceof Error ? e.message : t("error.load"); }
  finally { busy.value = false; }
}
async function exportCsv() {
  exportError.value = null;
  try { await downloadCorrections(range.value.from, range.value.to); }
  catch (e) { exportError.value = e instanceof Error ? e.message : t("error.load"); }
}
const ROSTER_COLS = "employee_id, employee_name, manager_id, manager_name, manager_email";
const EXPORT_COLS = "employee_id, date, planned_start, planned_end, clock_in, clock_out";
</script>

<template>
  <section class="flex flex-col gap-6">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
      <div class="bg-white border border-line rounded-[10px] p-5 flex flex-col gap-3">
        <div class="text-[16px] font-semibold">{{ t("c.imp.roster") }}</div>
        <p class="text-[13.5px] text-muted text-pretty">{{ t("c.imp.roster.lead", { cols: "" }) }}<code class="font-mono text-[12px]" dir="ltr">{{ ROSTER_COLS }}</code></p>
        <label class="self-start cursor-pointer border border-field hover:border-accent hover:text-accent rounded-[7px] px-3.5 py-[7px] text-[13.5px] font-medium text-ink-soft">
          {{ t("c.imp.roster.btn") }}<input type="file" accept=".csv,text/csv" class="hidden" :disabled="busy" @change="onRoster" />
        </label>
        <p v-if="rosterResult" class="text-[13.5px] text-ok">✓ {{ rosterResult }}</p>
      </div>
      <div class="bg-white border border-line rounded-[10px] p-5 flex flex-col gap-3">
        <div class="text-[16px] font-semibold">{{ t("c.imp.export") }}</div>
        <p class="text-[13.5px] text-muted text-pretty">{{ t("c.imp.export.lead", { cols: "" }) }}<code class="font-mono text-[12px]" dir="ltr">{{ EXPORT_COLS }}</code></p>
        <label class="self-start cursor-pointer bg-accent hover:bg-accent-deep text-white rounded-[7px] px-4 py-2 text-[13.5px] font-medium">
          {{ t("c.imp.export.btn") }}<input type="file" accept=".csv,text/csv" class="hidden" :disabled="busy" @change="onImport" />
        </label>
        <div v-if="importResult" class="text-[13.5px] flex flex-col gap-1">
          <div class="text-ok">{{ t("c.imp.export.done", { s: importResult.shifts, r: importResult.records, from: importResult.period.from, to: importResult.period.to }) }}</div>
          <div class="text-body">{{ t("c.imp.gaps", { c: importResult.gapsCreated, r: importResult.gapsResolved }) }}</div>
          <div v-if="importResult.unknownEmployees.length" class="text-warn">{{ t("c.imp.unknown", { list: importResult.unknownEmployees.join(", ") }) }}</div>
        </div>
      </div>
    </div>
    <p v-if="error" class="text-[13.5px] text-danger whitespace-pre-wrap">{{ error }}</p>

    <div class="bg-white border border-line rounded-[10px] p-5 flex flex-col gap-3">
      <div class="flex justify-between items-baseline gap-4 flex-wrap">
        <div class="text-[16px] font-semibold">{{ t("c.imp.url.title") }}</div>
        <button type="button" :disabled="busy" class="border border-field hover:border-accent hover:text-accent rounded-[7px] px-3.5 py-[7px] text-[13.5px] font-medium text-ink-soft disabled:opacity-60" @click="runNow">{{ t("c.imp.url.run") }}</button>
      </div>
      <p class="text-[13.5px] text-muted text-pretty">{{ t("c.imp.url.lead") }}</p>
      <div v-if="runResult" class="text-[13.5px] flex flex-col gap-1">
        <div v-if="runResult.roster" class="text-ok">{{ t("c.imp.url.roster", { n: runResult.roster.employees }) }}</div>
        <div v-if="runResult.import" class="text-ok">{{ t("c.imp.url.export", { s: runResult.import.shifts, r: runResult.import.records, c: runResult.import.gapsCreated, x: runResult.import.gapsResolved }) }}</div>
        <div v-if="runResult.import?.unknownEmployees.length" class="text-warn">{{ t("c.imp.unknown", { list: runResult.import.unknownEmployees.join(", ") }) }}</div>
      </div>
    </div>

    <div class="bg-white border border-line rounded-[10px] p-5 flex flex-col gap-3">
      <div class="text-[16px] font-semibold">{{ t("c.imp.exp.title") }}</div>
      <p class="text-[13.5px] text-muted text-pretty">{{ t("c.imp.exp.lead") }}</p>
      <div class="flex flex-wrap items-end gap-3">
        <label class="flex flex-col gap-1 text-[12.5px] text-muted">{{ t("c.imp.exp.from") }}<input v-model="range.from" type="date" class="border border-field rounded-[7px] px-3 py-[7px] text-[13.5px] outline-none focus:border-accent" /></label>
        <label class="flex flex-col gap-1 text-[12.5px] text-muted">{{ t("c.imp.exp.to") }}<input v-model="range.to" type="date" class="border border-field rounded-[7px] px-3 py-[7px] text-[13.5px] outline-none focus:border-accent" /></label>
        <button type="button" class="bg-accent hover:bg-accent-deep text-white rounded-[7px] px-4 py-2 text-[13.5px] font-medium" @click="exportCsv">{{ t("c.imp.exp.btn") }}</button>
        <span v-if="exportError" class="text-[13.5px] text-danger">{{ exportError }}</span>
      </div>
    </div>

    <div class="flex flex-col gap-2.5">
      <div class="font-mono text-xs tracking-[0.06em] text-faint uppercase">{{ t("c.imp.history") }}</div>
      <div v-if="history.length === 0" class="text-[14px] text-muted">{{ t("c.imp.none") }}</div>
      <div v-else class="bg-white border border-line rounded-[10px] divide-y divide-line-soft">
        <div v-for="r in history" :key="r.id" class="flex justify-between items-baseline px-5 py-3 font-mono text-[12.5px]">
          <span class="text-ink">{{ dateTime(r.importedAt) }}</span>
          <span class="text-muted">{{ t(r.trigger === "url" ? "c.imp.fetched" : "c.imp.uploaded") }} · {{ t("c.imp.rows", { n: r.rowCount }) }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
