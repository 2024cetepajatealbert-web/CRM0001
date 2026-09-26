/* Account-scoped CRM workspace. All record changes go through the Express API. */
(() => {
  const icons = {
    overview:
      '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    clients:
      '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5"/>',
    pipeline:
      '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h3"/>',
    chart: '<path d="M4 3v18h17M9 16v-5m5 5V7m5 9V4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
    home: '<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    refresh: '<path d="M20 7a9 9 0 1 0 1 8M20 3v5h-5"/>',
    exit: '<path d="M9 4H4v16h5m5-13 5 5-5 5M9 12h11"/>',
  };
  const icon = (name) =>
    `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.home}</svg>`;
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const money = (value) =>
    value == null || value === ""
      ? "Budget not set"
      : new Intl.NumberFormat("en-PH", {
          style: "currency",
          currency: "PHP",
          maximumFractionDigits: 0,
        }).format(Number(value));
  const date = (value) =>
    new Date(value).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  const initials = (name) =>
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((n) => n[0])
      .join("");
  const dayKey = (value) => {
    const d = new Date(value);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  const isAppointment = (task) => ["Site visit", "Online meeting"].includes(task.type);
  const pending = (task) => task.status !== "Completed";
  const nav = [
    ["Overview", "overview"],
    ["Clients", "clients"],
    ["Inbox", "clients"],
    ["Activities", "calendar"],
    ["Teams", "clients"],
    ["Analytics", "chart"],
    ["Connect", "home"],
  ];
  let token = sessionStorage.getItem("cram.token") || "";
  let data = null;
  let page = "Overview";
  let query = "";
  let filter = "";
  let generation = 0;
  let toastTimer;
  const root = () => document.querySelector("#crm");
  const dialog = () => document.querySelector("#record-dialog");
  const toast = (message) => {
    const el = document.querySelector("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
  };
  async function api(path, method = "GET", body) {
    const { response, result } = await window.cramApi.request(`/api/crm${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401) {
      logout();
      throw new Error(result.message);
    }
    if (!response.ok)
      throw new Error(result.message || "Could not save your changes. Please try again.");
    return result;
  }
  function logout() {
    window.cramCollab?.reset();
    window.cramRecords?.reset();
    generation++;
    token = "";
    data = null;
    sessionStorage.removeItem("cram.token");
    if (dialog().open) dialog().close();
    root().replaceChildren();
    document.dispatchEvent(new Event("cram:logout"));
  }
  async function load() {
    const current = ++generation;
    const [result, collaboration] = await Promise.all([api("/workspace"), api("/collaboration")]);
    result.collaboration = collaboration;
    if (current !== generation || !token) return;
    data = result;
    render();
  }
  async function open() {
    if (!token) {
      logout();
      return;
    }
    root().innerHTML = '<div class="workspace-loading" role="status">Opening your workspace…</div>';
    try {
      await load();
    } catch (e) {
      if (token)
        root().innerHTML = `<div class="workspace-loading"><h2>Unable to load your workspace</h2><p>${esc(e.message)}</p><button class="btn-primary" data-action="refresh">Try again</button> <button class="quiet-button" data-action="logout">Log out</button></div>`;
      else toast(e.message);
    }
  }
  function empty(title, description, action = "", label = "") {
    return `<div class="empty-state"><span class="empty-icon">${icon("home")}</span><h3>${esc(title)}</h3><p>${esc(description)}</p>${action ? `<button class="quiet-button" data-action="${action}">${esc(label)} ${icon("arrow")}</button>` : ""}</div>`;
  }
  function stats() {
    const today = dayKey(new Date());
    const due = data.tasks.filter((t) => pending(t) && dayKey(t.dueAt) === today).length;
    const overdue = data.tasks.filter((t) => pending(t) && new Date(t.dueAt) < new Date()).length;
    const conversations = data.collaboration.conversations.filter(
      (c) => c.status === "Open",
    ).length;
    const appointments = data.tasks.filter(
      (t) => pending(t) && isAppointment(t) && new Date(t.dueAt) >= new Date(),
    ).length;
    return `<section class="metric-grid" aria-label="Workspace totals">${[
      ["clients", "Total leads", data.clients.length, "Online & offline inquiries", "Clients"],
      [
        "clock",
        "Due today",
        due,
        overdue
          ? `${overdue} overdue task${overdue === 1 ? "" : "s"}`
          : "Your next steps, in one place",
        "Follow-ups",
      ],
      [
        "calendar",
        "Upcoming appointments",
        appointments,
        "Site visits & online meetings",
        "Appointments",
      ],
      ["clients", "Open conversations", conversations, "Keep every conversation moving", "Inbox"],
    ]
      .map(
        ([i, label, count, caption, target]) =>
          `<button class="metric-card" data-page="${target}"><span class="metric-icon">${icon(i)}</span><span class="metric-label">${label}</span><strong>${count}</strong><small>${caption}</small><span class="metric-arrow">↗</span></button>`,
      )
      .join("")}</section>`;
  }
  function taskList(tasks) {
    if (!tasks.length)
      return empty(
        "A little room to plan ahead",
        "Schedule the next conversation, call, or site visit.",
        "add-task",
        "Schedule a task",
      );
    return `<div class="activity-list">${tasks
      .map((t) => {
        const late = pending(t) && new Date(t.dueAt) < new Date();
        return `<article class="activity-row ${!pending(t) ? "is-complete" : ""}"><button class="complete-task" data-action="complete" data-id="${t.id}" aria-label="${pending(t) ? "Complete" : "Reopen"} ${esc(t.title || t.type)}" title="${pending(t) ? "Mark complete" : "Reopen"}">${!pending(t) ? icon("check") : ""}</button><div><strong>${esc(t.title || t.type)}</strong><button class="text-button" data-action="open-chat" data-id="${t.clientId}">${esc(t.clientName)}</button>${t.notes ? `<p class="task-note">${esc(t.notes)}</p>` : ""}</div><div class="activity-meta"><span>${esc(t.type)}</span><time class="${late ? "overdue" : ""}" datetime="${esc(t.dueAt)}">${late ? "Overdue · " : ""}${date(t.dueAt)}</time><div class="record-actions"><button type="button" class="text-button" data-record="edit-task" data-id="${t.id}">Edit</button><button type="button" class="text-button danger-text" data-record="delete-task" data-id="${t.id}">Delete</button></div></div></article>`;
      })
      .join("")}</div>`;
  }
  function clientTable(clients, recent = false) {
    if (!clients.length)
      return empty(
        query || filter ? "No matching clients" : "Your next relationship starts here",
        query || filter
          ? "Try another name, email, or phone number."
          : "Add an inquiry from social media, a referral, an event, or a walk-in.",
        "add-client",
        "Add a client",
      );
    return `<div class="table-wrap"><table class="workspace-table"><thead><tr><th>Client</th><th>Phone</th><th>Assigned to</th><th>Date added</th><th>Next step</th><th aria-label="Actions"></th></tr></thead><tbody>${clients
      .map((c) => {
        const next = data.tasks.find((t) => t.clientId === c.id && pending(t));
        return `<tr><td><button class="client-identity" data-action="open-chat" data-id="${c.id}"><span class="person-avatar">${esc(initials(c.name))}</span><span><strong>${esc(c.name)}</strong><small>${esc(c.email || c.phone || c.legacyContact || "No contact added")}</small></span></button></td><td>${esc(c.phone || "Not added")}</td><td>${esc(c.assignedName || "Unassigned")}</td><td>${date(c.createdAt)}</td><td>${next ? `${esc(next.title || next.type)}<small>${date(next.dueAt)}</small>` : "No task scheduled"}</td><td><button class="row-action" data-action="edit-client" data-id="${c.id}" title="Edit client">Edit</button> <button class="row-action" data-action="add-task" data-id="${c.id}" aria-label="Schedule task for ${esc(c.name)}" title="Schedule task">${icon("plus")}</button></td></tr>`;
      })
      .join("")}</tbody></table></div>`;
  }
  function contactSummary() {
    const counts = [
      ["With email", data.clients.filter((c) => c.email).length],
      ["With phone", data.clients.filter((c) => c.phone).length],
      ["With conversations", new Set(data.collaboration.conversations.map((c) => c.clientId)).size],
    ];
    return (
      '<div class="source-chart">' +
      counts
        .map(
          ([label, count]) =>
            `<div><span>${label}</span><strong>${count}</strong><div class="bar-track"><i style="width:${data.clients.length ? (count / data.clients.length) * 100 : 0}%"></i></div></div>`,
        )
        .join("") +
      "</div>"
    );
  }
  function overview() {
    const due = data.tasks.filter(
      (t) => pending(t) && new Date(t.dueAt) <= new Date(new Date().setHours(23, 59, 59, 999)),
    );
    const upcoming = data.tasks.find(
      (t) => pending(t) && isAppointment(t) && new Date(t.dueAt) >= new Date(),
    );
    return `<section class="overview-banner"><div><p class="eyebrow">Make room for meaningful conversations</p><h2>Every relationship starts<br>with a thoughtful next step.</h2><p>${due.length ? `${due.length} task${due.length === 1 ? " needs" : "s need"} your attention today.` : "A clear view of your leads. A little more focus for your day."}</p><button class="quiet-button" data-page="Follow-ups">Plan your follow-ups ${icon("arrow")}</button></div><div class="banner-art" aria-hidden="true">${icon("home")}<span>Built around relationships.</span></div></section>
      ${stats()}
      <div class="overview-grid"><section class="dash-panel"><header><div><p class="eyebrow">Your priority queue</p><h2>Today’s follow-ups</h2></div><button class="text-button" data-page="Follow-ups">View all →</button></header>${taskList(due.slice(0, 4))}</section><section class="next-appointment"><p class="eyebrow">On the horizon</p><h2>Next appointment</h2>${upcoming ? `<div class="date-tile"><small>${new Date(upcoming.dueAt).toLocaleDateString("en-PH", { month: "short" })}</small><strong>${new Date(upcoming.dueAt).getDate()}</strong></div><h3>${esc(upcoming.title || upcoming.type)}</h3><p>${esc(upcoming.clientName)}</p><small>${date(upcoming.dueAt)}</small><button data-page="Appointments">View appointments ${icon("arrow")}</button>` : `<div class="appointment-symbol">${icon("calendar")}</div><h3>Your next visit belongs here.</h3><p>Bring the conversation closer to a place they can call home.</p><button data-action="add-appointment">Schedule an appointment ${icon("plus")}</button>`}</section></div>
      <section class="dash-panel recent-panel"><header><div><p class="eyebrow">People, before properties</p><h2>Recent clients</h2></div><button class="text-button" data-page="Clients">View all clients →</button></header>${clientTable(data.clients.slice(0, 5), true)}</section>
      <div class="overview-grid bottom-grid"><section class="dash-panel"><header><div><p class="eyebrow">Keep in touch</p><h2>Contact coverage</h2></div><button class="text-button" data-page="Clients">View clients →</button></header>${contactSummary()}</section><section class="dash-panel"><header><div><p class="eyebrow">Keep moving forward</p><h2>Task progress</h2></div></header><div class="outcome-number">${data.tasks.filter((t) => !pending(t)).length}<span>Completed tasks</span></div><p class="panel-description">${data.tasks.filter(pending).length} tasks still open.</p><button class="text-button" data-page="Activities">Plan your next steps →</button></section></div>`;
  }
  function toolbar(options, placeholder = "Search tasks or clients…") {
    return `<div class="workspace-toolbar"><label class="search-box">${icon("search")}<input id="workspace-search" type="search" aria-label="Search records" placeholder="${placeholder}" value="${esc(query)}"></label><select id="workspace-filter" aria-label="Filter records"><option value="">All tasks</option>${options.map((s) => `<option ${filter === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`;
  }
  function pageContent() {
    const matches = (...values) =>
      values.some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(query.toLowerCase()),
      );
    const helpers = {
      api,
      load,
      render,
      navigate,
      showForm,
      esc,
      icon,
      date,
      money,
      empty,
      taskList,
      clientTable,
      stats,
      toast,
      root,
      dialog,
      query,
      filter,
      logout,
    };
    window.cramRecords?.bind(data, helpers);
    const expanded = window.cramCollab?.render(page, data, helpers);
    if (expanded !== undefined && expanded !== null) return expanded;
    if (page === "Overview") return overview();
    if (page === "Follow-ups" || page === "Appointments") {
      let tasks = data.tasks.filter(
        (t) =>
          (page !== "Appointments" || isAppointment(t)) &&
          matches(t.title, t.clientName, t.type) &&
          (!filter ||
            (filter === "Overdue"
              ? pending(t) && new Date(t.dueAt) < new Date()
              : t.status === filter)),
      );
      return `<section class="dash-panel"><header><div><h2>${page === "Appointments" ? "Site visits & online meetings" : "Your next conversations"}</h2><p class="panel-description">${page === "Appointments" ? "A shared moment can move a buyer forward." : "Complete a task when you have followed through."}</p></div><button class="quiet-button" data-action="${page === "Appointments" ? "add-appointment" : "add-task"}">${icon("plus")} Schedule</button></header>${toolbar(["Pending", "Completed", "Overdue"], "Search tasks or clients…")}${taskList(tasks)}</section>`;
    }
    return "";
  }
  function render() {
    if (!data) return;
    const fullName = `${data.user.firstName} ${data.user.lastName}`;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const role =
      { OWNER: "Workspace owner", MANAGER: "Team manager", AGENT: "Sales agent" }[
        data.user.workspaceRole
      ] || "Team member";
    root().innerHTML = `<aside class="workspace-sidebar"><a class="brand" href="#" data-page="Overview"><img src="assets/cram-logo.png" alt=""><span>Cram<span>.</span></span></a><div class="workspace-label">YOUR WORKSPACE</div><nav aria-label="Workspace navigation">${nav.map(([label, i]) => `<button data-page="${label}" ${page === label ? 'aria-current="page"' : ""} class="${page === label ? "active" : ""}" title="${label}">${icon(i)}<span>${label}</span>${label === "Clients" ? `<b>${data.clients.length}</b>` : ""}</button>`).join("")}</nav><div class="sidebar-note">${icon("home")}<strong>Good relationships.<br>Great beginnings.</strong><p>Your next closing starts with a conversation.</p></div><div class="workspace-profile"><span class="person-avatar">${esc(initials(fullName))}</span><div><strong>${esc(fullName)}</strong><small>${role}</small></div><button data-action="logout" aria-label="Log out" title="Log out">${icon("exit")}</button></div></aside><main class="workspace-main"><div class="workspace-topline"><span>Workspace <i>/</i> <strong>${page}</strong></span><span class="live-label"><i></i> Your team workspace</span></div><header class="workspace-header"><div><p>${new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p><h1>${page === "Overview" ? `${greeting}, ${esc(data.user.firstName)}<span class="greeting-spark">✦</span>` : page}</h1><small>${page === "Overview" ? "Here’s where your relationships stand today." : "Every detail brings the next step into focus."}</small></div><div class="header-actions"><button type="button" class="quiet-button profile-control" data-record="profile">My profile</button><button class="quiet-button refresh-button" data-action="refresh" aria-label="Refresh workspace">${icon("refresh")}</button><button class="btn-primary" data-action="add-client">${icon("plus")} Add client</button></div></header><div id="workspace-content">${pageContent()}</div><footer class="workspace-footer"><span>CRAM · Real estate, built on relationships.</span><span>All dates shown in your local time</span></footer></main>`;
  }
  function navigate(target) {
    if (["Follow-ups", "Appointments"].includes(target)) {
      window.cramCollab?.setActivityView(target === "Appointments" ? "Appointments" : "Upcoming");
      target = "Activities";
    }
    if (!nav.some(([name]) => name === target)) return;
    page = target;
    query = "";
    filter = "";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const options = (values, selected = "") =>
    values
      .map(
        (v) => `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(v)}</option>`,
      )
      .join("");
  function clientForm(client = {}) {
    const field = (label, name, max, required = false, type = "text", extra = "") =>
      `<label class="${extra}"><span class="field-label">${label}${required ? ' <span aria-hidden="true">*</span>' : ""}</span><input name="${name}" type="${type}" maxlength="${max}" value="${esc(client[name] || "")}" ${required ? "required" : ""}></label>`;
    return `<fieldset class="client-section"><legend>Personal details</legend><div class="form-grid">${field("First name", "firstName", 30, true)}${field("Middle name <small>Optional</small>", "middleName", 30)}${field("Last name", "lastName", 30, true, "text", "full-field")}</div></fieldset><fieldset class="client-section"><legend>Contact details</legend><p class="contact-help">Add a phone number or email so your team can stay in touch.</p><div class="form-grid">${field("Phone", "phone", 30, false, "tel")}${field("Email", "email", 254, false, "email")}</div></fieldset>`;
  }
  let formKind = "",
    editingId = null,
    lastFocus = null;
  function showForm(kind, clientId = null, appointment = false, conversationId = null) {
    if (!data) return;
    if (kind === "task" && !data.clients.length) {
      toast("Add a client first, then schedule their next step.");
      showForm("client");
      return;
    }
    formKind = kind;
    editingId = kind === "client" ? clientId : null;
    const client = data.clients.find((c) => c.id === Number(clientId));
    const title =
      kind === "client" ? (client ? "Edit client" : "Add a client") : "Schedule a next step";
    const fields =
      kind === "client"
        ? clientForm(client)
        : `<div class="form-grid"><label class="span-two">Client<select name="clientId" required>${data.clients.map((c) => `<option value="${c.id}" ${c.id === Number(clientId) ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label><label class="span-two">Task title *<input name="title" maxlength="160" required placeholder="e.g. Discuss financing options"></label><label>Type<select name="type">${options(appointment ? ["Site visit", "Online meeting"] : data.types, appointment ? "Site visit" : "Follow-up")}</select></label><label>Due date & time *<input name="dueAt" type="datetime-local" required></label><label class="span-two">Notes<textarea name="notes" maxlength="5000" rows="3" placeholder="Meeting location, agenda, or follow-up details"></textarea></label></div>`;
    lastFocus = document.activeElement;
    dialog().innerHTML = `<div class="dialog-heading"><div><p class="eyebrow">People, before everything</p><h2 id="record-title">${title}</h2></div><button class="dialog-close" data-action="close-dialog" aria-label="Close dialog">×</button></div><p class="panel-description">${kind === "client" ? "Add at least an email address or phone number." : "Give every conversation a clear next step."}</p><form id="record-form">${kind === "task" && conversationId ? `<input type="hidden" name="conversationId" value="${Number(conversationId)}">` : ""}${fields}<p class="form-error" role="alert"></p><footer><button class="quiet-button" type="button" data-action="close-dialog">Cancel</button><button class="btn-primary" type="submit">${kind === "client" ? "Save client" : "Schedule task"} ${icon("arrow")}</button></footer></form>`;
    const createdForm = dialog().querySelector("#record-form");
    if (kind === "client" && !client) createdForm.dataset.requireContact = "true";
    if (kind === "task") {
      const dateField = createdForm.elements.dueAt;
      const now = new Date();
      dateField.dataset.future = "true";
      dateField.min = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    }
    if (kind === "client" && client)
      window.cramCollab?.contactEditor(dialog(), client, data, { api, load, toast, esc });
    if (!dialog().open) dialog().showModal();
  }
  document.addEventListener("DOMContentLoaded", () => {
    dialog().addEventListener("close", () => {
      if (lastFocus?.isConnected) lastFocus.focus();
    });
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-action],[data-page]");
      if (!button || (!root().contains(button) && !dialog().contains(button))) return;
      event.preventDefault();
      if (button.dataset.page) {
        navigate(button.dataset.page);
        return;
      }

      const action = button.dataset.action;
      if (action === "logout") return logout();
      if (action === "close-dialog") return dialog().close();
      if (action === "add-client") return showForm("client");
      if (action === "open-chat") {
        window.cramCollab.selectClient(Number(button.dataset.id));
        navigate("Inbox");
        return;
      }
      if (action === "edit-client") return showForm("client", Number(button.dataset.id));
      if (action === "add-task" || action === "add-appointment")
        return showForm(
          "task",
          Number(button.dataset.id) || null,
          action === "add-appointment",
          Number(button.dataset.conversation) || null,
        );
      button.disabled = true;
      try {
        if (action === "complete") {
          const task = data.tasks.find((t) => t.id === Number(button.dataset.id));
          await api(`/tasks/${task.id}`, "PATCH", {
            status: pending(task) ? "Completed" : "Pending",
          });
        }
        await load();
        toast(action === "complete" ? "Task updated." : "Workspace refreshed.");
      } catch (e) {
        toast(e.message);
      } finally {
        button.disabled = false;
      }
    });
    function filterRecords(event) {
      if (!["workspace-search", "workspace-filter"].includes(event.target.id)) return;
      const input = event.target;
      if (input.id === "workspace-search") query = input.value;
      else filter = input.value;
      const active = input.id;
      const caret = input.selectionStart;
      document.querySelector("#workspace-content").innerHTML = pageContent();
      const replacement = document.getElementById(active);
      replacement.focus();
      if (caret !== null && replacement.setSelectionRange)
        replacement.setSelectionRange(caret, caret);
    }
    root().addEventListener("input", (event) => {
      if (event.target.id === "workspace-search") filterRecords(event);
    });
    root().addEventListener("change", (event) => {
      if (event.target.id === "workspace-filter") filterRecords(event);
    });
    dialog().addEventListener("change", (event) => {
      if (event.target.name === "clientId")
        dialog().querySelector("[name=conversationId]")?.remove();
    });
    dialog().addEventListener("submit", async (event) => {
      if (event.target.id !== "record-form") return;
      event.preventDefault();
      const form = event.target;
      const button = form.querySelector('[type="submit"]');
      if (button.disabled) return;
      const values = Object.fromEntries(new FormData(form));
      const error = form.querySelector(".form-error");
      error.textContent = "";
      if (formKind === "client" && !editingId && !values.email.trim() && !values.phone.trim()) {
        error.textContent = "Add an email address or phone number.";
        return;
      }
      if (formKind === "task") {
        const due = new Date(values.dueAt);
        if (!Number.isFinite(due.getTime())) {
          error.textContent = "Choose a valid due date.";
          return;
        }
        values.dueAt = due.toISOString();
      }
      button.disabled = true;
      try {
        await api(
          formKind === "client" ? `/clients${editingId ? "/" + editingId : ""}` : "/tasks",
          editingId ? "PUT" : "POST",
          values,
        );
        dialog().close();
        toast(formKind === "client" ? "Client saved." : "Task scheduled.");
        try {
          await load();
        } catch (e) {
          toast("Saved, but the view could not refresh. Use Refresh to reload.");
        }
      } catch (e) {
        error.textContent = e.message;
      } finally {
        button.disabled = false;
      }
    });
  });
  window.cramDashboard = {
    setSession(result) {
      token = result.token;
      sessionStorage.setItem("cram.token", token);
      page = "Overview";
      query = "";
      filter = "";
    },
    hasSession: () => Boolean(token),
    open,
  };
})();
