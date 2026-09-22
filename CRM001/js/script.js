class AuthApi {
  constructor(baseUrl = "/api/auth") {
    this.baseUrl = baseUrl;
  }

  signup(payload) {
    return this.post("/signup", payload);
  }

  login(payload) {
    return this.post("/login", payload);
  }

  async post(path, body) {
    const { response, result } = await window.cramApi.request(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(result.message || "Something went wrong. Please try again.");
    return result;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const authApi = new AuthApi();
  const invitation = new URLSearchParams(location.hash.replace(/^#/, ''));
  const marketing = document.querySelector("#marketing");
  const crm = document.querySelector("#crm");
  const loginOverlay = document.querySelector("#auth-overlay");
  const signupOverlay = document.querySelector("#onboarding-overlay");
  const loginSteps = [...document.querySelectorAll(".login-step")];
  const signupSteps = [...document.querySelectorAll(".signup-step")];
  const toast = document.querySelector("#toast");
  let toastTimer;

  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  };
  const showError = (form, message = "") => { form.querySelector(".error").textContent = message; };
  const setOverlay = (overlay, open) => {
    overlay.classList.toggle("hidden", !open);
    overlay.classList.toggle("open", open);
    overlay.setAttribute("aria-hidden", String(!open));
  };
  const showStep = (steps, step, progress = null) => {
    steps.forEach((element) => element.classList.toggle("hidden", Number(element.dataset.step) !== step));
    if (progress) progress.querySelectorAll("span").forEach((item, index) => item.classList.toggle("active", index < step));
  };
  const openLogin = () => {
    setOverlay(signupOverlay, false);
    setOverlay(loginOverlay, true);
    showStep(loginSteps, 1);
    setTimeout(() => document.querySelector("#login-email").focus(), 100);
  };
  const openSignup = () => {
    setOverlay(loginOverlay, false);
    setOverlay(signupOverlay, true);
    showStep(signupSteps, 1, signupOverlay.querySelector(".progress"));
    setTimeout(() => document.querySelector("#signup-first-name").focus(), 100);
  };
  const closeOverlays = () => { window.cramFormControls?.hidePasswords(); setOverlay(loginOverlay, false); setOverlay(signupOverlay, false); };
  const openDashboard = () => {
    closeOverlays();
    marketing.classList.add("hidden");
    crm.classList.remove("hidden");
    window.cramDashboard.open();
    showToast("Welcome to your CRAM workspace.");
  };

  document.querySelectorAll(".open-login").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); openLogin(); }));
  document.querySelectorAll(".open-signup").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); openSignup(); }));
  document.querySelectorAll(".switch-login").forEach((button) => button.addEventListener("click", openLogin));
  document.querySelector(".close-auth").addEventListener("click", closeOverlays);
  document.querySelector(".close-onboarding").addEventListener("click", closeOverlays);
  [loginOverlay, signupOverlay].forEach((overlay) => overlay.addEventListener("click", (event) => { if (event.target === overlay) closeOverlays(); }));

  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = document.querySelector("#login-email");
    const password = document.querySelector("#login-password");
    if (!email.checkValidity() || !password.checkValidity()) { showError(form, "Enter a valid email address and password."); return; }
    try {
      const result = await authApi.login({ email: email.value.trim(), password: password.value });
      window.cramDashboard.setSession(result);
      password.value = "";
      document.querySelector("#login-welcome-name").textContent = result.user?.firstName || "there";
      showError(form);
      showStep(loginSteps, 2);
    } catch (error) { showError(form, error.message); }
  });

  document.querySelector("#signup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const firstName = document.querySelector("#signup-first-name");
    const middleName = document.querySelector("#signup-middle-name");
    const lastName = document.querySelector("#signup-last-name");
    const email = document.querySelector("#signup-email");
    const password = document.querySelector("#signup-password");
    const confirmPassword = document.querySelector("#signup-confirm-password");
    if (!firstName.value.trim() || !lastName.value.trim() || !email.checkValidity() || !password.checkValidity()) { showError(form, "Complete your name, email, and an 8-character password."); return; }
    if (password.value !== confirmPassword.value) { showError(form, "Your passwords do not match."); confirmPassword.focus(); return; }
    const signup = { firstName: firstName.value.trim(), middleName: middleName.value.trim(), lastName: lastName.value.trim(), email: email.value.trim(), password: password.value, invitationToken:invitation.get('invite')||undefined };
    try {
      const result = await authApi.signup(signup);
      if(invitation.has('invite')) history.replaceState(null,'',location.pathname);
      window.cramDashboard.setSession(result);
      password.value = "";
      confirmPassword.value = "";
      document.querySelector("#signup-welcome-name").textContent = result.user?.firstName || signup.firstName;
      showError(form);
      showStep(signupSteps, 2, signupOverlay.querySelector(".progress"));
    } catch (error) { showError(form, error.message); }
  });
  document.querySelectorAll(".open-dashboard").forEach((button) => button.addEventListener("click", openDashboard));

  document.addEventListener("cram:logout", () => {
    crm.classList.add("hidden");
    marketing.classList.remove("hidden");
    document.querySelector("#login-form").reset();
    document.querySelector("#signup-form").reset();
    closeOverlays();
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeOverlays(); });
  if (window.cramDashboard.hasSession()) openDashboard();
  else if(invitation.has('invite')) {
    openSignup();
    document.querySelector('#signup-email').value=invitation.get('email')||'';
    document.querySelector('#onboarding-title').textContent='Join your CRAM team.';
  }
});
