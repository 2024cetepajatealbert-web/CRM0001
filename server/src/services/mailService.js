const nodemailer = require("nodemailer");
function configured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD &&
      process.env.MAIL_FROM &&
      process.env.PUBLIC_BASE_URL,
  );
}
function link(fragment) {
  const url = new URL(process.env.PUBLIC_BASE_URL);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw Error("Configure an HTTPS PUBLIC_BASE_URL.");
  url.hash = fragment;
  return url.toString();
}
async function send({ to, subject, text }) {
  if (!configured()) throw Error("Email delivery is not configured.");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    requireTLS: process.env.SMTP_SECURE !== "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
  });
  await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, text });
}
module.exports = { configured, link, send };
