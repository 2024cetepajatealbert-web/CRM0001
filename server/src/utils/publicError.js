// Only pass application-authored text here, never provider responses or secrets.
class PublicError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'PublicError';
    this.status = status;
  }
}

module.exports = PublicError;
