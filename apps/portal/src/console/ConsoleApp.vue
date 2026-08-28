<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ApiError } from "../api.ts";
import { consoleRoute, me, session } from "../console-api.ts";
import type { ConsoleRoute, EmployerSettings } from "../console-api.ts";
import SignIn from "./SignIn.vue";
import Overview from "./Overview.vue";
import Imports from "./Imports.vue";
import Settings from "./Settings.vue";

const route = ref<ConsoleRoute>(consoleRoute(window.location.pathname, window.location.hostname) ?? { page: "signin" });
const employer = ref<EmployerSettings | null>(null);
const notice = ref<string | null>(null);

function go(page: "overview" | "imports" | "settings" | "signin") {
  const path = page === "signin" ? "/console" : `/console/${page}`;
  window.history.replaceState(null, "", path);
  route.value = page === "signin" ? { page } : { page };
}

async function load() {
  try {
    employer.value = await me();
  } catch (e) {
    session.clear();
    employer.value = null;
    notice.value = e instanceof ApiError && e.status === 401 ? "Your sign-in link has expired or is not valid. Request a new one." : "Could not reach the API.";
    go("signin");
  }
}

onMounted(async () => {
  if (route.value.page === "landing") {
    session.set(route.value.token);
    go("overview");
  }
  if (route.value.page !== "signin") await load();
  else if (session.get()) { await load(); if (employer.value) go("overview"); }
});

function signOut() {
  session.clear();
  employer.value = null;
  notice.value = "Signed out.";
  go("signin");
}

const tabs = [["overview", "Overview"], ["imports", "Imports"], ["settings", "Settings"]] as const;
</script>

<template>
  <main class="min-h-screen flex justify-center px-5 pt-10 pb-20">
    <div class="w-full max-w-[760px] flex flex-col gap-7">
      <header class="flex justify-between items-baseline gap-4">
        <div class="font-mono text-[13px] tracking-[0.08em] text-accent">CLOCKCOVER <span class="text-faint">· console</span></div>
        <div v-if="employer" class="flex items-baseline gap-4 text-[13.5px]">
          <span class="text-muted">{{ employer.name }}</span>
          <button type="button" class="text-faint hover:text-ink" @click="signOut">Sign out</button>
        </div>
      </header>

      <SignIn v-if="route.page === 'signin' || !employer" :notice="notice" />

      <template v-else>
        <nav class="flex gap-1 border-b border-line">
          <button
            v-for="[key, label] in tabs" :key="key" type="button"
            class="px-3.5 py-2 text-[14px] -mb-px border-b-2"
            :class="route.page === key ? 'border-accent text-ink font-medium' : 'border-transparent text-muted hover:text-ink'"
            @click="go(key)"
          >{{ label }}</button>
        </nav>
        <Overview v-if="route.page === 'overview'" :employer="employer" />
        <Imports v-else-if="route.page === 'imports'" />
        <Settings v-else-if="route.page === 'settings'" :employer="employer" @saved="employer = $event" />
      </template>
    </div>
  </main>
</template>
