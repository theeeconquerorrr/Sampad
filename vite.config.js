import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        courier: resolve(import.meta.dirname, "courier.html")
      }
    }
  },
  server: {
    host: "127.0.0.1"
  }
});
