<script setup lang="ts">
import { ref } from "vue";
import { requestLink } from "../console-api.ts";

defineProps<{ notice: string | null }>();
const email = ref("");
const sent = ref<string | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);

async function submit() {
  if (busy.value) return;
  busy.value = true; error.value = null;
  try {
    const r = await requestLink(email.value);
    sent.value = r.message;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not send the link.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="bg-white border border-line rounded-[10px] px-8 py-10 max-w-[460px] flex flex-col gap-4">
    <h1 class="text-[22px] font-semibold">Sign in to the console</h1>
    <p v-if="notice" class="text-[13.5px] text-warn">{{ notice }}</p>
    <template v-if="!sent">
      <p class="text-[15px] text-muted text-pretty">Enter the operator email for your employer. We'll send a link that signs you in for 7 days — no password.</p>
      <form class="flex flex-col gap-2.5" @submit.prevent="submit">
        <input v-model="email" type="email" required autocomplete="email" placeholder="you@company.com"
          class="border border-field rounded-[7px] px-3 py-[9px] text-[14px] outline-none focus:border-accent" />
        <button type="submit" :disabled="busy" class="bg-accent hover:bg-accent-deep disabled:opacity-60 text-white rounded-[7px] px-4 py-2 text-[14px] font-medium self-start">Send sign-in link</button>
        <p v-if="error" class="text-[13.5px] text-danger">{{ error }}</p>
      </form>
    </template>
    <p v-else class="text-[15px] text-body text-pretty">{{ sent }}</p>
  </section>
</template>
