import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

// In production: plain JSON to stdout, no transport, no worker threads
// In development: use pino-pretty only if explicitly requested via LOG_PRETTY=1
const usePretty = !isProduction && process.env.LOG_PRETTY === "1";

// Use dynamic require for pino-pretty so esbuild doesn't bundle it
// pino-pretty is a devDependency and should not be in production bundle
const prettyTransport = usePretty
  ? {
      transport: {
        // Dynamic require prevents esbuild from bundling pino-pretty
        target: require.resolve("pino-pretty"),
        options: { colorize: true },
      },
    }
  : {};

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "*.authorization",
      "*.cookie",
    ],
    censor: "**REDACTED**",
  },
  ...prettyTransport,
});
