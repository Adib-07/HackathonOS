import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

// In production: plain JSON to stdout, no transport, no worker threads
// In development: use pino-pretty only if explicitly requested via LOG_PRETTY=1
const usePretty = !isProduction && process.env.LOG_PRETTY === "1";

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
  ...(usePretty
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});
