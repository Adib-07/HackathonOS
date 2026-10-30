import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const isProductionBuild =
  process.env.NODE_ENV === "production" && !process.env.VITE_DEV_SERVER;

const rawPort = process.env.PORT;
const port = isProductionBuild ? 3000 : rawPort ? Number(rawPort) : 3000;

if (!isProductionBuild && (!rawPort || Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "attached_assets",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          clerk: ["@clerk/react", "@clerk/themes"],
          charts: ["recharts"],
          "radix-ui": [
            "@radix-ui/react-accordion",
            "@radix-ui/react-alert-dialog",
            "@radix-ui/react-aspect-ratio",
            "@radix-ui/react-avatar",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-collapsible",
            "@radix-ui/react-context-menu",
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-hover-card",
            "@radix-ui/react-label",
            "@radix-ui/react-menubar",
            "@radix-ui/react-navigation-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-progress",
            "@radix-ui/react-radio-group",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-select",
            "@radix-ui/react-separator",
            "@radix-ui/react-slider",
            "@radix-ui/react-slot",
            "@radix-ui/react-switch",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-toggle",
            "@radix-ui/react-toggle-group",
            "@radix-ui/react-tooltip",
          ],
          "tanstack-query": ["@tanstack/react-query"],
          "framer-motion": ["framer-motion"],
          cmdk: ["cmdk"],
          lucide: ["lucide-react"],
          utils: [
            "clsx",
            "tailwind-merge",
            "class-variance-authority",
            "zod",
            "wouter",
            "date-fns",
          ],
        },
      },
      onwarn(warning, warn) {
        // Suppress zod v4 Rollup annotation warnings (cosmetic, no runtime impact)
        if (
          warning.code === "ANNOTATION" ||
          (warning.message &&
            warning.message.includes("annotation that Rollup cannot interpret"))
        ) {
          return;
        }
        // Suppress empty chunk warnings for manualChunks that may be empty
        if (warning.code === "EMPTY_CHUNK") {
          return;
        }
        warn(warning);
      },
    },
  },
  esbuild: {
    // Suppress zod v4 annotation warnings from esbuild transformation phase
    logOverride: { "annotation-issue": "silent" },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // The web app calls same-origin "/api" paths. In the Replit deployment the
    // application router splits "/api" onto the API service, but a local
    // `vite dev` server has no such router, so proxy "/api" to the API server
    // here. Set API_PROXY_ORIGIN to override the target.
    proxy: {
      "/api": {
        target: process.env.API_PROXY_ORIGIN ?? "http://127.0.0.1:8080",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
