// Thin fetch wrapper. All state-changing requests send the X-Requested-With header
// (the server rejects requests without it) and rely on the HttpOnly session cookie.
const TIMEOUT_MS = 15000;
const TOKEN_KEY = 'ashen-vow-token';
// Fallback session storage (used when the browser blocks the session cookie in the preview iframe).
function readToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
function writeToken(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ } }
function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } }

async function request(method, url, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const token = readToken();
    const headers = method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Requested-With': 'ashen-vow' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const fresh = res.headers.get('X-Session-Token');
    if (fresh) writeToken(fresh);
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
  logout: async () => { try { return await request('POST', '/api/logout', {}); } finally { clearToken(); } },
};
