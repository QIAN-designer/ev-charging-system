import { storage } from '../utils/storage.js';

/**
 * Monta el dropdown/popover en el botón de usuario de la barra lateral izquierda.
 * Al hacer click en user-mini, despliega opciones: "Mi perfil" y "Cerrar sesión".
 */
export function setupUserMenu() {
  const user = storage.getUser();
  if (!user) return;

  // Actualizar textos si existen
  const initialsEl = document.getElementById('user-avatar-initials');
  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-display-role');

  if (initialsEl && nameEl && roleEl) {
    const initials = user.name
      ? user.name.split(' ').map(n => n[0]).filter(Boolean).join('').substring(0, 2).toUpperCase()
      : 'U';
    initialsEl.textContent = initials || 'U';
    nameEl.textContent = user.name || 'Usuario';
    roleEl.textContent = `Rol: ${user.role || 'usuario'}`;
  }

  const adminLink = document.getElementById('nav-admin-link');
  if (adminLink && user.role === 'admin') {
    adminLink.style.display = 'flex';
  }

  // Comprobar si ya existe el contenedor popover, si no, crearlo
  let popover = document.getElementById('user-menu-popover');
  if (!popover) {
    popover = document.createElement('div');
    popover.id = 'user-menu-popover';
    popover.className = 'user-menu-popover';
    popover.innerHTML = `
      <div class="popover-header">
        <strong>${user.name || 'Usuario'}</strong>
        <small>${user.email || ''}</small>
      </div>
      <a href="profile.html">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <span>Mi perfil</span>
      </a>
      <button type="button" class="logout-item" id="popover-logout-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span>Cerrar sesión</span>
      </button>
    `;
    document.body.appendChild(popover);

    // Evento logout dentro del popover
    const popoverLogout = document.getElementById('popover-logout-btn');
    if (popoverLogout) {
      popoverLogout.addEventListener('click', () => {
        storage.clear();
        window.location.href = 'login.html';
      });
    }
  }

  // Trigger del user-mini
  const userTrigger = document.querySelector('.user-mini');
  if (userTrigger) {
    userTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.classList.toggle('show');
    });
  }

  // Cerrar el popover al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (popover && popover.classList.contains('show')) {
      if (!popover.contains(e.target) && (!userTrigger || !userTrigger.contains(e.target))) {
        popover.classList.remove('show');
      }
    }
  });
}

