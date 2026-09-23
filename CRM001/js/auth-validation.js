/* Inline feedback for account forms. Backend validation remains authoritative. */
(() => {
  function bind(form) {
    const fields = [...form.querySelectorAll("input")];
    const touched = new Set();
    const serverErrors = new Map();
    const banner = form.querySelector(".error");
    banner.setAttribute("role", "alert");
    form.noValidate = true; // Use accessible inline feedback instead of browser popups.

    fields.forEach((input) => {
      const message = document.createElement("span");
      message.id = input.id + "-error";
      message.className = "auth-field-error";
      message.setAttribute("aria-live", "polite");
      message.hidden = true;
      input.closest("label").append(message);
      input.setAttribute("aria-describedby", message.id);
      if (input.id.includes("password")) {
        input.maxLength = 128;
        if (!input.id.includes("confirm")) {
          const hint = document.createElement("span");
          hint.id = input.id + "-hint";
          hint.className = "auth-field-hint";
          hint.textContent = "Use at least 8 characters.";
          input.closest("label").append(hint);
          input.setAttribute("aria-describedby", `${message.id} ${hint.id}`);
        }
      } else input.maxLength = 80;
    });

    function problem(input) {
      const value = input.value.trim();
      if (!value)
        return input.required
          ? input.id.includes("confirm")
            ? "Repeat your password to confirm it."
            : `Enter your ${input.id.includes("email") ? "email address" : input.id.includes("password") ? "password" : input.id.includes("first") ? "first name" : "last name"}.`
          : "";
      if (
        input.id.includes("email") &&
        (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || input.validity.typeMismatch)
      ) {
        return "Enter a valid email, like name@example.com.";
      }
      if (input.id.includes("password")) {
        if (value.length < 8) return `Use at least 8 characters — add ${8 - value.length} more.`;
        if (input.value.length > 128) return "Keep your password to 128 characters or fewer.";
        if (
          input.id.includes("confirm") &&
          input.value !== form.querySelector("#signup-password").value
        )
          return "Your passwords don’t match yet. Try again.";
      } else if (value.length > 80) return "Keep this field to 80 characters or fewer.";
      return serverErrors.get(input.id) || "";
    }

    function paint(input) {
      const error = touched.has(input.id) ? problem(input) : "";
      const message = document.getElementById(input.id + "-error");
      if (message.textContent !== error) message.textContent = error;
      message.hidden = !error;
      input.setAttribute("aria-invalid", String(Boolean(error)));
      input.closest("label").classList.toggle("auth-field-invalid", Boolean(error));
      const hint = document.getElementById(input.id + "-hint");
      if (hint) {
        hint.hidden = Boolean(error);
        const met = input.value.trim().length >= 8;
        const text = met ? "✓ Minimum length met." : "Use at least 8 characters.";
        if (hint.textContent !== text) hint.textContent = text;
        hint.classList.toggle("is-ready", met);
      }
      return !error;
    }

    function edit(input) {
      // A credential rejection refers to the pair; editing either clears it.
      serverErrors.clear();
      banner.textContent = "";
      touched.add(input.id);
      fields.forEach(paint);
    }
    fields.forEach((input) => {
      input.addEventListener("input", () => edit(input));
      input.addEventListener("blur", () => {
        touched.add(input.id);
        paint(input);
      });
    });

    function reset() {
      touched.clear();
      serverErrors.clear();
      banner.textContent = "";
      fields.forEach(paint);
    }
    form.addEventListener("reset", () => queueMicrotask(reset));
    return {
      reset,
      validate() {
        serverErrors.clear();
        banner.textContent = "";
        fields.forEach((input) => touched.add(input.id));
        const valid = fields.map(paint).every(Boolean);
        if (!valid) fields.find((input) => input.getAttribute("aria-invalid") === "true").focus();
        return valid;
      },
      serverError(error) {
        if (form.id === "login-form" && error.status === 401) {
          fields.forEach((input) => {
            touched.add(input.id);
            serverErrors.set(input.id, "Check your email and password together.");
          });
          banner.textContent =
            "We couldn’t sign you in. Check your email and password and try again.";
        } else if (
          form.id === "signup-form" &&
          error.status === 409 &&
          /email/i.test(error.message)
        ) {
          touched.add("signup-email");
          serverErrors.set(
            "signup-email",
            "This email already has an account. Choose Login instead.",
          );
        } else
          banner.textContent =
            error.message || "We couldn’t complete that request. Please try again.";
        fields.forEach(paint);
      },
    };
  }
  window.cramAuthValidation = { bind };
})();
