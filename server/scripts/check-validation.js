const assert = require("node:assert/strict");
const {
  requireEmail,
  requireSignupEmail,
  requireNewPassword,
  requireName,
  requireContact,
} = require("../src/utils/validation");

const invalid = (work) => assert.throws(work, (error) => error.status === 400);
assert.equal(requireEmail(" Buyer@Example.com "), "buyer@example.com");
assert.equal(requireSignupEmail(" PERSON@GMAIL.COM "), "person@gmail.com");
assert.equal(
  requireSignupEmail("2024_cete.person@online.htcgsc.edu.ph"),
  "2024_cete.person@online.htcgsc.edu.ph",
);
for (const value of [
  "person@example.com",
  "person@gmail.com.evil.test",
  "a..b@gmail.com",
  "not-email",
])
  invalid(() => requireSignupEmail(value));
invalid(() => requireEmail("not-email"));
const longContact = "a".repeat(64) + "@" + "b".repeat(30) + ".com";
assert.equal(requireEmail(longContact, { max: 254 }), longContact);
invalid(() => requireEmail(longContact));
for (const value of [undefined, "", "   "])
  assert.equal(requireName(value, "middle name", true), "");
assert.equal(requireName(" María José ", "first name"), "María José");
for (const value of ["123", "Anna1", "<script>", "", " "])
  invalid(() => requireName(value, "first name"));
invalid(() => requireName(123, "middle name", true));
for (const value of [
  "person@gmol.com",
  "person@gmail.co",
  "person@online.htcgsc.ph.edu",
  "person@gmail.com.extra",
])
  invalid(() => requireSignupEmail(value));
for (const type of ["Phone", "SMS", "WhatsApp"]) {
  assert.equal(requireContact(type, "+639171234567"), "+639171234567");
  for (const value of ["hello", "123", "1234567890123456", "0917abc4567"])
    invalid(() => requireContact(type, value));
}
assert.equal(requireContact("Email", "Buyer@Company.example"), "buyer@company.example");
invalid(() => requireContact("Email", "broken-address"));
invalid(() => requireContact("TikTok", "account with spaces"));
assert.equal(requireNewPassword("Aa9!" + "a".repeat(68)), "Aa9!" + "a".repeat(68));
assert.equal(requireNewPassword("Aa9!" + "é".repeat(34)), "Aa9!" + "é".repeat(34));
for (const value of [
  "short",
  "a".repeat(73),
  "é".repeat(37),
  "12345678",
  "lowercase9!",
  "UPPERCASE9!",
  "NoNumbers!",
  "NoSymbols9",
  "With space9!",
])
  invalid(() => requireNewPassword(value));
console.log(
  "PASS: account email domains, general customer email, names, phone/contact formats and strong password/byte rules.",
);
