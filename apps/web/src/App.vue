<script setup lang="ts">
import { escalationTokenFromPath, tokenFromPath } from "./api.ts";
import { consoleRoute } from "./console-api.ts";
import DigestPage from "./DigestPage.vue";
import EscalationPage from "./EscalationPage.vue";
import ConsoleApp from "./console/ConsoleApp.vue";

const { pathname, hostname } = window.location;
const token = tokenFromPath(pathname);
const escalationToken = escalationTokenFromPath(pathname);
const isConsole = consoleRoute(pathname, hostname) !== null;
const consoleUrl = (import.meta.env?.VITE_CONSOLE_URL as string | undefined) ?? "/console";
</script>

<template>
  <DigestPage v-if="token" :token="token" />
  <EscalationPage v-else-if="escalationToken" :token="escalationToken" />
  <ConsoleApp v-else-if="isConsole" />
  <main v-else class="min-h-screen flex items-center justify-center px-5">
    <div class="max-w-md text-center flex flex-col gap-3">
      <div class="font-mono text-[13px] tracking-[0.08em] text-accent">CLOCKCOVER</div>
      <h1 class="text-2xl font-semibold">Open your digest from the email</h1>
      <p class="text-[15px] text-muted text-pretty">
        The link in your daily digest is the only way in — it is signed for you and needs no account or password.
      </p>
      <p class="text-[13px] text-fainter">Operators: <a :href="consoleUrl" class="text-accent">sign in to the console</a>.</p>
    </div>
  </main>
</template>
