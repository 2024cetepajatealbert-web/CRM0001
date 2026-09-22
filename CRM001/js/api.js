/* One API destination for authentication and every dashboard operation. */
(() => {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const base = local && location.protocol === 'http:' && location.port === '5500'
    ? `http://${location.hostname}:4000`
    : '';

  async function request(path, options = {}) {
    if (location.protocol === 'file:') {
      throw new Error('Open CRAM at http://localhost:4000, not directly as an HTML file.');
    }
    let response;
    try {
      response = await fetch(base + path, options);
    } catch {
      throw new Error('Cannot reach the CRAM backend. Start it with npm run dev in the server folder, then open http://localhost:4000 or refresh Live Server.');
    }
    let result;
    try {
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error();
      result = await response.json();
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    } catch {
      throw new Error('CRAM received an unexpected server response. Make sure the backend is running and open http://localhost:4000.');
    }
    return { response, result };
  }

  window.cramApi = { request };
})();
