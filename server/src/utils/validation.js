const rules = require("../../../CRM001/js/validation-rules");
const emailPattern = rules.email;
const signupEmailPattern = rules.accountEmail;
const namePattern = rules.name;

function requireString(value, field, { min = 1, max = 255 } = {}) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    const error = new Error(`Invalid ${field}.`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function requireEmail(value, { max = 80 } = {}) {
  const email = requireString(value, "email", { max }).toLowerCase();
  if (!emailPattern.test(email)) {
    const error = new Error("Invalid email address.");
    error.status = 400;
    throw error;
  }
  return email;
}

// Account-only policy; customer contact emails may use other domains.
function requireSignupEmail(value) {
  const email = requireEmail(value);
  if (!signupEmailPattern.test(email)) {
    const error = new Error("Use a valid @gmail.com or @online.htcgsc.edu.ph email address.");
    error.status = 400;
    throw error;
  }
  return email;
}

function requireNewPassword(value) {
  requireString(value, "password", { min: 8, max: 128 });
  const message = rules.passwordError(value);
  if (message) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
  return value;
}

function requireContact(type, value) {
  const contact = requireString(value, "contact value", { max: type === "Email" ? 254 : 255 });
  const message = rules.contactError(type, contact);
  if (message) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
  return type === "Email" ? contact.toLowerCase() : contact;
}

function requireName(value, field, optional = false) {
  if (optional && (value === undefined || (typeof value === "string" && !value.trim()))) return "";
  const name = requireString(value, field, { max: 80 });
  if (!namePattern.test(name)) {
    const error = new Error(`Invalid ${field}. Use letters only.`);
    error.status = 400;
    throw error;
  }
  return name;
}

module.exports = {
  requireString,
  requireEmail,
  requireSignupEmail,
  requireNewPassword,
  requireName,
  requireContact,
};
