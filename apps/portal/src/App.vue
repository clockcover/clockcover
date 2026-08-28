<script setup lang="ts">
import { onMounted } from "vue";
import { escalationTokenFromPath, tokenFromPath } from "./api.ts";
import { consoleRoute } from "./console-api.ts";
import { adminRoute } from "./admin-api.ts";
import { locale, setLocale, t } from "./i18n.ts";
import DigestPage from "./DigestPage.vue";
import EscalationPage from "./EscalationPage.vue";
import ConsoleApp from "./console/ConsoleApp.vue";
import AdminApp from "./admin/AdminApp.vue";
import LangSwitch from "./LangSwitch.vue";

const { pathname, hostname } = window.location;
const token = tokenFromPath(pathname);
const escalationToken = escalationTokenFromPath(pathname);
const isAdmin = adminRoute(pathname, hostname) !== null;
const isConsole = !isAdmin && consoleRoute(pathname, hostname) !== null;
const consoleUrl = (import.meta.env?.VITE_CONSOLE_URL as string | undefined) ?? "/console";
onMounted(() => setLocale(locale.value, false));
</script>

<template>
  <DigestPage v-if="token" :token="token" />
  <EscalationPage v-else-if="escalationToken" :token="escalationToken" />
  <AdminApp v-else-if="isAdmin" />
  <ConsoleApp v-else-if="isConsole" />
  <main v-else class="min-h-screen flex items-center justify-center px-5">
    <div class="max-w-md text-center flex flex-col gap-3">
      <div class="font-mono text-[13px] tracking-[0.08em] text-accent" dir="ltr">CLOCKCOVER</div>
      <h1 class="text-2xl font-semibold">{{ t("landing.title") }}</h1>
      <p class="text-[15px] text-muted text-pretty">{{ t("landing.lead") }}</p>
      <p class="text-[13px] text-fainter">{{ t("landing.operators") }} <a :href="consoleUrl" class="text-accent">{{ t("landing.consoleLink") }}</a></p>
      <LangSwitch />
    </div>
  </main>
</template>
