<script setup lang="ts">
import { onMounted, ref } from "vue";
import { overview, pct } from "../console-api.ts";
import type { EmployerSettings, Overview } from "../console-api.ts";
import { shortDate } from "../digest.ts";

defineProps<{ employer: EmployerSettings }>();
const data = ref<Overview | null>(null);
const error = ref<string | null>(null);
onMounted(async () => {
  try { data.value = await overview(); } catch (e) { error.value = e instanceof Error ? e.message : "Could not load."; }
});
</script>

<template>
  <section class="flex flex-col gap-6">
    <p v-if="error" class="text-[13.5px] text-danger">{{ error }}</p>
    <div v-else-if="!data" class="text-[15px] text-muted">Loading…</div>
    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div class="bg-white border border-line rounded-[10px] p-5 flex flex-col gap-1">
          <div class="font-mono text-[11.5px] tracking-[0.07em] text-faint uppercase">Open gaps</div>
          <div class="text-[28px] font-bold">{{ data.openGaps }}</div>
          <div class="text-[13px] text-muted">{{ data.escalated }} already escalated</div>
        </div>
        <div class="bg-white border border-line rounded-[10px] p-5 flex flex-col gap-1">
          <div class="font-mono text-[11.5px] tracking-[0.07em] text-faint uppercase">Acted within SLA · {{ data.metric.windowDays }} d</div>
          <div class="text-[28px] font-bold">{{ pct(data.metric.actedWithinSla, data.metric.notified) }}</div>
          <div class="text-[13px] text-muted">{{ data.metric.actedWithinSla }} of {{ data.metric.notified }} gaps in a digest</div>
        </div>
        <div class="bg-white border border-line rounded-[10px] p-5 flex flex-col gap-1">
          <div class="font-mono text-[11.5px] tracking-[0.07em] text-faint uppercase">Escalated · {{ data.metric.windowDays }} d</div>
          <div class="text-[28px] font-bold">{{ data.metric.escalated }}</div>
          <div class="text-[13px] text-muted">{{ data.metric.resolvedByRecord }} closed by a later import</div>
        </div>
      </div>

      <div class="flex flex-col gap-2.5">
        <div class="font-mono text-xs tracking-[0.06em] text-faint uppercase">Open gaps by manager</div>
        <div v-if="data.byManager.length === 0" class="bg-white border border-line rounded-[10px] px-5 py-6 text-[15px] text-muted">All clear — no open gaps.</div>
        <div v-else class="bg-white border border-line rounded-[10px] divide-y divide-line-soft">
          <div v-for="m in data.byManager" :key="m.managerId" class="flex justify-between items-baseline px-5 py-3">
            <div class="text-[15px] font-medium">{{ m.managerName }}</div>
            <div class="font-mono text-[12.5px] text-muted">{{ m.openGaps }} open · oldest {{ m.oldestGapDate ? shortDate(m.oldestGapDate) : "—" }}</div>
          </div>
        </div>
      </div>
      <p class="text-[13px] text-fainter text-pretty">Individual gaps are the managers' to resolve; you are emailed only when one passes the SLA.</p>
    </template>
  </section>
</template>
