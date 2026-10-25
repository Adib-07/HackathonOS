import express, { type Express } from "express";
import helmet from "helmet";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { rateLimiterWrapper } from "./middlewares/rateLimit";
import { validateServerEnv } from "./lib/env-validation";

validateServerEnv();

const app: Express = express();

const isProduction = process.env.NODE_ENV === "production";

// Security headers with Helmet
app.use(
  helmet({
    // Prevent MIME type sniffing
    xContentTypeOptions: true,
    // Prevent clickjacking
    frameguard: { action: "deny" },
    // Referrer policy
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    // HSTS - only in production with HTTPS
    hsts: isProduction
      ? {
          maxAge: 31_536_000, // 1 year
          includeSubDomains: true,
          preload: true,
        }
      : false,
    // Disable the X-Powered-By header
    hidePoweredBy: true,
    // Disable DNS prefetching
    dnsPrefetchControl: { allow: false },
    // Disable feature policy / permissions policy
    // (we don't use any features that need it)
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        // Default to 'none' - no resources allowed by default
        defaultSrc: ["'none'"],
        // API responses are JSON, no scripts or styles needed
        // Allow connecting to same origin for API calls
        connectSrc: ["'self'"],
        // No frames allowed
        frameAncestors: ["'none'"],
        // No plugins
        objectSrc: ["'none'"],
        // Base URI restricted to self
        baseUri: ["'self'"],
        // Form actions restricted to self
        formAction: ["'self'"],
      },
    },
    // Cross-Origin Embedder Policy - require CORP for cross-origin resources
    crossOriginEmbedderPolicy: false, // API doesn't embed cross-origin resources
    // Cross-Origin Opener Policy
    crossOriginOpenerPolicy: { policy: "same-origin" },
    // Cross-Origin Resource Policy
    crossOriginResourcePolicy: { policy: "same-origin" },
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (process.env.CLERK_SECRET_KEY || process.env.CLERK_PUBLISHABLE_KEY) {
  app.use(
    clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        process.env.CLERK_PUBLISHABLE_KEY,
      ),
    })),
  );
} else if (process.env.NODE_ENV === "production") {
  // Without Clerk keys every authenticated route would answer 401 for every
  // user. Fail fast so the misconfiguration is visible at deploy time rather
  // than as a silent sign-in outage.
  throw new Error(
    "CLERK_SECRET_KEY (or CLERK_PUBLISHABLE_KEY) is required in production but was not provided.",
  );
} else {
  logger.warn("Clerk keys not configured; running in development/test mode without Clerk middleware");
}

// Attach userId to request for rate limiter key generation
app.use((req, _res, next) => {
  try {
    const { getAuth } = require("@clerk/express");
    const auth = getAuth(req);
    if (auth.userId) {
      (req as any).userId = auth.userId;
    }
  } catch {
    // Clerk not configured or auth not available
  }
  next();
});

// Apply rate limiting to API routes (after auth so userId is available)
app.use("/api", rateLimiterWrapper);
app.use("/api", router);

export default app;

export {
  db,
  pool,
  competitionsTable,
  workflowEvidenceTable,
  competitionAnalysesTable,
  analysisRequirementsTable,
  researchFindingsTable,
  researchGapsTable,
  ideaCandidatesTable,
  ideaEvaluationsTable,
  ideaRubricsTable,
  buildBriefsTable,
} from "@workspace/db";
