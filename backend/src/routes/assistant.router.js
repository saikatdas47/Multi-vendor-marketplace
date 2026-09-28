import { Router } from "express";
import * as assistant from "../controllers/assistant.controller.js";
import { optionalJWT, verifyJWT } from "../middlewares/auth.middleware.js";
import { cacheAssistant } from "../middlewares/cache.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { askDto } from "../validators/assistant.validator.js";

const router = Router();

router.post("/assistant/ask/", optionalJWT, validateBody(askDto), cacheAssistant(300), assistant.ask);
router.get("/assistant/suggestions/", assistant.suggestions);
router.get("/assistant/suggest/", assistant.suggest);
router.get("/assistant/history/:id/", verifyJWT, assistant.history);
router.get("/assistant/sessions/", verifyJWT, assistant.sessions);

export default router;
