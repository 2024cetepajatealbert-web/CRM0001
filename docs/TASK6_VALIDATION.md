# Task 6: browser-side form validation

CRAM's users are agents. “Client-side” means JavaScript running in their browser,
not a separate website for property buyers. No customer portal or verification-code
feature was added. Existing database records are unchanged; no migration is needed.

## Implemented rules

- First, middle and last names: letters and spaces only; no digits, punctuation,
  emoji or symbols. Middle name stays optional. Accented letters are supported.
- Agent account emails: only exact `gmail.com` and `online.htcgsc.edu.ph` domains,
  case-insensitive. Applied to signup, login, invitations and profile email changes.
  A suffix such as `gmail.com.other` is invalid. Customer contact emails can use
  other valid domains. Domain matching does not prove ownership of an email account.
- New passwords: at least eight characters, ASCII lowercase and uppercase letters,
  a digit, a punctuation/symbol character, no whitespace, at most 72 UTF-8 bytes.
  The live checklist updates each requirement separately. Signup and profile
  changes enforce identical server-side rules. Profile changes include confirmation.
- Login/current-password fields accept existing passwords; composition requirements
  are not retroactively applied to authentication. Existing accounts outside the
  two allowed domains will be rejected by the requested email policy. No account
  emails or password hashes are automatically rewritten.
- Phone, SMS and WhatsApp: 7–15 digits with an optional leading `+`; letters,
  spaces and punctuation are rejected. For example, `09171234567` or `+639171234567`.
  This validates structure, not ownership or whether a number is active.
- Contact fields switch email/telephone/text hints when their platform changes.
  Social contact IDs/profile addresses cannot contain spaces. Adding a contact does
  not itself connect a social-media account or verify the identifier with Meta.
- New client: at least one email or phone is required before submission.
- Required fields reject whitespace-only input. Length limits and date checks are
  enforced before API calls, with field-specific messages and red outlines.
- New activities must be scheduled in the current minute or later. Existing overdue
  tasks remain editable. Dates must be in the supported 2000–2100 range.
- Deletions require the exact `DELETE` confirmation. Optional team membership stays
  optional; role and team choices remain constrained by the existing selectors.

## Design and implementation

`CRM001/js/validation-rules.js` shares pure format/password rules with Express.
`CRM001/js/form-validation.js` enhances dynamically created dashboard forms and
blocks invalid submit events before API handlers. Authentication retains its
existing inline error handling and uses the shared rules/password checklist.
`CRM001/css/validation.css` adds consistent accessible error/success styling.

Fields use HTML attributes such as required, minlength, maxlength, input types and
date minimums where appropriate. JavaScript provides custom accessible feedback
instead of browser validation bubbles. Invalid fields have `aria-invalid`, linked
error messages, and first-error keyboard focus. An invalid form does not send a
mutation request. Server validation remains necessary and is not replaced.

## Demonstration checklist

1. Submit an empty signup form; show required-field messages.
2. Enter `Anna1` or `Anna!`; correct it to `Anna Maria`.
3. Enter `person@gmol.com`; correct it to an allowed domain.
4. Enter a short/weak password; add the required character types and show all checks.
5. Mismatch confirmation; correct it before submitting.
6. Add a client with phone `hello`; correct it to a valid digit string.
7. Switch a contact from Email to SMS and show its validation changes.
8. Try a whitespace-only team name and a past date for a new activity.
9. Try a weak new profile password or mismatched confirmation.
10. Save valid records, refresh, and confirm persistence in MySQL.

Use fictional demo details. Never show real passwords, tokens or `.env` on screen.

## Checks

From `server`, `node scripts/check-validation.js` tests shared rules without a
database. `npm run test:fresh` creates and removes its own uniquely named temporary
MySQL database. For browser checks, configure PLAYWRIGHT_MODULE and optionally
PLAYWRIGHT_CHANNEL (as in the development environment).

`check-form-ui.js` covers authentication feedback and the password checklist.
`check-dashboard-validation-ui.js` verifies invalid dashboard submissions produce
zero API writes. Existing integration/browser tests cover valid CRUD submissions,
workspace isolation, responsive layout and password toggles. Meta traffic is mocked.

The older SYSTEM_REVIEW.md describes findings before this policy update; the
account-domain and name-rule decisions above supersede its product suggestions.
