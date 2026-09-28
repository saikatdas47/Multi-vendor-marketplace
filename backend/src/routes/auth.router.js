import { Router } from "express";
import * as auth from "../controllers/auth.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router=Router();
router.post("/register/",auth.register);router.post("/login/",auth.login);router.post("/refresh/",auth.refresh);router.post("/verify/",auth.refresh);router.post("/logout/",auth.logout);
router.route("/me/").get(verifyJWT,auth.me).patch(verifyJWT,auth.updateMe);
router.post("/change-password/",verifyJWT,auth.changePassword);router.post("/send-verification/",verifyJWT,auth.sendVerification);router.post("/verify-email/",auth.verifyEmail);router.post("/forgot-password/",auth.forgotPassword);router.post("/reset-password/",auth.resetPassword);
export default router;
