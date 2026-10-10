// Thin fetch wrapper. All state-changing requests send the X-Requested-With header
// (the server rejects requests without it) and rely on the HttpOnly session cookie.
const TIMEOUT_MS = 15000;

async function request(method, url, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Requested-With': 'ashen-vow' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON response */ }
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('The server took too long to respond.');
    if (e instanceof TypeError) throw new Error('Could not reach the server. Check your connection.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  session: () => request('GET', '/api/session'),
  createAccount: (username, password) => request('POST', '/api/account', { username, password }),
  login: (username, password) => request('POST', '/api/login', { username, password }),
  save: (progress) => request('PUT', '/api/save', { progress }),
  logout: () => request('POST', '/api/logout', {}),
};
