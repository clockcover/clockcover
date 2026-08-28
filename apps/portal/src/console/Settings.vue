<script setup lang="ts">
import { reactive, ref } from "vue";
import { updateEmployer } from "../console-api.ts";
import type { EmployerSettings } from "../console-api.ts";
import { apiError, dayMonthYear, t } from "../i18n.ts";

const props = defineProps<{ employer: EmployerSettings }>();
const emit = defineEmits<{ saved: [EmployerSettings] }>();

const form = reactive({
  name: props.employer.name,
  payrollEmail: props.employer.payrollEmail,
  operatorEmail: props.employer.operatorEmail ?? "",
  timezone: props.employer.timezone,
  slaHours: props.employer.slaHours,
  importUrl: props.employer.importUrl ?? "",
  rosterUrl: props.employer.rosterUrl ?? "",
  locale: props.employer.locale,
});
const saved = ref(false);
const error = ref<string | null>(null);
const busy = ref(false);

async function save() {
  busy.value = true; error.value = null; saved.value = false;
  try { emit("saved", await updateEmployer({ ...form, slaHours: Number(form.slaHours) })); saved.value = true; }
  catch (e) { error.value = apiError(e); }
  finally { busy.value = false; }
}
const field = "border border-field rounded-[7px] px-3 py-[9px] text-[14px] outline-none focus:border-accent w-full";
</script>

<template>
  <form class="bg-white border border-line rounded-[10px] p-6 max-w-[560px] flex flex-col gap-4" @submit.prevent="save">
    <label class="flex flex-col gap-1 text-[13px] text-muted">{{ t("c.set.name") }}<input v-model="form.name" :class="field" required /></label>
    <label class="flex flex-col gap-1 text-[13px] text-muted">{{ t("c.set.payroll") }}<input v-model="form.payrollEmail" type="email" :class="field" required dir="ltr" /></label>
    <label class="flex flex-col gap-1 text-[13px] text-muted">{{ t("c.set.operator") }}<input v-model="form.operatorEmail" type="email" :class="field" required dir="ltr" /></label>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <label class="flex flex-col gap-1 text-[13px] text-muted">{{ t("c.set.tz") }}<input v-model="form.timezone" :class="field" placeholder="Europe/Berlin" required dir="ltr" /></label>
      <label class="flex flex-col gap-1 text-[13px] text-muted">{{ t("c.set.sla") }}<input v-model="form.slaHours" type="number" min="1" max="336" :class="field" required /></label>
      <label class="flex flex-col gap-1 text-[13px] text-muted">{{ t("c.set.locale") }}
        <select v-model="form.locale" :class="field"><option value="en">English</option><option value="he">עברית</option></select>
      </label>
    </div>
    <div class="border-t border-line-soft pt-4 flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <div class="text-[14px] font-semibold">{{ t("c.set.url.title") }}</div>
        <p class="text-[12.5px] text-muted text-pretty">{{ t("c.set.url.lead") }}</p>
      </div>
      <label class="flex flex-col gap-1 text-[13px] text-muted">{{ t("c.set.url.export") }}<input v-model="form.importUrl" type="url" :class="field" placeholder="https://…/export.csv" dir="ltr" /></label>
      <label class="flex flex-col gap-1 text-[13px] text-muted">{{ t("c.set.url.roster") }}<input v-model="form.rosterUrl" type="url" :class="field" placeholder="https://…/roster.csv" dir="ltr" /></label>
    </div>
    <p class="text-[12.5px] text-fainter text-pretty">{{ t("c.set.note", { date: dayMonthYear(employer.sessionExpires) }) }}</p>
    <div class="flex items-center gap-3">
      <button type="submit" :disabled="busy" class="bg-accent hover:bg-accent-deep disabled:opacity-60 text-white rounded-[7px] px-4 py-2 text-[14px] font-medium">{{ t("save") }}</button>
      <span v-if="saved" class="text-[13.5px] text-ok">✓ {{ t("saved") }}</span>
      <span v-if="error" class="text-[13.5px] text-danger">{{ error }}</span>
    </div>
  </form>
</template>
