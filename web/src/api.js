// Cliente de la API (spec §7, §7.3). El token vive en localStorage (D-11);
// ante cualquier 401 de una petición con sesión, se cierra la sesión y se va a /login.
const TOKEN_KEY = 'reservas.token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor.');
  }

  const data = await res.json().catch(() => null);
  if (res.status === 401 && token) {
    clearToken();
    window.location.assign('/login');
  }
  if (!res.ok) {
    const error = data?.error || {};
    throw new ApiError(res.status, error.code || 'INTERNAL_ERROR', error.message || 'Error interno del servidor.');
  }
  return data;
}
