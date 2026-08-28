<script setup lang="ts">
import { onMounted, ref } from "vue";
import { overview, pct } from "../console-api.ts";
import type { EmployerSettings, Overview } from "../console-api.ts";
import { apiError, shortDate, t } from "../i18n.ts";

defineProps<{ employer: EmployerSettings }>();
const data = ref<Overview | null>(null);
const error = ref<string | null>(null);
onMounted(async () => {
  try { data.value = await overview(); } catch (e) { error.value = apiError(e, "error.load"); }
});
</script>

<template>
  <section class="flex flex-col gap-6">
    <p v-if="error" class="text-[13.5px] text-danger">{{ error }}</p>
    <div v-else-if="!data" class="text-[15px] text-muted">{{ t("loading") }}</div>
    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div class="bg-white border border-line rounded-[10px] p-5 flex flex-col gap-1">
          <div class="font-mono text-[11.5px] tracking-[0.07em] text-faint uppercase">{{ t("c.ov.open") }}</div>
          <div class="text-[28px] font-bold">{{ data.openGaps }}</div>
          <div class="text-[13px] text-muted">{{ t("c.ov.escalatedN", { n: data.escalated }) }}</div>
        </div>
        <div class="bg-white border border-line rounded-[10px] p-5 flex flex-col gap-1">
          <div class="font-mono text-[11.5px] tracking-[0.07em] text-faint uppercase">{{ t("c.ov.acted", { d: data.metric.windowDays }) }}</div>
          <div class="text-[28px] font-bold">{{ pct(data.metric.actedWithinSla, data.metric.notified) }}</div>
          <div class="text-[13px] text-muted">{{ t("c.ov.ofNotified", { a: data.metric.actedWithinSla, n: data.metric.notified }) }}</div>
        </div>
        <div class="bg-white border border-line rounded-[10px] p-5 flex flex-col gap-1">
          <div class="font-mono text-[11.5px] tracking-[0.07em] text-faint uppercase">{{ t("c.ov.escalated", { d: data.metric.windowDays }) }}</div>
          <div class="text-[28px] font-bold">{{ data.metric.escalated }}</div>
          <div class="text-[13px] text-muted">{{ t("c.ov.closedBy", { p: data.metric.closedByPayroll, r: data.metric.resolvedByRecord }) }}</div>
        </div>
      </div>
      <div class="bg-white border border-line rounded-[10px] px-5 py-4 flex flex-wrap gap-x-8 gap-y-1 text-[13.5px]">
        <div><span class="font-mono text-[11.5px] tracking-[0.07em] text-faint uppercase">{{ t("c.ov.outcomes", { d: data.metric.windowDays }) }}</span></div>
        <div><span class="font-semibold">{{ data.metric.present }}</span> <span class="text-muted">{{ t("c.ov.present") }}</span></div>
        <div><span class="font-semibold">{{ data.metric.absent }}</span> <span class="text-muted">{{ t("c.ov.absent") }}</span></div>
      </div>

      <div class="flex flex-col gap-2.5">
        <div class="font-mono text-xs tracking-[0.06em] text-faint uppercase">{{ t("c.ov.byManager") }}</div>
        <div v-if="data.byManager.length === 0" class="bg-white border border-line rounded-[10px] px-5 py-6 text-[15px] text-muted">{{ t("c.ov.allClear") }}</div>
        <div v-else class="bg-white border border-line rounded-[10px] divide-y divide-line-soft">
          <div v-for="m in data.byManager" :key="m.managerId" class="flex justify-between items-baseline px-5 py-3">
            <div class="text-[15px] font-medium">{{ m.managerName }}</div>
            <div class="font-mono text-[12.5px] text-muted">{{ t("c.ov.row", { n: m.openGaps, date: m.oldestGapDate ? shortDate(m.oldestGapDate) : "—" }) }}</div>
          </div>
        </div>
      </div>
      <p class="text-[13px] text-fainter text-pretty">{{ t("c.ov.note") }}</p>
    </template>
  </section>
</template>
