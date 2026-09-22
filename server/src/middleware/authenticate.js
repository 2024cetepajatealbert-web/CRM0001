const jwt = require('jsonwebtoken');
const database = require('../config/database');

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return res.status(401).json({ message: 'Please log in to continue.' });
  let claims;
  try { claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }); }
  catch { return res.status(401).json({ message: 'Your session expired. Please log in again.' }); }
  try {
    const rows = await database.query('SELECT u.user_id,u.first_name,u.last_name,u.email,u.role,u.workspace_id,u.auth_version,wm.role AS workspace_role FROM user u JOIN workspace_members wm ON wm.user_id=u.user_id AND wm.workspace_id=u.workspace_id WHERE u.user_id = ?', [claims.sub]);
    if (!rows.length || (claims.version || 0) !== rows[0].auth_version) return res.status(401).json({ message: 'Please log in again.' });
    req.user = rows[0];
    next();
  } catch (error) { next(error); }
};
