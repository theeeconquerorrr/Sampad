import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = import.meta.dirname;
const icon = readFileSync(resolve(root, "public/icons/pulsedrop.svg")).toString("base64");

function hash(value) {
  return createHash("sha256").update(value).digest("base64");
}

function singleHtmlPlugin() {
  return {
    name: "pulsedrop-single-html",
    enforce: "post",
    transformIndexHtml(html) {
      return html
        .replace(/<link rel="manifest"[^>]*>\s*/g, "")
        .replace(/<meta property="og:image"[^>]*>\s*/g, "")
        .replace(
          /<link rel="icon"[^>]*>/,
          `<link rel="icon" href="data:image/svg+xml;base64,${icon}" type="image/svg+xml">`
        );
    },
    generateBundle(_options, bundle) {
      const page = bundle["index.html"];
      const script = Object.values(bundle).find(file => file.type === "chunk" && file.isEntry);
      const stylesheet = Object.values(bundle).find(file => file.type === "asset" && file.fileName.endsWith(".css"));
      if (!page || !script || !stylesheet) {
        throw new Error("Could not assemble the standalone HTML assets.");
      }

      const scriptCode = script.code.replace(/<\/script/gi, "<\\/script");
      const cssCode = String(stylesheet.source);
      let html = String(page.source)
        .replace(/<script type="module"[^>]*src="[^"]+"><\/script>/, `<script type="module">${scriptCode}</script>`)
        .replace(/<link rel="modulepreload"[^>]*>\s*/g, "")
        .replace(/<link rel="stylesheet"[^>]*>/, `<style>${cssCode}</style>`);

      const policy = [
        "default-src 'self'",
        `script-src 'sha256-${hash(scriptCode)}'`,
        `style-src 'sha256-${hash(cssCode)}'`,
        "img-src 'self' data:",
        "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebasedatabase.app wss://*.firebasedatabase.app https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
        "frame-src https://www.openstreetmap.org",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        "upgrade-insecure-requests"
      ].join("; ");
      html = html.replace(
        /<meta http-equiv="Content-Security-Policy" content="[^"]*">/,
        `<meta http-equiv="Content-Security-Policy" content="${policy}">`
      );

      for (const file of Object.values(bundle)) {
        if (file.type === "chunk" || (file.type === "asset" && file.fileName.endsWith(".css"))) {
          delete bundle[file.fileName];
        }
      }
      page.fileName = "pulsedrop-demo.html";
      page.source = html;
      delete bundle["index.html"];
      bundle[page.fileName] = page;
    }
  };
}

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [singleHtmlPlugin()],
  build: {
    outDir: "standalone",
    emptyOutDir: true,
    copyPublicDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(root, "index.html"),
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
