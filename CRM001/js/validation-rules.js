/* Shared, dependency-free rules used by the browser and Express. */
(function (root, factory) {
  const rules = factory();
  if (typeof module === "object" && module.exports) module.exports = rules;
  else root.cramValidationRules = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const name = /^[\p{L}]+(?: +[\p{L}]+)*$/u;
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const accountEmail = /^[a-z0-9]+(?:[._%+-][a-z0-9]+)*@(gmail\.com|online\.htcgsc\.edu\.ph)$/i;
  const phone = /^\+?[0-9]{7,15}$/;
  const passwordChecks = (value) => [
    { label: "At least 8 characters", met: value.length >= 8 },
    { label: "One lowercase letter (a–z)", met: /[a-z]/.test(value) },
    { label: "One uppercase letter (A–Z)", met: /[A-Z]/.test(value) },
    { label: "One number (0–9)", met: /[0-9]/.test(value) },
    { label: "One special character (for example ! @ #)", met: /[\p{P}\p{S}]/u.test(value) },
    {
      label: "No spaces; at most 72 UTF-8 bytes",
      met: !!value && !/\s/.test(value) && new TextEncoder().encode(value).length <= 72,
    },
  ];
  function passwordError(value) {
    if (value.length < 8) return `Use at least 8 characters — add ${8 - value.length} more.`;
    if (new TextEncoder().encode(value).length > 72)
      return "Use at most 72 password bytes; some characters use more than one.";
    if (/\s/.test(value)) return "Remove spaces from your new password.";
    if (passwordChecks(value).some((rule) => !rule.met))
      return "Include an uppercase letter, a lowercase letter, a number, and a special character.";
    return "";
  }
  function contactError(type, value) {
    if (!value) return "Enter an address, number, or account ID.";
    if (type === "Email" && (!email.test(value) || value.length > 254))
      return "Enter a valid email address (up to 254 characters).";
    if (["Phone", "SMS", "WhatsApp"].includes(type) && !phone.test(value))
      return "Use 7–15 digits, optionally starting with + (for example +639171234567).";
    if (["Messenger", "TikTok"].includes(type) && /\s/.test(value))
      return "Enter the account ID or profile address without spaces.";
    return "";
  }
  return { name, email, accountEmail, phone, passwordChecks, passwordError, contactError };
});
