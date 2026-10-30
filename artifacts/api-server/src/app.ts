import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import cors from "cors";
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
import { requireServerEnv } from "./lib/env-validation";

const app: Express = express();

// Validate server env on each request (except /healthz)
app.use(requireServerEnv());

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

// CORS - explicit allow-list from env var
// Format: ALLOWED_ORIGINS="https://hackathonos-mu.vercel.app,https://*.vercel.app"
// In production, only the exact production domain is allowed.
// In preview, the Vercel preview pattern is allowed.
// Credentials only for allowed origins.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.some((allowed) => {
      if (allowed.includes("*")) {
        // Convert wildcard pattern to regex
        const regex = new RegExp("^" + allowed.replace(/\*/g, ".*") + "$");
        return regex.test(origin);
      }
      return allowed === origin;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      logger.warn({ origin }, "CORS blocked request from unauthorized origin");
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // Allow cookies/auth headers for allowed origins
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Test-User-Id"],
  maxAge: 86400, // Cache preflight for 24 hours
};

app.use(cors(corsOptions));

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

// Body size limit - prevent DoS via large payloads
// Default 1MB, configurable via BODY_SIZE_LIMIT (e.g., "2mb", "500kb")
const bodySizeLimit = process.env.BODY_SIZE_LIMIT ?? "1mb";
app.use(express.json({ limit: bodySizeLimit }));
app.use(express.urlencoded({ extended: true, limit: bodySizeLimit }));

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

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
  logger.warn(
    "Clerk keys not configured; running in development/test mode without Clerk middleware",
  );
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

// Centralized error handler - MUST BE LAST
// In production: no stack traces, no internal details
// In development: include stack trace for debugging
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const isProd = process.env.NODE_ENV === "production";

  logger.error(
    { err: err.message, stack: isProd ? undefined : err.stack },
    "Unhandled error",
  );

  // Don't leak internal errors in production
  if (isProd) {
    res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  } else {
    res.status(500).json({
      error: err.message,
      code: "INTERNAL_ERROR",
      stack: err.stack,
    });
  }
});

// 404 handler for unmatched routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: "Not found",
    code: "NOT_FOUND",
  });
});

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
