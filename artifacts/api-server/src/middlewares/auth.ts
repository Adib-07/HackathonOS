import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

declare global {
  namespace Express {
    interface Locals {
      userId: string;
    }
  }
}

export const requireAuthenticatedUser: RequestHandler = (req, res, next) => {
  let userId: string | null | undefined = null;

  try {
    userId = getAuth(req).userId;
  } catch {
    // In test or standalone environment where Clerk middleware did not resolve
  }

  // Allow test client to supply authenticated test identity in test environment only
  if (!userId && process.env.NODE_ENV === "test") {
    const testHeader = req.headers["x-test-user-id"];
    if (typeof testHeader === "string" && testHeader.trim()) {
      userId = testHeader.trim();
    }
  }

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.locals.userId = userId;
  next();
};
