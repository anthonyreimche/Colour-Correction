import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      // SafeLight hands the app's React to extensions via api.react — never bundle one.
      external: ["react", "react-dom"],
    },
    outDir: "dist",
    sourcemap: true,
  },
});
