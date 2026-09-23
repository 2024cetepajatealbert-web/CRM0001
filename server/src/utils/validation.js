const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

module.exports = { requireString, requireEmail };
