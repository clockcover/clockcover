<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { createEmployer, listEmployers, resendInvite, updateEmployer } from "../admin-api.ts";
import type { AdminEmployer } from "../admin-api.ts";
import { dateTime } from "../digest.ts";

const employers = ref<AdminEmployer[]>([]);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const busy = ref(false);
const creating = ref(false);
const form = reactive({ name: "", payrollEmail: "", operatorEmail: "", timezone: "UTC" });
const editingOperator = ref<{ id: string; email: string } | null>(null);

async function refresh() {
  try { employers.value = (await listEmployers()).employers; }
  catch (e) { error.value = e instanceof Error ? e.message : "Could not load."; }
}
onMounted(refresh);

async function create() {
  busy.value = true; error.value = null; notice.value = null;
  try {
    const r = await createEmployer({ ...form });
    notice.value = r.invited ? `Created — invite sent to ${form.operatorEmail}.` : "Created.";
    creating.value = false; Object.assign(form, { name: "", payrollEmail: "", operatorEmail: "", timezone: "UTC" });
    await refresh();
  } catch (e) { error.value = e instanceof Error ? e.message : "Could not create."; }
  finally { busy.value = false; }
}

async function saveOperator() {
  if (!editingOperator.value) return;
  busy.value = true; error.value = null; notice.value = null;
  try {
    const r = await updateEmployer(editingOperator.value.id, { operatorEmail: editingOperator.value.email });
    notice.value = r.invited ? `Operator changed — invite sent to ${editingOperator.value.email}.` : "Saved.";
    editingOperator.value = null;
    await refresh();
  } catch (e) { error.value = e instanceof Error ? e.message : "Could not save."; }
  finally { busy.value = false; }
}

async function invite(e: AdminEmployer) {
  busy.value = true; error.value = null; notice.value = null;
  try { await resendInvite(e.id); notice.value = `Invite sent to ${e.operatorEmail}.`; }
  catch (err) { error.value = err instanceof Error ? err.message : "Could not send."; }
  finally { busy.value = false; }
}

const field = "border border-field rounded-[7px] px-3 py-[8px] text-[13.5px] outline-none focus:border-accent w-full";
const tier = (n: number) => (n <= 50 ? "Team" : n <= 200 ? "Company" : n <= 500 ? "Site" : "Larger");
</script>

<template>
  <section class="flex flex-col gap-5">
    <div class="flex justify-between items-baseline gap-4 flex-wrap">
      <h1 class="text-[22px] font-semibold">Employers <span class="text-muted font-normal text-[15px]">· {{ employers.length }}</span></h1>
      <button type="button" class="bg-accent hover:bg-accent-deep text-white rounded-[7px] px-4 py-2 text-[13.5px] font-medium" @click="creating = !creating">{{ creating ? "Cancel" : "New employer" }}</button>
    </div>
    <p v-if="notice" class="text-[13.5px] text-ok">✓ {{ notice }}</p>
    <p v-if="error" class="text-[13.5px] text-danger">{{ error }}</p>

    <form v-if="creating" class="bg-white border border-line rounded-[10px] p-5 grid grid-cols-1 sm:grid-cols-2 gap-3" @submit.prevent="create">
      <label class="flex flex-col gap-1 text-[12.5px] text-muted">Employer name<input v-model="form.name" required :class="field" /></label>
      <label class="flex flex-col gap-1 text-[12.5px] text-muted">Timezone (IANA)<input v-model="form.timezone" required :class="field" placeholder="Europe/Berlin" /></label>
      <label class="flex flex-col gap-1 text-[12.5px] text-muted">Payroll accountant email<input v-model="form.payrollEmail" type="email" required :class="field" /></label>
      <label class="flex flex-col gap-1 text-[12.5px] text-muted">Operator email — gets the console invite<input v-model="form.operatorEmail" type="email" required :class="field" /></label>
      <div class="sm:col-span-2 flex items-center gap-3">
        <button type="submit" :disabled="busy" class="bg-accent hover:bg-accent-deep disabled:opacity-60 text-white rounded-[7px] px-4 py-2 text-[13.5px] font-medium">Create and invite</button>
        <span class="text-[12.5px] text-fainter">SLA starts at 48 h; the operator can change it in the console.</span>
      </div>
    </form>

    <div v-if="employers.length === 0" class="text-[14px] text-muted">No employers yet.</div>
    <div v-else class="overflow-x-auto bg-white border border-line rounded-[10px]">
      <table class="w-full text-[13.5px]">
        <thead class="font-mono text-[11px] tracking-[0.06em] uppercase text-faint text-left">
          <tr>
            <th class="px-4 py-3">Employer</th><th class="px-4 py-3">Operator</th><th class="px-4 py-3 text-right">Employees</th><th class="px-4 py-3">Tier</th>
            <th class="px-4 py-3 text-right">Open gaps</th><th class="px-4 py-3">Last import</th><th class="px-4 py-3">Source</th><th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line-soft">
          <tr v-for="e in employers" :key="e.id">
            <td class="px-4 py-3"><div class="font-medium">{{ e.name }}</div><div class="font-mono text-[11.5px] text-faint">{{ e.timezone }} · SLA {{ e.slaHours }} h · {{ e.payrollEmail }}</div></td>
            <td class="px-4 py-3">
              <template v-if="editingOperator?.id === e.id">
                <form class="flex gap-2" @submit.prevent="saveOperator">
                  <input v-model="editingOperator.email" type="email" required class="border border-field rounded-[7px] px-2 py-1 text-[13px] outline-none focus:border-accent" />
                  <button type="submit" :disabled="busy" class="text-accent font-medium">Save</button>
                  <button type="button" class="text-muted" @click="editingOperator = null">Cancel</button>
                </form>
              </template>
              <template v-else>
                <span :class="e.operatorEmail ? '' : 'text-danger'">{{ e.operatorEmail ?? "none" }}</span>
                <button type="button" class="ml-2 text-faint hover:text-accent text-[12.5px]" @click="editingOperator = { id: e.id, email: e.operatorEmail ?? '' }">change</button>
              </template>
            </td>
            <td class="px-4 py-3 text-right font-mono">{{ e.activeEmployees }}<span class="text-faint"> / {{ e.managers }} mgr</span></td>
            <td class="px-4 py-3">{{ tier(e.activeEmployees) }}</td>
            <td class="px-4 py-3 text-right font-mono" :class="e.escalatedOpen ? 'text-danger' : ''">{{ e.openGaps }}<span v-if="e.escalatedOpen" class="text-[11.5px]"> ({{ e.escalatedOpen }} esc.)</span></td>
            <td class="px-4 py-3 font-mono text-[12.5px]" :class="e.lastImportAt ? 'text-muted' : 'text-warn'">{{ e.lastImportAt ? dateTime(e.lastImportAt) : "never" }}</td>
            <td class="px-4 py-3 text-[12.5px] text-muted">{{ e.importUrl ? "URL" : "upload" }}</td>
            <td class="px-4 py-3 text-right"><button type="button" :disabled="busy || !e.operatorEmail" class="text-[12.5px] text-faint hover:text-accent disabled:opacity-40" @click="invite(e)">Resend invite</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-[12.5px] text-fainter text-pretty">Tier is by active employees on the roster (ADR-0006): Team ≤ 50 (€49), Company ≤ 200 (€149), Site ≤ 500 (€349), Larger by agreement.</p>
  </section>
</template>
