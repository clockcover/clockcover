import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command }) => {
  // A deploy build without VITE_CONSOLE_URL would send operators to /console on the digest host
  // (see docs/contributing.md). CI builds only to compile-check and has no deploy target.
  if (command === "build" && !process.env.VITE_CONSOLE_URL) {
    throw new Error("VITE_CONSOLE_URL is not set — build with VITE_API_URL=<api origin> VITE_CONSOLE_URL=<console origin> pnpm build");
  }
  return { plugins: [vue(), tailwindcss()] };
});
