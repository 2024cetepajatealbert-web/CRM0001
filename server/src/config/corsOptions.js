// Allow only explicitly configured origins and local development previews.
// Production must set CLIENT_ORIGIN to the deployed frontend's exact origin.
module.exports = function corsOptions(env = process.env) {
  const allowed = new Set((env.CLIENT_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean));
  if (env.NODE_ENV !== 'production') {
    allowed.add('http://127.0.0.1:5500');
    allowed.add('http://localhost:5500');
  }
  const port = Number(env.PORT || 4000);
  allowed.add(`http://localhost:${port}`);
  allowed.add(`http://127.0.0.1:${port}`);
  return {
    credentials: true,
    origin(origin, callback) {
      callback(null, !origin || allowed.has(origin));
    },
  };
};
