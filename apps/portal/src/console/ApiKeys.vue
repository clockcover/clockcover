<script setup lang="ts">
import { onMounted, ref } from "vue";
import { createApiKey, listApiKeys, revokeApiKey } from "../console-api.ts";
import type { ApiKey } from "../console-api.ts";
import { dateTime, t } from "../i18n.ts";

const keys = ref<ApiKey[]>([]);
const name = ref("");
const fresh = ref<{ key: string; prefix: string } | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);

async function refresh() { try { keys.value = (await listApiKeys()).keys; } catch (e) { error.value = e instanceof Error ? e.message : t("error.load"); } }
onMounted(refresh);

async function create() {
  if (!name.value.trim() || busy.value) return;
  busy.value = true; error.value = null;
  try { const r = await createApiKey(name.value.trim()); fresh.value = { key: r.key, prefix: r.prefix }; name.value = ""; await refresh(); }
  catch (e) { error.value = e instanceof Error ? e.message : t("error.load"); }
  finally { busy.value = false; }
}
async function revoke(k: ApiKey) {
  busy.value = true; error.value = null;
  try { await revokeApiKey(k.id); if (fresh.value?.prefix === k.prefix) fresh.value = null; await refresh(); }
  catch (e) { error.value = e instanceof Error ? e.message : t("error.load"); }
  finally { busy.value = false; }
}
</script>

<template>
  <section class="bg-white border border-line rounded-[10px] p-6 max-w-[560px] flex flex-col gap-4">
    <div class="flex flex-col gap-1">
      <div class="text-[16px] font-semibold">{{ t("c.keys.title") }}</div>
      <p class="text-[13px] text-muted text-pretty">{{ t("c.keys.lead") }}</p>
    </div>
    <form class="flex gap-2" @submit.prevent="create">
      <input v-model="name" maxlength="80" :placeholder="t('c.keys.name')" class="flex-1 border border-field rounded-[7px] px-3 py-[8px] text-[13.5px] outline-none focus:border-accent" />
      <button type="submit" :disabled="busy || !name.trim()" class="bg-accent hover:bg-accent-deep disabled:opacity-60 text-white rounded-[7px] px-4 py-2 text-[13.5px] font-medium">{{ t("c.keys.create") }}</button>
    </form>
    <div v-if="fresh" class="border border-accent rounded-[7px] p-3 flex flex-col gap-1.5 bg-strong/30">
      <div class="text-[13px] text-ink">{{ t("c.keys.created") }}</div>
      <code class="font-mono text-[13px] break-all select-all" dir="ltr">{{ fresh.key }}</code>
    </div>
    <p v-if="error" class="text-[13.5px] text-danger">{{ error }}</p>
    <div v-if="keys.length === 0" class="text-[13.5px] text-muted">{{ t("c.keys.none") }}</div>
    <ul v-else class="divide-y divide-line-soft">
      <li v-for="k in keys" :key="k.id" class="py-2.5 flex justify-between items-center gap-3" :class="k.revokedAt ? 'opacity-50' : ''">
        <div class="flex flex-col gap-0.5">
          <div class="text-[14px] font-medium">{{ k.name }} <code class="font-mono text-[12px] text-faint" dir="ltr">{{ k.prefix }}…</code></div>
          <div class="font-mono text-[11.5px] text-faint">
            {{ k.revokedAt ? t("c.keys.revoked", { when: dateTime(k.revokedAt) }) : k.lastUsedAt ? t("c.keys.lastUsed", { when: dateTime(k.lastUsedAt) }) : t("c.keys.neverUsed") }}
          </div>
        </div>
        <button v-if="!k.revokedAt" type="button" :disabled="busy" class="text-[12.5px] text-faint hover:text-danger" @click="revoke(k)">{{ t("c.keys.revoke") }}</button>
      </li>
    </ul>
  </section>
</template>
