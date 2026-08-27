<script setup lang="ts">
import { tokenFromPath } from "./api.ts";
import DigestPage from "./DigestPage.vue";

const token = tokenFromPath(window.location.pathname);
</script>

<template>
  <DigestPage v-if="token" :token="token" />
  <main v-else class="min-h-screen flex items-center justify-center px-5">
    <div class="max-w-md text-center flex flex-col gap-3">
      <div class="font-mono text-[13px] tracking-[0.08em] text-accent">CLOCKCOVER</div>
      <h1 class="text-2xl font-semibold">Open your digest from the email</h1>
      <p class="text-[15px] text-muted text-pretty">
        The link in your daily digest is the only way in — it is signed for you and needs no account or password.
      </p>
    </div>
  </main>
</template>
