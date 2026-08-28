<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ApiError } from "../api.ts";
import { consolePath, consoleRoute, me, session } from "../console-api.ts";
import type { ConsoleRoute, EmployerSettings } from "../console-api.ts";
import { setLocale, t } from "../i18n.ts";
import LangSwitch from "../LangSwitch.vue";
import SignIn from "./SignIn.vue";
import Overview from "./Overview.vue";
import Imports from "./Imports.vue";
import Settings from "./Settings.vue";
import ApiKeys from "./ApiKeys.vue";

const route = ref<ConsoleRoute>(consoleRoute(window.location.pathname, window.location.hostname) ?? { page: "signin" });
const employer = ref<EmployerSettings | null>(null);
const notice = ref<string | null>(null);

function go(page: "overview" | "imports" | "settings" | "signin") {
  window.history.replaceState(null, "", consolePath(page, window.location.hostname));
  route.value = { page };
}

async function load() {
  try {
    employer.value = await me();
    setLocale(employer.value.locale, false);
  } catch (e) {
    session.clear(); employer.value = null;
    notice.value = e instanceof ApiError && e.status === 401 ? t("c.signin.expired") : t("c.signin.api");
    go("signin");
  }
}

onMounted(async () => {
  if (route.value.page === "landing") { session.set(route.value.token); go("overview"); }
  if (route.value.page !== "signin") await load();
  else if (session.get()) { await load(); if (employer.value) go("overview"); }
});

function signOut() { session.clear(); employer.value = null; notice.value = t("c.signedOut"); go("signin"); }
function onSaved(e: EmployerSettings) { employer.value = e; setLocale(e.locale); }

const tabs = [["overview", "c.tab.overview"], ["imports", "c.tab.imports"], ["settings", "c.tab.settings"]] as const;
</script>

<template>
  <main class="min-h-screen flex justify-center px-5 pt-10 pb-20">
    <div class="w-full max-w-[760px] flex flex-col gap-7">
      <header class="flex justify-between items-baseline gap-4">
        <div class="font-mono text-[13px] tracking-[0.08em] text-accent"><span dir="ltr">CLOCKCOVER</span> <span class="text-faint">· {{ t("brand.console") }}</span></div>
        <div class="flex items-baseline gap-4 text-[13.5px]">
          <span v-if="employer" class="text-muted">{{ employer.name }}</span>
          <button v-if="employer" type="button" class="text-faint hover:text-ink" @click="signOut">{{ t("signOut") }}</button>
        </div>
      </header>

      <SignIn v-if="route.page === 'signin' || !employer" :notice="notice" />

      <template v-else>
        <nav class="flex gap-1 border-b border-line">
          <button v-for="[key, label] in tabs" :key="key" type="button" class="px-3.5 py-2 text-[14px] -mb-px border-b-2"
            :class="route.page === key ? 'border-accent text-ink font-medium' : 'border-transparent text-muted hover:text-ink'" @click="go(key)">{{ t(label) }}</button>
        </nav>
        <Overview v-if="route.page === 'overview'" :employer="employer" />
        <Imports v-else-if="route.page === 'imports'" />
        <div v-else-if="route.page === 'settings'" class="flex flex-col gap-5">
          <Settings :employer="employer" @saved="onSaved" />
          <ApiKeys />
        </div>
      </template>
      <footer class="mt-auto border-t border-line pt-4 flex justify-between items-baseline font-mono text-[11.5px] text-fainter">
        <span dir="ltr">© 2026 ClockCover</span>
        <LangSwitch />
      </footer>
    </div>
  </main>
</template>
