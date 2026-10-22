import { Router, type IRouter } from "express";
import competitionsRouter from "./competitions";
import evidenceRouter from "./evidence";
import intelRouter from "./intel";
import { requireAuthenticatedUser } from "../middlewares/auth";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireAuthenticatedUser, competitionsRouter);
router.use(requireAuthenticatedUser, evidenceRouter);
router.use(requireAuthenticatedUser, intelRouter);

export default router;
