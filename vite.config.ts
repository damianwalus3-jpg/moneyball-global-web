import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  base: "/moneyball-global-web/",
  plugins: [
    tanstackStart({
      spa: { enabled: true, prerender: { crawlLinks: true } },
      prerender: { failOnError: false },
    }),
    viteReact(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
