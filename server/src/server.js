require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const errorHandler = require("./middleware/errorHandler");

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Frame-Options", "DENY");
  if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
  next();
});
app.use(cors(require("./config/corsOptions")()));
app.use(
  express.json({
    limit: "256kb",
    verify: (req, res, buffer) => {
      req.rawBody = buffer;
    },
  }),
);
app.get("/api/health", async (request, response) => {
  try {
    await require("./config/database").query("SELECT 1");
    response.json({ status: "ok", database: "connected" });
  } catch {
    response.status(503).json({
      status: "unavailable",
      message: "MySQL is unavailable. Check the server database settings.",
    });
  }
});
app.use("/api/auth", authRoutes);
app.use("/api/auth", require("./routes/recoveryRoutes"));
app.use("/api/crm", require("./routes/crmRoutes"));
app.use("/api/crm", require("./routes/teamRoutes"));
app.use("/api/crm", require("./routes/inboxRoutes"));
app.use("/api/crm", require("./routes/messengerManagement"));
app.use("/api/crm", require("./routes/recordRoutes"));
app.use("/api/messenger/webhook", require("./routes/messengerWebhook"));
app.use("/api", (req, res) => res.status(404).json({ message: "API route not found." }));
app.use(express.static(path.join(__dirname, "../../CRM001")));
app.get("*", (request, response) =>
  response.sendFile(path.join(__dirname, "../../CRM001/index.html")),
);
app.use(errorHandler);

const port = Number(process.env.PORT || 4000);
if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32 ||
  /replace_with/i.test(process.env.JWT_SECRET)
) {
  throw new Error(
    "Set a strong JWT_SECRET in server/.env before starting CRAM. Run npm run setup:env for initial setup.",
  );
}
module.exports = app.listen(port, () =>
  console.log(`CRAM server listening on http://localhost:${port}`),
);
module.exports.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${port} is already in use. CRAM may already be running. Open http://localhost:${port}, or stop your old CRAM terminal with Ctrl+C before restarting.`
      : `CRAM could not start (${error.code || "unknown error"}).`,
  );
  process.exitCode = 1;
});
