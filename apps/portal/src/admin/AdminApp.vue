<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ApiError } from "../api.ts";
import { adminMe, adminPath, adminRoute, adminSession, requestAdminLink } from "../admin-api.ts";
import type { AdminRoute } from "../admin-api.ts";
import { locale, t } from "../i18n.ts";
import LangSwitch from "../LangSwitch.vue";
import Employers from "./Employers.vue";

const route = ref<AdminRoute>(adminRoute(window.location.pathname, window.location.hostname) ?? { page: "signin" });
const me = ref<{ email: string } | null>(null);
const notice = ref<string | null>(null);
const email = ref("");
const sent = ref<string | null>(null);
const busy = ref(false);

function go(page: "employers" | "signin") {
  window.history.replaceState(null, "", adminPath(page, window.location.hostname));
  route.value = { page };
}
async function load() {
  try { me.value = await adminMe(); }
  catch (e) {
    adminSession.clear(); me.value = null;
    notice.value = e instanceof ApiError && e.status === 401 ? t("c.signin.expired") : t("c.signin.api");
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
  try { sent.value = (await requestAdminLink(email.value, locale.value)).message; }
  catch (e) { notice.value = e instanceof Error ? e.message : t("c.signin.api"); }
  finally { busy.value = false; }
}
function signOut() { adminSession.clear(); me.value = null; notice.value = t("c.signedOut"); go("signin"); }
</script>

<template>
  <main class="min-h-screen flex justify-center px-5 pt-10 pb-20">
    <div class="w-full max-w-[1000px] flex flex-col gap-7">
      <header class="flex justify-between items-baseline gap-4">
        <div class="font-mono text-[13px] tracking-[0.08em] text-accent"><span dir="ltr">CLOCKCOVER</span> <span class="text-faint">· {{ t("brand.admin") }}</span></div>
        <div class="flex items-baseline gap-4 text-[13.5px]">
          <span v-if="me" class="text-muted" dir="ltr">{{ me.email }}</span>
          <button v-if="me" type="button" class="text-faint hover:text-ink" @click="signOut">{{ t("signOut") }}</button>
        </div>
      </header>

      <section v-if="route.page === 'signin' || !me" class="bg-white border border-line rounded-[10px] px-8 py-10 max-w-[460px] flex flex-col gap-4">
        <h1 class="text-[22px] font-semibold">{{ t("a.signin.title") }}</h1>
        <p v-if="notice" class="text-[13.5px] text-warn">{{ notice }}</p>
        <template v-if="!sent">
          <p class="text-[15px] text-muted text-pretty">{{ t("a.signin.lead") }}</p>
          <form class="flex flex-col gap-2.5" @submit.prevent="submit">
            <input v-model="email" type="email" required autocomplete="email" placeholder="you@clockcover.com" dir="ltr" class="border border-field rounded-[7px] px-3 py-[9px] text-[14px] outline-none focus:border-accent" />
            <button type="submit" :disabled="busy" class="bg-accent hover:bg-accent-deep disabled:opacity-60 text-white rounded-[7px] px-4 py-2 text-[14px] font-medium self-start">{{ t("c.signin.send") }}</button>
          </form>
        </template>
        <p v-else class="text-[15px] text-body text-pretty">{{ sent }}</p>
      </section>

      <Employers v-else />
      <footer class="mt-auto border-t border-line pt-4 flex justify-between items-baseline font-mono text-[11.5px] text-fainter">
        <span dir="ltr">© 2026 ClockCover</span>
        <LangSwitch />
      </footer>
    </div>
  </main>
</template>
