export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('nutriai_session');
}

export function setToken(token: string) {
  localStorage.setItem('nutriai_session', token);
}

export function clearToken() {
  localStorage.removeItem('nutriai_session');
}

export async function apiFetch(url: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { ...options, headers });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Request failed');
  return json.data;
}
