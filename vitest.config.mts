import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // Los módulos de consulta importan "server-only", que fuera de Next no
      // resuelve. En tests apunta a un módulo vacío.
      "server-only": path.resolve(import.meta.dirname, "./test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // PGlite arranca un WASM de Postgres por archivo de test; el arranque en
    // frío pasa del timeout por defecto de 5 s.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
