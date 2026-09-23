require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const errorHandler = require("./middleware/errorHandler");

const app = express();
app.use(cors(require("./config/corsOptions")()));
app.use(
  express.json({
    limit: "256kb",
    verify: (req, res, buffer) => {
      req.rawBody = buffer;
    },
  }),
);
app.get("/api/health", (request, response) => response.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/crm", require("./routes/crmRoutes"));
app.use("/api/crm", require("./routes/teamRoutes"));
app.use("/api/crm", require("./routes/inboxRoutes"));
app.use("/api/crm", require("./routes/recordRoutes"));
app.use("/api/messenger/webhook", require("./routes/messengerWebhook"));
app.use("/api", (req, res) => res.status(404).json({ message: "API route not found." }));
app.use(express.static(path.join(__dirname, "../../CRM001")));
app.get("*", (request, response) =>
  response.sendFile(path.join(__dirname, "../../CRM001/index.html")),
);
app.use(errorHandler);

const port = Number(process.env.PORT || 4000);
module.exports = app.listen(port, () =>
  console.log(`CRAM server listening on http://localhost:${port}`),
);
