import { storage } from '../utils/storage.js';
import { showError } from '../utils/alerts.js';

/**
 * Guarda de navegación para páginas privadas:
 * Redirige a login si no está autenticado.
 * Si requiere admin y no lo es, redirige al inicio.
 */
export function requireAuth(options = { requireAdmin: false }) {
  if (!storage.isAuthenticated()) {
    window.location.href = 'login.html';
    return false;
  }

  if (options.requireAdmin && !storage.isAdmin()) {
    showError(
      'Sólo administradores pueden acceder a este panel.',
      'Acceso restringido'
    ).then(() => {
      window.location.href = 'index.html';
    });
    return false;
  }

  return storage.getUser() || true;
}

/**
 * Guarda para páginas de invitado (login/registro):
 * Si ya tiene sesión activa, redirige a la página principal.
 */
export function requireGuest() {
  if (storage.isAuthenticated()) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

