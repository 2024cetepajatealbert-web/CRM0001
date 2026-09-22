const PublicError = require('../utils/publicError');

module.exports = (error, request, response, next) => {
  if (response.headersSent) return next(error);
  if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ message: 'That email or contact already exists. Use a different value.' });
  if (error.code === 'ER_ROW_IS_REFERENCED_2') return response.status(409).json({ message: 'This record is still referenced. Remove or reassign its dependent records first.' });
  const status = error.status || 500;
  if (status >= 500) console.error('Request failed:', error.code || error.name);
  return response.status(status).json({ message: status >= 500 && !(error instanceof PublicError) ? "The server could not complete that request." : error.message });
};
