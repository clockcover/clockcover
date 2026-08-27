<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ApiError, fetchDigest, resolveGap } from "./api.ts";
import type { Digest, DigestGap } from "./api.ts";
import { GAP_LABEL, dayMonthYear, detail, groupByDay, longDate, shortDate, slaStatus } from "./digest.ts";

const props = defineProps<{ token: string }>();

const digest = ref<Digest | null>(null);
const error = ref<string | null>(null);
const resolvingId = ref<string | null>(null);
const noteDraft = ref("");
const busy = ref(false);
const resolved = ref(new Map<string, string>()); // gapId → note
const now = new Date();

onMounted(async () => {
  try {
    digest.value = await fetchDigest(props.token);
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 401
      ? "This link has expired or is not valid. Open the newest digest email — every day's email carries a fresh link."
      : "Could not load your digest. Please try again in a moment.";
  }
});

const openGaps = computed(() => digest.value?.gaps.filter((g) => !resolved.value.has(g.id)) ?? []);
const allGaps = computed(() => digest.value?.gaps ?? []);
const days = computed(() => groupByDay(allGaps.value));
const allClear = computed(() => digest.value !== null && digest.value.gaps.length === 0);

const startResolve = (g: DigestGap) => { resolvingId.value = g.id; noteDraft.value = ""; };
const cancel = () => { resolvingId.value = null; };
async function confirm(g: DigestGap) {
  if (!digest.value || busy.value) return;
  busy.value = true;
  try {
    const r = await resolveGap(props.token, g.id, noteDraft.value);
    resolved.value = new Map(resolved.value).set(g.id, r.note ?? "");
    resolvingId.value = null;
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 409 ? "That gap was already resolved." : "Could not resolve the gap. Please try again.";
  } finally {
    busy.value = false;
  }
}

const badge = (g: DigestGap) =>
  g.gapType === "no_record_at_all" ? "bg-strong text-strong-ink" : "bg-badge text-badge-ink";
const tone = { muted: "text-faint", warn: "text-warn", danger: "text-danger" } as const;
</script>

<template>
  <main class="min-h-screen flex justify-center px-5 pt-12 pb-20">
    <div class="w-full max-w-[620px] flex flex-col gap-7">
      <header class="flex justify-between items-baseline">
        <div class="font-mono text-[13px] tracking-[0.08em] text-accent">CLOCKCOVER</div>
        <div v-if="digest" class="font-mono text-xs text-faint">digest · {{ longDate(digest.digestDate) }}</div>
      </header>

      <div v-if="error && !digest" class="bg-white border border-line rounded-[10px] px-8 py-10 text-center flex flex-col gap-2.5">
        <div class="text-[22px] font-semibold">Link not valid</div>
        <p class="text-[15px] text-muted text-pretty">{{ error }}</p>
      </div>

      <div v-else-if="!digest" class="text-[15px] text-muted">Loading your digest…</div>

      <template v-else>
        <section v-if="allClear" class="bg-white border border-line rounded-[10px] px-8 py-10 text-center flex flex-col gap-2.5">
          <div class="text-[22px] font-semibold">All clear</div>
          <p class="text-[15px] text-muted text-pretty">
            Every scheduled shift on your team has a complete clock record for this period. Nothing to resolve.
          </p>
        </section>

        <template v-else>
          <div class="flex flex-col gap-1.5">
            <h1 class="text-[26px] font-bold tracking-[-0.01em]">
              {{ openGaps.length }} open {{ openGaps.length === 1 ? "gap" : "gaps" }} on your team
            </h1>
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
                    <span class="font-mono text-[10.5px] tracking-[0.07em] uppercase px-[9px] py-1 rounded whitespace-nowrap" :class="badge(g)">
                      {{ GAP_LABEL[g.gapType] }}
                    </span>
                  </div>

                  <div v-if="resolved.has(g.id)" class="border-t border-line-soft pt-[11px] flex flex-col gap-[3px]">
                    <div class="text-[13.5px] font-medium text-ok">✓ Resolved by you just now</div>
                    <div v-if="resolved.get(g.id)" class="text-[13px] text-muted">“{{ resolved.get(g.id) }}”</div>
                  </div>

                  <div v-else-if="resolvingId === g.id" class="border-t border-line-soft pt-3 flex flex-col gap-2.5">
                    <input
                      v-model="noteDraft"
                      maxlength="500"
                      placeholder="Optional note — e.g. badge left at home, confirmed by phone"
                      class="border border-field rounded-[7px] px-3 py-[9px] text-[13.5px] outline-none focus:border-accent"
                      @keydown.enter.prevent="confirm(g)"
                      @keydown.esc="cancel"
                    />
                    <div class="flex gap-2">
                      <button type="button" :disabled="busy" class="bg-accent hover:bg-accent-deep disabled:opacity-60 text-white rounded-[7px] px-4 py-2 text-[13.5px] font-medium" @click="confirm(g)">
                        Resolve gap
                      </button>
                      <button type="button" class="text-muted hover:text-ink px-2.5 py-2 text-[13.5px]" @click="cancel">Cancel</button>
                    </div>
                  </div>

                  <div v-else class="border-t border-line-soft pt-[11px] flex justify-between items-center gap-3">
                    <div class="font-mono text-xs" :class="tone[slaStatus(g, digest.slaHours, now).tone]">
                      {{ slaStatus(g, digest.slaHours, now).text }}
                    </div>
                    <button type="button" class="border border-field hover:border-accent hover:text-accent bg-white rounded-[7px] px-3.5 py-[7px] text-[13.5px] font-medium text-ink-soft" @click="startResolve(g)">
                      Mark resolved
                    </button>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </template>

        <section v-if="digest.unscheduled.length" class="border-t border-line pt-5 flex flex-col gap-2">
          <div class="font-mono text-xs tracking-[0.06em] text-faint uppercase">Unscheduled attendance — not a gap</div>
          <p v-for="u in digest.unscheduled" :key="u.employeeName + u.recordDate" class="text-sm text-muted text-pretty">
            {{ u.employeeName }} clocked {{ u.clockIn ?? "?" }}–{{ u.clockOut ?? "?" }} on {{ shortDate(u.recordDate) }} with no scheduled shift.
            Nothing to resolve — noted as a sanity check.
          </p>
        </section>

        <footer class="border-t border-line pt-4 flex flex-col gap-1 font-mono text-[11.5px] text-fainter">
          <div>This link is yours alone · expires {{ dayMonthYear(digest.linkExpires) }}</div>
          <div>Unresolved gaps escalate to payroll after {{ digest.slaHours }} h</div>
        </footer>
      </template>
    </div>
  </main>
</template>
