// @ts-check
import { defineConfig } from "astro/config";

// One static build per legal entity, selected by ENTIDAD (src/entidades.ts
// validates it). Output goes to dist/, which the Dockerfile copies into nginx.
export default defineConfig({
  output: "static",
  build: {
    // /v/<tipo>/<version>/ must resolve to a directory index, as the
    // manifest publishes those URLs with a trailing slash.
    format: "directory",
  },
  vite: {
    // Banners stay as files; never inline them as base64 into the page again.
    build: { assetsInlineLimit: 0 },
  },
});
