<script setup lang="ts">
import { ref } from "vue";
import { requestLink } from "../console-api.ts";
import { apiError, t } from "../i18n.ts";

defineProps<{ notice: string | null }>();
const email = ref("");
const sent = ref<string | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);

async function submit() {
  if (busy.value) return;
  busy.value = true; error.value = null;
  try { sent.value = (await requestLink(email.value)).message; }
  catch (e) { error.value = apiError(e, "c.signin.api"); }
  finally { busy.value = false; }
}
</script>

<template>
  <section class="bg-white border border-line rounded-[10px] px-8 py-10 max-w-[460px] flex flex-col gap-4">
    <h1 class="text-[22px] font-semibold">{{ t("c.signin.title") }}</h1>
    <p v-if="notice" class="text-[13.5px] text-warn">{{ notice }}</p>
    <template v-if="!sent">
      <p class="text-[15px] text-muted text-pretty">{{ t("c.signin.lead") }}</p>
      <form class="flex flex-col gap-2.5" @submit.prevent="submit">
        <input v-model="email" type="email" required autocomplete="email" :aria-label="t('c.signin.email')" placeholder="you@company.com" dir="ltr"
          class="border border-field rounded-[7px] px-3 py-[9px] text-[14px] outline-none focus:border-accent" />
        <button type="submit" :disabled="busy" class="bg-accent hover:bg-accent-deep disabled:opacity-60 text-white rounded-[7px] px-4 py-2 text-[14px] font-medium self-start">{{ t("c.signin.send") }}</button>
        <p v-if="error" class="text-[13.5px] text-danger">{{ error }}</p>
      </form>
    </template>
    <p v-else class="text-[15px] text-body text-pretty">{{ sent }}</p>
  </section>
</template>
