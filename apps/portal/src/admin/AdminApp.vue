<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ApiError } from "../api.ts";
import { adminMe, adminRoute, adminSession, requestAdminLink } from "../admin-api.ts";
import type { AdminRoute } from "../admin-api.ts";
import Employers from "./Employers.vue";

const route = ref<AdminRoute>(adminRoute(window.location.pathname, window.location.hostname) ?? { page: "signin" });
const me = ref<{ email: string } | null>(null);
const notice = ref<string | null>(null);
const email = ref("");
const sent = ref<string | null>(null);
const busy = ref(false);

function go(page: "employers" | "signin") {
  window.history.replaceState(null, "", page === "signin" ? "/admin" : `/admin/${page}`);
  route.value = { page };
}

async function load() {
  try { me.value = await adminMe(); }
  catch (e) {
    adminSession.clear(); me.value = null;
    notice.value = e instanceof ApiError && e.status === 401 ? "Your sign-in link has expired or is not valid. Request a new one." : "Could not reach the API.";
    go("signin");
  }
}

onMounted(async () => {
  if (route.value.page === "landing") { adminSession.set(route.value.token); go("employers"); }
  if (route.value.page !== "signin") await load();
  else if (adminSession.get()) { await load(); if (me.value) go("employers"); }
});

async function submit() {
  if (busy.value) return;
  busy.value = true; notice.value = null;
  try { sent.value = (await requestAdminLink(email.value)).message; }
  catch (e) { notice.value = e instanceof Error ? e.message : "Could not send the link."; }
  finally { busy.value = false; }
}

function signOut() { adminSession.clear(); me.value = null; notice.value = "Signed out."; go("signin"); }
</script>

<template>
  <main class="min-h-screen flex justify-center px-5 pt-10 pb-20">
    <div class="w-full max-w-[960px] flex flex-col gap-7">
      <header class="flex justify-between items-baseline gap-4">
        <div class="font-mono text-[13px] tracking-[0.08em] text-accent">CLOCKCOVER <span class="text-faint">· admin</span></div>
        <div v-if="me" class="flex items-baseline gap-4 text-[13.5px]">
          <span class="text-muted">{{ me.email }}</span>
          <button type="button" class="text-faint hover:text-ink" @click="signOut">Sign out</button>
        </div>
      </header>

      <section v-if="route.page === 'signin' || !me" class="bg-white border border-line rounded-[10px] px-8 py-10 max-w-[460px] flex flex-col gap-4">
        <h1 class="text-[22px] font-semibold">Sign in to admin</h1>
        <p v-if="notice" class="text-[13.5px] text-warn">{{ notice }}</p>
        <template v-if="!sent">
          <p class="text-[15px] text-muted text-pretty">The owner's address only. A link that signs you in for 7 days arrives by email.</p>
          <form class="flex flex-col gap-2.5" @submit.prevent="submit">
            <input v-model="email" type="email" required autocomplete="email" placeholder="you@clockcover.com" class="border border-field rounded-[7px] px-3 py-[9px] text-[14px] outline-none focus:border-accent" />
            <button type="submit" :disabled="busy" class="bg-accent hover:bg-accent-deep disabled:opacity-60 text-white rounded-[7px] px-4 py-2 text-[14px] font-medium self-start">Send sign-in link</button>
          </form>
        </template>
        <p v-else class="text-[15px] text-body text-pretty">{{ sent }}</p>
      </section>

      <Employers v-else />
    </div>
  </main>
</template>
