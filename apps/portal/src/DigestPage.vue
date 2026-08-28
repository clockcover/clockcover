<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ApiError, fetchDigest, resolveGap } from "./api.ts";
import type { Digest, DigestGap, Outcome } from "./api.ts";
import { dayMonthYear, detail, gapLabel, groupByDay, longDate, outcomeLabel, outcomeSummary, shortDate, slaStatus } from "./digest.ts";
import { setLocale, t } from "./i18n.ts";
import LangSwitch from "./LangSwitch.vue";

const props = defineProps<{ token: string }>();

const digest = ref<Digest | null>(null);
const error = ref<string | null>(null);
const resolvingId = ref<string | null>(null);
const noteDraft = ref("");
const outcomeDraft = ref<Outcome | null>(null);
const busy = ref(false);
const resolved = ref(new Map<string, { outcome: Outcome; note: string }>());
const now = new Date();

onMounted(async () => {
  try {
    digest.value = await fetchDigest(props.token);
    setLocale(digest.value.locale, false); // the employer decides the language; the switch still works
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 401 ? t("link.invalid.digest") : t("error.load");
  }
});

const openGaps = computed(() => digest.value?.gaps.filter((g) => !resolved.value.has(g.id)) ?? []);
const days = computed(() => groupByDay(digest.value?.gaps ?? []));
const allClear = computed(() => digest.value !== null && digest.value.gaps.length === 0);

const startResolve = (g: DigestGap) => { resolvingId.value = g.id; noteDraft.value = ""; outcomeDraft.value = null; };
const canConfirm = computed(() => outcomeDraft.value !== null && (outcomeDraft.value === "present" || noteDraft.value.trim().length > 0));
const cancel = () => { resolvingId.value = null; };
async function confirm(g: DigestGap) {
  if (!digest.value || busy.value || !outcomeDraft.value || !canConfirm.value) return;
  busy.value = true;
  try {
    const r = await resolveGap(props.token, g.id, outcomeDraft.value, noteDraft.value);
    resolved.value = new Map(resolved.value).set(g.id, { outcome: r.outcome, note: r.note ?? "" });
    resolvingId.value = null;
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 409 ? t("digest.already") : t("digest.resolveFailed");
  } finally {
    busy.value = false;
  }
}

const badge = (g: DigestGap) => (g.gapType === "no_record_at_all" ? "bg-strong text-strong-ink" : "bg-badge text-badge-ink");
const tone = { muted: "text-faint", warn: "text-warn", danger: "text-danger" } as const;
</script>

<template>
  <main class="min-h-screen flex justify-center px-5 pt-12 pb-20">
    <div class="w-full max-w-[620px] flex flex-col gap-7">
      <header class="flex justify-between items-baseline gap-4">
        <div class="font-mono text-[13px] tracking-[0.08em] text-accent" dir="ltr">CLOCKCOVER</div>
        <div class="flex items-baseline gap-4">
          <div v-if="digest" class="font-mono text-xs text-faint">{{ t("digest.header", { date: longDate(digest.digestDate) }) }}</div>
          <LangSwitch />
        </div>
      </header>

      <div v-if="error && !digest" class="bg-white border border-line rounded-[10px] px-8 py-10 text-center flex flex-col gap-2.5">
        <div class="text-[22px] font-semibold">{{ t("link.invalid.title") }}</div>
        <p class="text-[15px] text-muted text-pretty">{{ error }}</p>
      </div>

      <div v-else-if="!digest" class="text-[15px] text-muted">{{ t("loading") }}</div>

      <template v-else>
        <section v-if="allClear" class="bg-white border border-line rounded-[10px] px-8 py-10 text-center flex flex-col gap-2.5">
          <div class="text-[22px] font-semibold">{{ t("digest.allClear.title") }}</div>
          <p class="text-[15px] text-muted text-pretty">{{ t("digest.allClear.lead") }}</p>
        </section>

        <template v-else>
          <div class="flex flex-col gap-1.5">
            <h1 class="text-[26px] font-bold tracking-[-0.01em]">{{ t("digest.open", { n: openGaps.length, noun: t(openGaps.length === 1 ? "digest.gap" : "digest.gaps") }) }}</h1>
            <div class="text-[14.5px] text-muted">{{ digest.manager.fullName }} · {{ digest.employer.name }}</div>
          </div>

          <p v-if="error" class="text-[13.5px] text-danger">{{ error }}</p>

          <div class="flex flex-col gap-6">
            <section v-for="d in days" :key="d.day" class="flex flex-col gap-2.5">
              <div class="font-mono text-xs tracking-[0.06em] text-faint uppercase">{{ shortDate(d.day) }}</div>
              <div class="flex flex-col gap-2.5">
                <article v-for="g in d.gaps" :key="g.id" class="bg-white border border-line rounded-[10px] px-[18px] py-4 flex flex-col gap-3">
                  <div class="flex justify-between items-start gap-3">
                    <div class="flex flex-col gap-1">
                      <div class="text-base font-semibold">{{ g.employeeName }}</div>
                      <div class="font-mono text-[12.5px] text-muted">{{ detail(g) }}</div>
                    </div>
                    <span class="font-mono text-[10.5px] tracking-[0.07em] uppercase px-[9px] py-1 rounded whitespace-nowrap" :class="badge(g)">{{ gapLabel(g.gapType) }}</span>
                  </div>

                  <div v-if="resolved.has(g.id)" class="border-t border-line-soft pt-[11px] flex flex-col gap-[3px]">
                    <div class="text-[13.5px] font-medium text-ok">{{ t("digest.resolvedNow", { outcome: outcomeSummary(resolved.get(g.id)!.outcome) }) }}</div>
                    <div v-if="resolved.get(g.id)!.note" class="text-[13px] text-muted">“{{ resolved.get(g.id)!.note }}”</div>
                  </div>

                  <div v-else-if="resolvingId === g.id" class="border-t border-line-soft pt-3 flex flex-col gap-2.5">
                    <div class="text-[13px] text-muted">{{ t("digest.what", { date: shortDate(g.gapDate) }) }}</div>
                    <div class="flex flex-col sm:flex-row gap-2">
                      <button v-for="o in (['present', 'absent'] as const)" :key="o" type="button"
                        class="flex-1 text-start border rounded-[7px] px-3 py-2 text-[13.5px]"
                        :class="outcomeDraft === o ? 'border-accent text-ink bg-strong/40' : 'border-field text-ink-soft hover:border-accent'"
                        @click="outcomeDraft = o">{{ outcomeLabel(o) }}</button>
                    </div>
                    <input v-model="noteDraft" maxlength="500" :placeholder="t(outcomeDraft === 'absent' ? 'digest.note.absent' : 'digest.note.present')"
                      class="border border-field rounded-[7px] px-3 py-[9px] text-[13.5px] outline-none focus:border-accent"
                      @keydown.enter.prevent="confirm(g)" @keydown.esc="cancel" />
                    <div class="flex gap-2">
                      <button type="button" :disabled="busy || !canConfirm" class="bg-accent hover:bg-accent-deep disabled:opacity-60 text-white rounded-[7px] px-4 py-2 text-[13.5px] font-medium" @click="confirm(g)">{{ t("digest.resolveGap") }}</button>
                      <button type="button" class="text-muted hover:text-ink px-2.5 py-2 text-[13.5px]" @click="cancel">{{ t("cancel") }}</button>
                    </div>
                  </div>

                  <div v-else class="border-t border-line-soft pt-[11px] flex justify-between items-center gap-3">
                    <div class="font-mono text-xs" :class="tone[slaStatus(g, digest.slaHours, now).tone]">{{ slaStatus(g, digest.slaHours, now).text }}</div>
                    <button type="button" class="border border-field hover:border-accent hover:text-accent bg-white rounded-[7px] px-3.5 py-[7px] text-[13.5px] font-medium text-ink-soft" @click="startResolve(g)">{{ t("digest.resolve") }}</button>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </template>

        <section v-if="digest.unscheduled.length" class="border-t border-line pt-5 flex flex-col gap-2">
          <div class="font-mono text-xs tracking-[0.06em] text-faint uppercase">{{ t("digest.unscheduled.title") }}</div>
          <p v-for="u in digest.unscheduled" :key="u.employeeName + u.recordDate" class="text-sm text-muted text-pretty">
            {{ t("digest.unscheduled.line", { name: u.employeeName, in: u.clockIn ?? "?", out: u.clockOut ?? "?", date: shortDate(u.recordDate) }) }}
          </p>
        </section>

        <footer class="border-t border-line pt-4 flex flex-col gap-1 font-mono text-[11.5px] text-fainter">
          <div>{{ t("digest.footer.link", { date: dayMonthYear(digest.linkExpires) }) }}</div>
          <div>{{ t("digest.footer.sla", { h: digest.slaHours }) }}</div>
        </footer>
      </template>
    </div>
  </main>
</template>
