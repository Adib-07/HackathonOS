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
  const userId = getAuth(req).userId;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.locals.userId = userId;
  next();
};
