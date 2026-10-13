import { Router, type IRouter } from "express";
import competitionsRouter from "./competitions";
import { requireAuthenticatedUser } from "../middlewares/auth";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireAuthenticatedUser, competitionsRouter);

export default router;
