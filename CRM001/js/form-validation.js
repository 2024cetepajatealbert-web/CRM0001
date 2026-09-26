/* Accessible field feedback for dynamically created workspace forms. */
(() => {
  const rules = window.cramValidationRules;
  const states = new WeakMap();
  let nextId = 0;
  const selector =
    "#record-form, #manage-record-form, #team-dialog-form, #contact-point-form, #reply-form, #facebook-connect, .member-add";
  function checklist(input) {
    if (input.dataset.checklist) return;
    input.dataset.checklist = "true";
    const list = document.createElement("ul");
    list.className = "password-checklist";
    list.id = input.id + "-rules";
    list.setAttribute("aria-label", "New password requirements");
    for (const rule of rules.passwordChecks("")) {
      const item = document.createElement("li");
      const mark = document.createElement("span");
      mark.setAttribute("aria-hidden", "true");
      item.append(mark, document.createTextNode(rule.label));
      list.append(item);
    }
    input.closest("label").append(list);
    input.setAttribute(
      "aria-describedby",
      [input.getAttribute("aria-describedby"), list.id].filter(Boolean).join(" "),
    );
    const update = () =>
      rules.passwordChecks(input.value).forEach((rule, index) => {
        const item = list.children[index];
        item.classList.toggle("is-met", rule.met);
        item.firstChild.textContent = rule.met ? "✓" : "○";
        item.setAttribute("aria-label", `${rule.met ? "Met" : "Not met"}: ${rule.label}`);
      });
    input.addEventListener("input", update);
    input.form.addEventListener("reset", () => queueMicrotask(update));
    update();
  }
  function problem(input, form) {
    const value = input.value.trim();
    if (input.name === "newPassword" && input.value !== "") return rules.passwordError(input.value);
    if (!value) {
      if (input.name === "confirmPassword" && form.elements.newPassword?.value)
        return "Repeat your new password.";
      return input.required ? "Please complete this field." : "";
    }
    if (input.maxLength > 0 && input.value.length > input.maxLength)
      return `Use at most ${input.maxLength} characters.`;
    if (["firstName", "middleName", "lastName"].includes(input.name) && !rules.name.test(value))
      return "Must only contain letters and spaces—no numbers or special characters.";
    if (input.name === "email") {
      if (!rules.email.test(value)) return "Enter a valid email address.";
      if (
        (form.id === "team-dialog-form" || form.elements.currentPassword) &&
        !rules.accountEmail.test(value)
      )
        return "Use @gmail.com or @online.htcgsc.edu.ph only.";
    }
    if (input.name === "phone" && !rules.phone.test(value))
      return rules.contactError("Phone", value);
    if (input.name === "value" && form.elements.type)
      return rules.contactError(form.elements.type.value, value);
    if (input.name === "newPassword") return rules.passwordError(input.value);
    if (input.name === "confirmPassword" && input.value !== form.elements.newPassword.value)
      return "Your new passwords don’t match yet.";
    if (input.name === "confirm" && value !== "DELETE") return "Type DELETE exactly to confirm.";
    if (input.name === "dueAt") {
      const date = new Date(value);
      if (
        !Number.isFinite(date.getTime()) ||
        date.getFullYear() < 2000 ||
        date.getFullYear() > 2100
      )
        return "Choose a valid date between 2000 and 2100.";
      if (
        input.dataset.future === "true" &&
        date.getTime() < Math.floor(Date.now() / 60000) * 60000
      )
        return "Choose now or a future time for a new activity.";
    }
    if (input.validity.typeMismatch) return "Enter a value in the requested format.";
    if (
      input.validity.badInput ||
      input.validity.rangeUnderflow ||
      input.validity.rangeOverflow ||
      input.validity.patternMismatch
    )
      return "Check this field’s format and allowed range.";
    return "";
  }
  function bind(form) {
    if (states.has(form)) return states.get(form);
    form.noValidate = true;
    const fields = [...form.querySelectorAll("input, select, textarea")].filter(
      (input) =>
        !["hidden", "checkbox", "radio", "submit", "button"].includes(input.type) &&
        !input.readOnly &&
        !input.disabled,
    );
    const touched = new Set();
    const errors = new Map();
    for (const input of fields) {
      if (!input.id) input.id = `cram-field-${++nextId}`;
      const message = document.createElement("span");
      message.className = "field-validation-error";
      message.id = input.id + "-feedback";
      message.hidden = true;
      message.setAttribute("aria-live", "polite");
      const parent = input.closest("label") || input.parentElement;
      parent.append(message);
      errors.set(input, message);
      input.setAttribute("aria-describedby", message.id);
      input.setAttribute("aria-invalid", "false");
      if (input.name === "newPassword") {
        input.minLength = 8;
        input.maxLength = 128;
        checklist(input);
      }
      if (["firstName", "middleName", "lastName"].includes(input.name))
        input.pattern = "[\\p{L}]+(?: +[\\p{L}]+)*";
      if (input.name === "phone") input.inputMode = "tel";
    }
    function paint() {
      // Contact fields switch their browser hints when the selected platform changes.
      const contact = form.elements.namedItem("value");
      if (contact && form.elements.type) {
        const type = form.elements.type.value;
        contact.type =
          type === "Email" ? "email" : ["Phone", "SMS", "WhatsApp"].includes(type) ? "tel" : "text";
        contact.maxLength = type === "Email" ? 254 : 255;
      }
      let first;
      for (const input of fields) {
        let message = touched.has(input) ? problem(input, form) : "";
        if (
          touched.has(input) &&
          input.name === "email" &&
          form.dataset.requireContact === "true" &&
          !input.value.trim() &&
          !form.elements.phone.value.trim()
        )
          message = "Add an email address or phone number.";
        const box = errors.get(input);
        if (box.textContent !== message) box.textContent = message;
        box.hidden = !message;
        input.setAttribute("aria-invalid", String(!!message));
        input.classList.toggle(
          "field-valid",
          touched.has(input) && !!input.value.trim() && !message,
        );
        if (message && !first) first = input;
      }
      return first;
    }
    const edit = (event) => {
      if (fields.includes(event.target)) touched.add(event.target);
      const banner = form.querySelector(".form-error");
      if (banner) banner.textContent = "";
      paint();
    };
    form.addEventListener("input", edit);
    form.addEventListener("change", edit);
    form.addEventListener("focusout", edit);
    const state = {
      validate() {
        fields.forEach((input) => touched.add(input));
        const invalid = paint();
        if (invalid) invalid.focus();
        return !invalid;
      },
    };
    states.set(form, state);
    paint();
    return state;
  }
  // Capture before the existing API submit handlers. Invalid data never reaches them.
  document.addEventListener(
    "submit",
    (event) => {
      if (event.target.matches(selector) && !bind(event.target).validate()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  function scan() {
    document.querySelectorAll(selector).forEach(bind);
  }
  document.addEventListener("DOMContentLoaded", () => {
    scan();
    new MutationObserver((records) => {
      if (
        records.some((record) =>
          [...record.addedNodes].some(
            (node) =>
              node.nodeType === 1 && (node.matches?.(selector) || node.querySelector?.(selector)),
          ),
        )
      )
        scan();
    }).observe(document.body, { childList: true, subtree: true });
  });
  window.cramFormValidation = { bind, checklist };
})();
