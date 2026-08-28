<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ApiError, fetchEscalation, handleEscalation } from "./api.ts";
import type { EscalationView, Outcome } from "./api.ts";
import { GAP_LABEL, OUTCOME_LABEL, dateTime, dayMonthYear, detail, outcomeSummary, shortDate } from "./digest.ts";

const props = defineProps<{ token: string }>();
const view = ref<EscalationView | null>(null);
const error = ref<string | null>(null);
const outcome = ref<Outcome | null>(null);
const note = ref("");
const busy = ref(false);
const done = ref<{ outcome: Outcome; note: string } | null>(null);

onMounted(async () => {
  try {
    view.value = await fetchEscalation(props.token);
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 401
      ? "This link has expired or is not valid. Escalation links work for 14 days and only for the address they were sent to."
      : "Could not load this escalation. Please try again in a moment.";
  }
});

const canSubmit = computed(() => outcome.value !== null && note.value.trim().length > 0 && !busy.value);

async function submit() {
  if (!view.value || !outcome.value || !canSubmit.value) return;
  busy.value = true; error.value = null;
  try {
    const r = await handleEscalation(props.token, outcome.value, note.value);
    done.value = { outcome: r.outcome, note: r.note ?? "" };
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 409 ? "This gap was already closed." : e instanceof Error ? e.message : "Could not close the gap.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="min-h-screen flex justify-center px-5 pt-12 pb-20">
    <div class="w-full max-w-[620px] flex flex-col gap-7">
      <header class="flex justify-between items-baseline">
        <div class="font-mono text-[13px] tracking-[0.08em] text-accent">CLOCKCOVER</div>
        <span class="font-mono text-[10.5px] tracking-[0.07em] uppercase px-2 py-[3px] rounded bg-[#f7ece0] text-[#a06a2a]">SLA breach</span>
      </header>

      <div v-if="error && !view" class="bg-white border border-line rounded-[10px] px-8 py-10 text-center flex flex-col gap-2.5">
        <div class="text-[22px] font-semibold">Link not valid</div>
        <p class="text-[15px] text-muted text-pretty">{{ error }}</p>
      </div>
      <div v-else-if="!view" class="text-[15px] text-muted">Loading…</div>

      <template v-else>
        <div class="flex flex-col gap-1.5">
          <h1 class="text-[26px] font-bold tracking-[-0.01em]">Escalated gap</h1>
          <div class="text-[14.5px] text-muted">{{ view.employer.name }} · manager {{ view.manager.fullName }}</div>
        </div>

        <article class="bg-white border border-line rounded-[10px] px-[18px] py-4 flex flex-col gap-3">
          <div class="flex justify-between items-start gap-3">
            <div class="flex flex-col gap-1">
              <div class="text-base font-semibold">{{ view.gap.employeeName }}</div>
              <div class="font-mono text-[12.5px] text-muted">{{ shortDate(view.gap.gapDate) }} · {{ detail(view.gap) }}</div>
            </div>
            <span class="font-mono text-[10.5px] tracking-[0.07em] uppercase px-[9px] py-1 rounded whitespace-nowrap bg-badge text-badge-ink">{{ GAP_LABEL[view.gap.gapType] }}</span>
          </div>
          <div class="font-mono text-xs text-faint flex flex-col gap-0.5 border-t border-line-soft pt-[11px]">
            <div>Manager notified {{ view.gap.managerNotifiedAt ? dateTime(view.gap.managerNotifiedAt) : "never" }} — no action recorded</div>
            <div v-if="view.gap.escalatedAt">Escalated {{ dateTime(view.gap.escalatedAt) }}</div>
          </div>
        </article>

        <section v-if="done || view.gap.resolvedAt" class="bg-white border border-line rounded-[10px] px-[18px] py-4 flex flex-col gap-1">
          <div class="text-[13.5px] font-medium text-ok">
            ✓ Closed — {{ outcomeSummary((done?.outcome ?? view.gap.outcome ?? "present")) }}
            <span v-if="!done" class="text-muted font-normal">({{ view.gap.resolution === "payroll_action" ? "by payroll" : view.gap.resolution === "manager_action" ? "by the manager" : "a record arrived" }})</span>
          </div>
          <div v-if="done?.note ?? view.gap.resolutionNote" class="text-[13px] text-muted">“{{ done?.note ?? view.gap.resolutionNote }}”</div>
        </section>

        <form v-else class="bg-white border border-line rounded-[10px] px-[18px] py-4 flex flex-col gap-3" @submit.prevent="submit">
          <div class="text-[15px] font-semibold">Mark handled</div>
          <p class="text-[13.5px] text-muted text-pretty">Use this when the clock entry will never arrive. If it is coming with the next export, do nothing — the gap closes itself and counts as worked.</p>
          <div class="flex flex-col sm:flex-row gap-2">
            <button v-for="o in (['present', 'absent'] as const)" :key="o" type="button"
              class="flex-1 text-left border rounded-[7px] px-3 py-2 text-[13.5px]"
              :class="outcome === o ? 'border-accent text-ink bg-strong/40' : 'border-field text-ink-soft hover:border-accent'"
              @click="outcome = o">{{ OUTCOME_LABEL[o] }}</button>
          </div>
          <input v-model="note" maxlength="500" required placeholder="Required — why will the entry never arrive? e.g. left the company on 1 March"
            class="border border-field rounded-[7px] px-3 py-[9px] text-[13.5px] outline-none focus:border-accent" />
          <div class="flex items-center gap-3">
            <button type="submit" :disabled="!canSubmit" class="bg-accent hover:bg-accent-deep disabled:opacity-60 text-white rounded-[7px] px-4 py-2 text-[13.5px] font-medium">Close gap</button>
            <span v-if="error" class="text-[13.5px] text-danger">{{ error }}</span>
          </div>
        </form>

        <footer class="border-t border-line pt-4 flex flex-col gap-1 font-mono text-[11.5px] text-fainter">
          <div>This link closes only this gap · expires {{ dayMonthYear(view.linkExpires) }}</div>
          <div>You receive only escalations — gaps managers resolve on time never reach you</div>
        </footer>
      </template>
    </div>
  </main>
</template>
