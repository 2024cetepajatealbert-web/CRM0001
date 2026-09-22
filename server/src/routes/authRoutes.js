const express = require("express");
const rateLimit = require("express-rate-limit");
const asyncHandler = require("../utils/asyncHandler");
const controller = require("../controllers/authController");

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false, message: { message: "Too many sign-in attempts. Please try again later." } });

router.post("/signup", authLimiter, asyncHandler(controller.signup));
router.post("/login", authLimiter, asyncHandler(controller.login));

module.exports = router;
