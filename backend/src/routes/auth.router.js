import { Router } from "express";
import * as auth from "../controllers/auth.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { loginDto, refreshDto, registerDto, verifyDto } from "../validators/auth.validator.js";

const router = Router();
router.post("/register/", validateBody(registerDto), auth.register);
router.post("/login/", validateBody(loginDto), auth.login);
router.post("/refresh/", validateBody(refreshDto), auth.refresh);
router.post("/verify/", validateBody(verifyDto), auth.verifyAccessToken);
router.post("/logout/", validateBody(refreshDto), auth.logout);
router.route("/me/").get(verifyJWT,auth.me).patch(verifyJWT,auth.updateMe);
router.post("/change-password/",verifyJWT,auth.changePassword);router.post("/send-verification/",verifyJWT,auth.sendVerification);router.post("/verify-email/",auth.verifyEmail);router.post("/forgot-password/",auth.forgotPassword);router.post("/reset-password/",auth.resetPassword);
export default router;
