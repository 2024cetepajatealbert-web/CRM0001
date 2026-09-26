/* Record-management dialogs reuse the existing dashboard and authenticated API. */
(() => {
  let data, h, operation;
  const esc = (value) => h.esc(value);
  const field = (label, name, value = "", type = "text", max = 80, required = true) =>
    `<label>${label}<input name="${name}" type="${type}" maxlength="${max}" value="${esc(value)}" ${required ? "required" : ""} ${type === "password" ? 'autocomplete="off"' : ""}></label>`;
  const control = (label, action, id, extra = "") =>
    `<button type="button" class="text-button record-control ${action.startsWith("delete-") ? "danger-text" : ""}" data-record="${action}" data-id="${id}" ${extra}>${label}</button>`;
  function show(title, description, fields, action, label = "Save changes") {
    operation = action;
    h.dialog().innerHTML = `<div class="dialog-heading"><h2 id="record-title">${esc(title)}</h2><button class="dialog-close" type="button" data-action="close-dialog" aria-label="Close dialog">×</button></div><p class="panel-description">${esc(description)}</p><form id="manage-record-form">${fields}<p class="form-error" role="alert"></p><footer><button class="quiet-button" type="button" data-action="close-dialog">Cancel</button><button class="btn-primary ${label === "Delete permanently" ? "danger-button" : ""}" type="submit">${label}</button></footer></form>`;
    if (!h.dialog().open) h.dialog().showModal();
  }
  function deletion(title, description, path) {
    show(
      title,
      description + " This cannot be undone in CRAM. Type DELETE to confirm.",
      field("Confirmation", "confirm", "", "text", 6),
      async (values) => {
        if (values.confirm !== "DELETE") throw new Error("Type DELETE exactly to confirm.");
        await h.api(path, "DELETE", { confirm: "DELETE" });
        window.cramCollab?.invalidateMessages();
      },
      "Delete permanently",
    );
  }
  function names(person) {
    return `<div class="form-grid">${field("First name", "firstName", person.firstName)}${field("Middle name (optional)", "middleName", person.middleName, "text", 80, false)}${field("Last name", "lastName", person.lastName)}</div>`;
  }
  async function handle(button) {
    const action = button.dataset.record,
      id = Number(button.dataset.id),
      conv = Number(button.dataset.conversation);
    const client = data.clients.find((c) => c.id === id);
    const task = data.tasks.find((t) => t.id === id);
    const member = data.collaboration.members.find((m) => m.id === id);
    const team = data.collaboration.teams.find((t) => t.id === id);
    if (action === "delete-client" && client)
      deletion(
        `Delete ${client.name}?`,
        "Deletes this client, contact points, qualification details, tasks, conversations, and local messages. Facebook history is unchanged. A future Messenger event can create a new record.",
        `/clients/${id}`,
      );
    if (action === "delete-task" && task)
      deletion(
        "Delete task?",
        `Remove “${task.title || task.type}”. The client and conversation are kept.`,
        `/tasks/${id}`,
      );
    if (action === "edit-task" && task) {
      const due = new Date(task.dueAt);
      const local = new Date(due.getTime() - due.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      show(
        "Edit task",
        `For ${task.clientName}. Completion status is controlled by the task check button.`,
        `${field("Task title", "title", task.title || task.type, "text", 160)}<div class="form-grid"><label>Type<select name="type">${data.types.map((type) => `<option ${type === task.type ? "selected" : ""}>${esc(type)}</option>`).join("")}</select></label>${field("Due date & time", "dueAt", local, "datetime-local", 30)}</div><label>Notes<textarea name="notes" maxlength="5000" rows="3">${esc(task.notes)}</textarea></label>`,
        (values) =>
          h.api(`/tasks/${id}`, "PUT", { ...values, dueAt: new Date(values.dueAt).toISOString() }),
      );
    }
    if (action === "edit-team" && team)
      show(
        "Rename team",
        "Memberships and assigned records stay intact.",
        field("Team name", "name", team.name, "text", 50),
        (values) => h.api(`/teams/${id}`, "PUT", values),
      );
    if (action === "delete-team" && team)
      deletion(
        `Delete ${team.name}?`,
        "Members and pending invitations move to the root workspace. Accounts, clients, messages, and tasks are kept.",
        `/teams/${id}`,
      );
    if (action === "edit-user" && member)
      show(
        "Edit team member",
        "Only the owner can change agent names and workspace permissions. Members change their own email and password through My profile.",
        names(member) +
          `<label>Workspace role<select name="role"><option value="AGENT" ${member.role === "AGENT" ? "selected" : ""}>Sales agent</option><option value="MANAGER" ${member.role === "MANAGER" ? "selected" : ""}>Manager</option></select></label>`,
        (values) => h.api(`/users/${id}`, "PUT", values),
      );
    if (action === "delete-user" && member)
      deletion(
        `Delete ${member.name}'s account?`,
        "Revokes sign-in and removes the account. Clients, conversations, tasks, and Page responsibility transfer to you. Existing message history is kept but loses this agent attribution.",
        `/users/${id}`,
      );
    if (action === "profile") {
      const profile = await h.api("/profile");
      show(
        "My profile",
        "Changes are saved in the user table. Confirm your current password. Changing your password signs out all your sessions.",
        names(profile) +
          field("Email", "email", profile.email, "email", 80) +
          field("Current password", "currentPassword", "", "password", 128) +
          field("New password (leave blank to keep)", "newPassword", "", "password", 128, false) +
          field("Confirm new password", "confirmPassword", "", "password", 128, false),
        (values) => h.api("/profile", "PUT", values),
      );
    }
    if (action === "edit-contact" || action === "delete-contact") {
      const point = data.collaboration.contacts.find(
        (p) => p.id === id && p.clientId === Number(button.dataset.client),
      );
      if (!point) return;
      if (action === "delete-contact")
        return deletion(
          "Delete contact point?",
          `Removes this ${point.type} contact from CRAM. It does not delete the client or disconnect an existing Messenger conversation.`,
          `/clients/${point.clientId}/contacts/${id}`,
        );
      show(
        "Edit contact point",
        "Contact details are stored in contact_point. Messenger routing belongs to the original conversation and is not changed here.",
        `<label>Type<select name="type">${["Messenger", "TikTok", "WhatsApp", "SMS", "Email", "Phone"].map((type) => `<option ${type === point.type ? "selected" : ""}>${type}</option>`).join("")}</select></label>${field("Address, number, or account ID", "value", point.value, "text", 254)}`,
        (values) => h.api(`/clients/${point.clientId}/contacts/${id}`, "PUT", values),
      );
    }
    if (action === "delete-conversation")
      deletion(
        "Delete local conversation?",
        "Removes this conversation and all its local messages. Client and scheduled tasks are kept. Facebook is unchanged; a future webhook can recreate the conversation.",
        `/conversations/${id}`,
      );
    if (action === "delete-message")
      deletion(
        "Delete local message?",
        "Removes only this record from the message table—not the message on Facebook. Totals and local conversation metadata are recalculated. A provider retry can restore a deleted record.",
        `/conversations/${conv}/messages/${id}`,
      );
    if (action === "draft-new" || action === "draft-edit") {
      const message = action === "draft-edit" ? window.cramCollab.getMessage(id) : null;
      show(
        action === "draft-new" ? "Save a reply draft" : "Edit saved draft",
        "Stored in MySQL as Draft. Nothing is sent to the client. Copy the finished draft to the reply box when ready.",
        `<label>Draft<textarea name="text" maxlength="2000" rows="5" required>${esc(message?.text || "")}</textarea></label>`,
        async (values) => {
          await h.api(
            action === "draft-new"
              ? `/conversations/${conv}/drafts`
              : `/conversations/${conv}/messages/${id}`,
            action === "draft-new" ? "POST" : "PUT",
            values,
          );
          window.cramCollab.invalidateMessages();
        },
      );
    }
    if (action === "draft-copy") {
      const message = window.cramCollab.getMessage(id),
        input = document.querySelector("#reply-text");
      if (message && input) {
        input.value = message.text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
        h.toast("Copied to reply. The saved draft is kept until you delete it.");
      }
    }
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-record]");
    if (!button || !h) return;
    event.preventDefault();
    const helpers = h;
    handle(button).catch((error) => helpers.toast(error.message));
  });
  document.addEventListener("submit", async (event) => {
    if (event.target.id !== "manage-record-form") return;
    event.preventDefault();
    const form = event.target,
      submit = form.querySelector("[type=submit]");
    if (submit.disabled) return;
    submit.disabled = true;
    const error = form.querySelector(".form-error");
    error.textContent = "";
    try {
      const result = await operation(Object.fromEntries(new FormData(form)));
      h.dialog().close();
      if (result?.reauthenticate) {
        const helpers = h;
        helpers.logout();
        helpers.toast("Password changed. Log in with your new password.");
        return;
      }
      h.toast("Changes saved to MySQL.");
      try {
        await h.load();
      } catch {
        h.toast("Saved. Refresh the workspace to reload the latest records.");
      }
    } catch (err) {
      error.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });
  window.cramRecords = {
    bind(workspace, helpers) {
      data = workspace;
      h = helpers;
    },
    reset() {
      data = null;
      h = null;
      operation = null;
    },
    control,
    memberActions(member) {
      return data.user.workspaceRole === "OWNER" && member.role !== "OWNER"
        ? `<div class="record-actions">${control("Edit member", "edit-user", member.id)}${control("Delete account", "delete-user", member.id)}</div>`
        : "";
    },
    teamActions(team) {
      return data.collaboration.canManage
        ? `<div class="record-actions">${control("Rename", "edit-team", team.id)}${team.parentId ? control("Delete subteam", "delete-team", team.id) : ""}</div>`
        : "";
    },
    messageActions(message, conversationId) {
      const ownDraft =
        message.status === "Draft" &&
        (message.senderId === data.user.id || data.collaboration.canManage);
      const extra = `data-conversation="${conversationId}"`;
      return `<div class="record-actions">${ownDraft ? control("Edit draft", "draft-edit", message.id, extra) + control("Copy to reply", "draft-copy", message.id, extra) : ""}${message.status !== "Sending" && (ownDraft || data.collaboration.canManage) ? control("Delete locally", "delete-message", message.id, extra) : ""}</div>`;
    },
  };
})();
