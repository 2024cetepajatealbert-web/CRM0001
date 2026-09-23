const emailPattern = /^[a-z0-9]+(?:[._%+-][a-z0-9]+)*@(gmail\.com|online\.htcgsc\.edu\.ph)$/i;
const namePattern = /^[\p{L}]+(?: [\p{L}]+)*$/u;

function requireString(value, field, { min = 1, max = 255 } = {}) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    const error = new Error(`Invalid ${field}.`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function requireEmail(value) {
  const email = requireString(value, "email", { max: 80 }).toLowerCase();
  if (!emailPattern.test(email)) {
    const error = new Error("Invalid email address.");
    error.status = 400;
    throw error;
  }
  return email;
}

function requireName(value, field, optional = false) {
  if (optional && (value === undefined || value === "")) return "";
  const name = requireString(value, field, { max: 80 });
  if (!namePattern.test(name)) {
    const error = new Error(`Invalid ${field}. Use letters only.`);
    error.status = 400;
    throw error;
  }
  return name;
}

module.exports = { requireString, requireEmail, requireName };
