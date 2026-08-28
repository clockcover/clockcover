<script setup lang="ts">
import { locale, t, toggleLocale } from "./i18n.ts";
</script>

<template>
  <button type="button" class="text-[12.5px] text-faint hover:text-accent" :lang="locale === 'he' ? 'en' : 'he'" @click="toggleLocale">{{ t("lang.switch") }}</button>
</template>
