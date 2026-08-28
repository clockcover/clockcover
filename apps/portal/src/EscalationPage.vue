<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ApiError, fetchEscalation, handleEscalation } from "./api.ts";
import type { EscalationView, Outcome } from "./api.ts";
import { dateTime, dayMonthYear, detail, gapLabel, outcomeLabel, outcomeSummary, shortDate } from "./digest.ts";
import { setLocale, t } from "./i18n.ts";
import LangSwitch from "./LangSwitch.vue";

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
    setLocale(view.value.locale, false);
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 401 ? t("link.invalid.escalation") : t("error.load");
  }
});

const canSubmit = computed(() => outcome.value !== null && note.value.trim().length > 0 && !busy.value);
const closedBy = computed(() => {
  const r = view.value?.gap.resolution;
  return t(r === "payroll_action" ? "esc.by.payroll" : r === "manager_action" ? "esc.by.manager" : "esc.by.record");
});

async function submit() {
  if (!view.value || !outcome.value || !canSubmit.value) return;
  busy.value = true; error.value = null;
  try {
    const r = await handleEscalation(props.token, outcome.value, note.value);
    done.value = { outcome: r.outcome, note: r.note ?? "" };
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 409 ? t("esc.already") : e instanceof Error ? e.message : t("esc.failed");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="min-h-screen flex justify-center px-5 pt-12 pb-20">
    <div class="w-full max-w-[620px] flex flex-col gap-7">
      <header class="flex justify-between items-baseline gap-4">
        <div class="font-mono text-[13px] tracking-[0.08em] text-accent" dir="ltr">CLOCKCOVER</div>
        <div class="flex items-baseline gap-4">
          <span class="font-mono text-[10.5px] tracking-[0.07em] uppercase px-2 py-[3px] rounded bg-[#f7ece0] text-[#a06a2a]">{{ t("esc.badge") }}</span>
          <LangSwitch />
        </div>
      </header>

      <div v-if="error && !view" class="bg-white border border-line rounded-[10px] px-8 py-10 text-center flex flex-col gap-2.5">
        <div class="text-[22px] font-semibold">{{ t("link.invalid.title") }}</div>
        <p class="text-[15px] text-muted text-pretty">{{ error }}</p>
      </div>
      <div v-else-if="!view" class="text-[15px] text-muted">{{ t("loading") }}</div>

      <template v-else>
        <div class="flex flex-col gap-1.5">
          <h1 class="text-[26px] font-bold tracking-[-0.01em]">{{ t("esc.title") }}</h1>
          <div class="text-[14.5px] text-muted">{{ t("esc.sub", { employer: view.employer.name, manager: view.manager.fullName }) }}</div>
        </div>

        <article class="bg-white border border-line rounded-[10px] px-[18px] py-4 flex flex-col gap-3">
          <div class="flex justify-between items-start gap-3">
            <div class="flex flex-col gap-1">
              <div class="text-base font-semibold">{{ view.gap.employeeName }}</div>
              <div class="font-mono text-[12.5px] text-muted">{{ shortDate(view.gap.gapDate) }} · {{ detail(view.gap) }}</div>
            </div>
            <span class="font-mono text-[10.5px] tracking-[0.07em] uppercase px-[9px] py-1 rounded whitespace-nowrap bg-badge text-badge-ink">{{ gapLabel(view.gap.gapType) }}</span>
          </div>
          <div class="font-mono text-xs text-faint flex flex-col gap-0.5 border-t border-line-soft pt-[11px]">
            <div>{{ t("esc.notified", { when: view.gap.managerNotifiedAt ? dateTime(view.gap.managerNotifiedAt) : t("esc.never") }) }}</div>
            <div v-if="view.gap.escalatedAt">{{ t("esc.escalated", { when: dateTime(view.gap.escalatedAt) }) }}</div>
          </div>
        </article>

        <section v-if="done || view.gap.resolvedAt" class="bg-white border border-line rounded-[10px] px-[18px] py-4 flex flex-col gap-1">
          <div class="text-[13.5px] font-medium text-ok">
            {{ t("esc.closed", { outcome: outcomeSummary(done?.outcome ?? view.gap.outcome ?? "present") }) }}
            <span v-if="!done" class="text-muted font-normal">({{ closedBy }})</span>
          </div>
          <div v-if="done?.note ?? view.gap.resolutionNote" class="text-[13px] text-muted">“{{ done?.note ?? view.gap.resolutionNote }}”</div>
        </section>

        <form v-else class="bg-white border border-line rounded-[10px] px-[18px] py-4 flex flex-col gap-3" @submit.prevent="submit">
          <div class="text-[15px] font-semibold">{{ t("esc.mark") }}</div>
          <p class="text-[13.5px] text-muted text-pretty">{{ t("esc.help") }}</p>
          <div class="flex flex-col sm:flex-row gap-2">
            <button v-for="o in (['present', 'absent'] as const)" :key="o" type="button"
              class="flex-1 text-start border rounded-[7px] px-3 py-2 text-[13.5px]"
              :class="outcome === o ? 'border-accent text-ink bg-strong/40' : 'border-field text-ink-soft hover:border-accent'"
              @click="outcome = o">{{ outcomeLabel(o) }}</button>
          </div>
          <input v-model="note" maxlength="500" required :placeholder="t('esc.note')" class="border border-field rounded-[7px] px-3 py-[9px] text-[13.5px] outline-none focus:border-accent" />
          <div class="flex items-center gap-3">
            <button type="submit" :disabled="!canSubmit" class="bg-accent hover:bg-accent-deep disabled:opacity-60 text-white rounded-[7px] px-4 py-2 text-[13.5px] font-medium">{{ t("esc.close") }}</button>
            <span v-if="error" class="text-[13.5px] text-danger">{{ error }}</span>
          </div>
        </form>

        <footer class="border-t border-line pt-4 flex flex-col gap-1 font-mono text-[11.5px] text-fainter">
          <div>{{ t("esc.footer.link", { date: dayMonthYear(view.linkExpires) }) }}</div>
          <div>{{ t("esc.footer.only") }}</div>
        </footer>
      </template>
    </div>
  </main>
</template>
