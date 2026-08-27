<script setup lang="ts">
import { reactive, ref } from "vue";
import { updateEmployer } from "../console-api.ts";
import type { EmployerSettings } from "../console-api.ts";
import { dayMonthYear } from "../digest.ts";

const props = defineProps<{ employer: EmployerSettings }>();
const emit = defineEmits<{ saved: [EmployerSettings] }>();

const form = reactive({
  name: props.employer.name,
  payrollEmail: props.employer.payrollEmail,
  operatorEmail: props.employer.operatorEmail ?? "",
  timezone: props.employer.timezone,
  slaHours: props.employer.slaHours,
});
const saved = ref(false);
const error = ref<string | null>(null);
const busy = ref(false);

async function save() {
  busy.value = true; error.value = null; saved.value = false;
  try {
    emit("saved", await updateEmployer({ ...form, slaHours: Number(form.slaHours) }));
    saved.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not save.";
  } finally {
    busy.value = false;
  }
}
const field = "border border-field rounded-[7px] px-3 py-[9px] text-[14px] outline-none focus:border-accent w-full";
</script>

<template>
  <form class="bg-white border border-line rounded-[10px] p-6 max-w-[560px] flex flex-col gap-4" @submit.prevent="save">
    <label class="flex flex-col gap-1 text-[13px] text-muted">Employer name<input v-model="form.name" :class="field" required /></label>
    <label class="flex flex-col gap-1 text-[13px] text-muted">Payroll accountant email — receives escalations<input v-model="form.payrollEmail" type="email" :class="field" required /></label>
    <label class="flex flex-col gap-1 text-[13px] text-muted">Operator email — may sign in here<input v-model="form.operatorEmail" type="email" :class="field" required /></label>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label class="flex flex-col gap-1 text-[13px] text-muted">Timezone (IANA)<input v-model="form.timezone" :class="field" placeholder="Europe/Berlin" required /></label>
      <label class="flex flex-col gap-1 text-[13px] text-muted">SLA, hours before escalation<input v-model="form.slaHours" type="number" min="1" max="336" :class="field" required /></label>
    </div>
    <p class="text-[12.5px] text-fainter text-pretty">"Today" for digests follows the timezone; the daily job runs at 08:00 UTC. Changing the operator email signs the old address out. Your session lasts until {{ dayMonthYear(employer.sessionExpires) }}.</p>
    <div class="flex items-center gap-3">
      <button type="submit" :disabled="busy" class="bg-accent hover:bg-accent-deep disabled:opacity-60 text-white rounded-[7px] px-4 py-2 text-[14px] font-medium">Save</button>
      <span v-if="saved" class="text-[13.5px] text-ok">✓ Saved</span>
      <span v-if="error" class="text-[13.5px] text-danger">{{ error }}</span>
    </div>
  </form>
</template>
