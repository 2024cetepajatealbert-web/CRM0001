/* Accessible controls shared by static authentication and dynamic CRM dialogs. */
(() => {
  const eye =
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>';
  const svg = (body) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  let sequence = 0;
  function setVisible(input, button, visible) {
    input.type = visible ? "text" : "password";
    button.setAttribute("aria-pressed", String(visible));
    button.setAttribute("aria-label", visible ? "Hide password" : "Show password");
    button.title = visible ? "Hide password" : "Show password";
    button.innerHTML = svg(eye + (visible ? '<path d="m3 3 18 18"/>' : ""));
  }
  function hidePasswords() {
    document.querySelectorAll(".password-toggle").forEach((button) => {
      const input = document.getElementById(button.getAttribute("aria-controls"));
      if (input) setVisible(input, button, false);
    });
  }
  function enhance() {
    document
      .querySelectorAll("input[type=password]:not([data-password-control])")
      .forEach((input) => {
        // Provider tokens are not account-password fields.
        if (["pageToken", "appSecret"].includes(input.name)) return;
        input.dataset.passwordControl = "true";
        if (!input.id) input.id = `cram-password-${++sequence}`;
        const wrapper = document.createElement("span");
        wrapper.className = "password-field";
        input.before(wrapper);
        wrapper.append(input);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "password-toggle";
        button.setAttribute("aria-controls", input.id);
        setVisible(input, button, false);
        wrapper.append(button);
        button.addEventListener("click", (event) => {
          event.preventDefault();
          setVisible(input, button, input.type === "password");
        });
      });
    document.querySelectorAll(".dialog-close,.close-auth,.close-onboarding").forEach((button) => {
      if (button.dataset.centeredClose) return;
      button.dataset.centeredClose = "true";
      button.type = "button";
      button.innerHTML = svg('<path d="m6 6 12 12M18 6 6 18"/>');
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    enhance();
    new MutationObserver(enhance).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("reset", hidePasswords, true);
    document.addEventListener("close", hidePasswords, true);
    document.addEventListener("cram:logout", hidePasswords);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) hidePasswords();
    });
    document.addEventListener("click", (event) => {
      if (
        event.target.closest(".close-auth,.close-onboarding,.open-login,.open-signup,.switch-login")
      )
        hidePasswords();
    });
  });
  window.cramFormControls = { hidePasswords };
})();
