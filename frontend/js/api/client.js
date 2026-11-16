/**
 * Configuración base y cliente HTTP fetch centralizado
 */
const API_BASE_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? 'http://localhost:3000/api'
  : '/api';

/**
 * Realiza peticiones fetch con inclusión automática de token JWT
 * y parseo de respuestas de error.
 */
export async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        // Token caducado o inválido
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (!window.location.pathname.endsWith('login.html')) {
          window.location.href = 'login.html';
        }
      }
      const errorMsg = data.message || `Error en la petición HTTP (${response.status})`;
      throw new Error(errorMsg);
    }

    return data;
  } catch (error) {
    console.error(`[API Error] ${endpoint}:`, error.message);
    throw error;
  }
}

