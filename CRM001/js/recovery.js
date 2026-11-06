/* Password recovery is separate from signup: no email verification is required to register. */
document.addEventListener("DOMContentLoaded", () => {
  let resetToken;
  const dialog = document.querySelector("#record-dialog");
  function open(reset) {
    if (dialog.open) dialog.close();
    dialog.innerHTML = `<div class="dialog-heading"><h2 id="record-title">${reset ? "Choose a new password" : "Let’s get you back in"}</h2><button type="button" class="dialog-close" data-action="close-dialog" aria-label="Close">×</button></div>
      <p class="panel-description">${reset ? "Use a strong password you haven’t used before. Your other CRAM sessions will be signed out." : "Enter your account email. If email delivery is set up, we’ll send a private link valid for 30 minutes."}</p>
      <form id="recovery-form">${reset ? '<label>New password<input type="password" name="newPassword" autocomplete="new-password" required></label><label>Confirm new password<input type="password" name="confirmPassword" autocomplete="new-password" required></label>' : '<label>Email address<input type="email" name="email" maxlength="254" autocomplete="email" required></label>'}
      <p class="form-error" role="alert"></p><button class="btn-primary" type="submit">${reset ? "Save new password" : "Email reset link"}</button></form><p id="recovery-result" role="status"></p>`;
    const form = dialog.querySelector("form");
    window.cramFormValidation.bind(form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!window.cramFormValidation.bind(form).validate()) return;
      const submit = form.querySelector("button[type=submit]");
      if (submit.disabled) return;
      submit.disabled = true;
      const error = form.querySelector(".form-error");
      error.textContent = "";
      try {
        const payload = Object.fromEntries(new FormData(form));
        if (reset) payload.token = resetToken;
        const { response, result } = await window.cramApi.request(
          `/api/auth/${reset ? "reset-password" : "forgot-password"}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!response.ok) throw new Error(result.message || "Unable to complete this request.");
        if (reset) {
          resetToken = null;
          window.cramDashboard.logout();
          dialog.showModal();
        }
        form.reset();
        form.hidden = true;
        dialog.querySelector("#recovery-result").textContent = result.message;
      } catch (err) {
        error.textContent = err.message;
      } finally {
        submit.disabled = false;
      }
    });
    dialog.showModal();
  }
  document.querySelector("#forgot-password").addEventListener("click", () => open(false));
  function readResetLink() {
    const params = new URLSearchParams(location.hash.slice(1));
    if (!params.has("reset")) return;
    resetToken = params.get("reset");
    history.replaceState(null, "", location.pathname + location.search);
    open(true);
  }
  window.addEventListener("hashchange", readResetLink);
  readResetLink();
});
