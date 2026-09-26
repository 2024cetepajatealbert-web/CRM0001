const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const database = require("../config/database");
const {
  requireSignupEmail,
  requireNewPassword,
  requireName,
  requireString,
} = require("../utils/validation");

const publicUser = (user) => ({
  id: user.user_id,
  firstName: user.first_name,
  lastName: user.last_name,
  email: user.email,
  role: user.role,
});
const issueToken = (user) =>
  jwt.sign(
    { sub: user.user_id, email: user.email, role: user.role, version: user.auth_version || 0 },
    process.env.JWT_SECRET,
    { expiresIn: "8h" },
  );

async function signup(request, response) {
  const firstName = requireName(request.body.firstName, "first name");
  const middleName = requireName(request.body.middleName, "middle name", true);
  const lastName = requireName(request.body.lastName, "last name");
  const email = requireSignupEmail(request.body.email);
  const password = requireNewPassword(request.body.password);
  const existing = await database.query("SELECT user_id FROM user WHERE email = ? LIMIT 1", [
    email,
  ]);
  if (existing.length)
    return response
      .status(409)
      .json({ message: "An account already uses this email. Please log in." });
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await database.transaction(async (connection) => {
    let teamId, workspaceId, invitation;
    if (request.body.invitationToken) {
      const hash = require("crypto")
        .createHash("sha256")
        .update(String(request.body.invitationToken))
        .digest("hex");
      const [invites] = await connection.execute(
        "SELECT * FROM team_invitations WHERE token_hash=? AND email=? AND accepted_at IS NULL AND expires_at>NOW() FOR UPDATE",
        [hash, email],
      );
      invitation = invites[0];
      if (!invitation) {
        const error = new Error(
          "This invitation is invalid, expired, or belongs to another email.",
        );
        error.status = 400;
        throw error;
      }
      teamId = invitation.team_id;
      workspaceId = invitation.workspace_id;
    } else {
      const [teamResult] = await connection.execute(
        "INSERT INTO teams (name, created_at) VALUES (?, NOW())",
        [`${firstName}'s Team`.slice(0, 50)],
      );
      teamId = workspaceId = teamResult.insertId;
      await connection.execute("UPDATE teams SET workspace_id=? WHERE teams_id=?", [
        workspaceId,
        teamId,
      ]);
    }
    const [userResult] = await connection.execute(
      "INSERT INTO user (first_name, middle_name, last_name, email, password_hash, created_at, teams_teams_id, workspace_id, role) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, 'TM')",
      [firstName, middleName, lastName, email, passwordHash, teamId, workspaceId],
    );
    await connection.execute(
      "INSERT INTO workspace_members (workspace_id,user_id,role) VALUES (?,?,?)",
      [workspaceId, userResult.insertId, invitation ? "AGENT" : "OWNER"],
    );
    await connection.execute("INSERT INTO team_members (team_id,user_id) VALUES (?,?)", [
      teamId,
      userResult.insertId,
    ]);
    if (invitation)
      await connection.execute("UPDATE team_invitations SET accepted_at=NOW() WHERE id=?", [
        invitation.id,
      ]);
    const [rows] = await connection.execute("SELECT * FROM user WHERE user_id = ?", [
      userResult.insertId,
    ]);
    return rows[0];
  });
  return response.status(201).json({ token: issueToken(user), user: publicUser(user) });
}

async function login(request, response) {
  const email = requireSignupEmail(request.body.email);
  const password = requireString(request.body.password, "password", { min: 8, max: 128 });
  const users = await database.query("SELECT * FROM user WHERE email = ? LIMIT 1", [email]);
  const user = users[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return response.status(401).json({ message: "Invalid email or password." });
  return response.json({ token: issueToken(user), user: publicUser(user) });
}

module.exports = { signup, login };
