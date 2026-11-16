import { requireAuth } from '../guards/authGuard.js';
import { storage } from '../utils/storage.js';
import { bookingsApi } from '../api/bookings.api.js';
import { toInputDateTime, addHours } from '../utils/date.js';
import { initTheme } from '../utils/theme.js';
import { setupUserMenu } from '../utils/userMenu.js';
import { showError } from '../utils/alerts.js';

if (requireAuth()) {
  initTheme();
  setupUserMenu();
  const user = storage.getUser();
  let allChargers = [];

  // Logout en topbar
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      storage.clear();
      window.location.href = 'login.html';
    });
  }

  // Elementos del Modal de Reserva
  const modal = document.getElementById('booking-modal');
  const modalName = document.getElementById('modal-station-name');
  const modalChargerId = document.getElementById('modal-charger-id');
  const modalStart = document.getElementById('modal-input-start');
  const modalEnd = document.getElementById('modal-input-end');
  const modalError = document.getElementById('modal-error-alert');
  const modalRoleHint = document.getElementById('modal-role-hint');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const modalForm = document.getElementById('booking-modal-form');
  const homeAlert = document.getElementById('home-alert');

  const maxHours = user.role === 'alumno' ? 2 : user.role === 'profesor' ? 4 : 8;
  if (modalRoleHint) {
    modalRoleHint.innerHTML = `<strong>Permiso: ${user.role.toUpperCase()}</strong>. Tiempo máximo continuo permitido: <strong>${maxHours} horas</strong> por reserva.`;
  }

  function openBookingModal(charger) {
    modalChargerId.value = charger.id;
    modalName.textContent = `${charger.name} (${charger.power_kw} kW)`;
    if (modalError) {
      modalError.classList.remove('visible');
      modalError.textContent = '';
    }

    const now = new Date(Date.now() + 5 * 60 * 1000);
    modalStart.value = toInputDateTime(now);
    modalEnd.value = toInputDateTime(addHours(now, 1));

    modal.style.display = 'flex';
  }

  function closeBookingModal() {
    modal.style.display = 'none';
  }

  if (btnCloseModal) btnCloseModal.addEventListener('click', closeBookingModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeBookingModal);

  // Paleta de tonos visuales idénticos a Voltio
  const tones = ['tone-lime', 'tone-blue', 'tone-sand'];

  function getInitials(name) {
    if (!name) return 'EV';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  function renderChargers(chargers) {
    const container = document.getElementById('chargers-container');
    const badge = document.getElementById('chargers-count-badge');
    const freeSpotsEl = document.getElementById('hero-free-spots');
    const mapTotalEl = document.getElementById('map-total-count');

    const availableCount = allChargers.filter(c => c.status === 'available').length;
    if (freeSpotsEl) {
      freeSpotsEl.textContent = `${availableCount} puntos libres cerca de ti`;
    }
    if (mapTotalEl) {
      mapTotalEl.textContent = allChargers.length;
    }
    if (badge) {
      badge.textContent = `${chargers.length} puntos`;
    }

    if (!container) return;

    if (chargers.length === 0) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--muted); grid-column: 1/-1;">
          No se encontraron puntos de carga con los filtros seleccionados.
        </div>
      `;
      return;
    }

    container.innerHTML = chargers.map((c, idx) => {
      const tone = tones[idx % tones.length];
      const letter = getInitials(c.name);

      let statusClass = 'available';
      let statusText = 'Disponible';
      let canReserve = true;

      if (c.status === 'occupied') {
        statusClass = 'occupied';
        statusText = 'En Carga';
        canReserve = false;
      } else if (c.status === 'reserved') {
        statusClass = 'reserved';
        statusText = 'Reservado';
        canReserve = true;
      } else if (c.status !== 'available') {
        statusClass = 'unavailable';
        statusText = 'No operativo';
        canReserve = false;
      }

      return `
        <article class="station-card">
          <div class="station-visual ${tone}">
            <span>${letter}</span>
            <div class="charger-badge">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m13.5 2-8 12h6l-1 8 8-12h-6l1-8Z"/>
              </svg>
            </div>
          </div>
          <div class="station-info">
            <div class="station-title">
              <div>
                <h3>${c.name}</h3>
                <p>${c.location_description || 'Campus Principal · Instituto'}</p>
              </div>
              <span class="distance">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>
                </svg>
                ${c.power_kw} kW
              </span>
            </div>
            <div class="station-meta">
              <span class="status-badge-inline ${statusClass}">
                <i></i> ${statusText}
              </span>
              <span>0,00 €/kWh</span>
            </div>
            <button class="text-button btn-book-trigger" data-id="${c.id}" ${!canReserve ? 'disabled style="opacity: 0.45; cursor: not-allowed;"' : ''}>
              ${user.role === 'alumno' ? 'Asignación automática' : (canReserve ? 'Reservar plaza' : 'No disponible')}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M14 7l5 5-5 5"/>
              </svg>
            </button>
          </div>
        </article>
      `;
    }).join('');

    container.querySelectorAll('.btn-book-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        if (user.role === 'alumno') {
          showError(
            'Las reservas para alumnos son asignadas automáticamente por la aplicación mediante el algoritmo de reparto inteligente según tu consumo. Puedes revisar tu plaza en "Mis Reservas" y cancelarla si no te viene bien el horario.',
            'Asignación inteligente'
          );
          return;
        }

        const id = parseInt(btn.getAttribute('data-id'), 10);
        const target = allChargers.find(x => x.id === id);
        if (target) openBookingModal(target);
      });
    });
  }

  async function fetchChargers() {
    try {
      const res = await bookingsApi.getAllChargers();
      allChargers = res.data || [];
      renderChargers(allChargers);
    } catch (err) {
      showError(err.message, 'Error al cargar estaciones');
      const container = document.getElementById('chargers-container');
      if (container) {
        container.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--danger); grid-column: 1/-1;">Error al cargar estaciones: ${err.message}</div>`;
      }
    }
  }

  // Buscador
  const searchInput = document.getElementById('search-charger-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value.toLowerCase().trim();
      const filtered = allChargers.filter(c =>
        c.name.toLowerCase().includes(val) ||
        (c.location_description && c.location_description.toLowerCase().includes(val)) ||
        String(c.power_kw).includes(val)
      );
      renderChargers(filtered);
    });
  }

  // Botones de filtro
  const btnAll = document.getElementById('filter-all');
  const btnAvail = document.getElementById('filter-available');
  if (btnAll && btnAvail) {
    btnAll.addEventListener('click', () => {
      btnAll.classList.add('active');
      btnAvail.classList.remove('active');
      renderChargers(allChargers);
    });
    btnAvail.addEventListener('click', () => {
      btnAvail.classList.add('active');
      btnAll.classList.remove('active');
      renderChargers(allChargers.filter(c => c.status === 'available'));
    });
  }

  // Formulario Modal
  if (modalForm) {
    modalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btn-confirm-booking');
      if (modalError) modalError.classList.remove('visible');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Procesando...';

      try {
        const charger_id = parseInt(modalChargerId.value, 10);
        const start_time = new Date(modalStart.value).toISOString();
        const end_time = new Date(modalEnd.value).toISOString();

        await bookingsApi.createBooking({
          charger_id,
          start_time,
          end_time
        });

        closeBookingModal();
        if (homeAlert) {
          homeAlert.className = 'alert-clean alert-success visible';
          homeAlert.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
            <span>¡Reserva completada con éxito! Puedes consultar tu ticket y código en <a href="reservas.html" style="text-decoration: underline; font-weight: 700;">Reservas</a>.</span>
          `;
          setTimeout(() => homeAlert.classList.remove('visible'), 6000);
        }

        await fetchChargers();

      } catch (err) {
        showError(err.message, 'No se pudo completar la reserva');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Confirmar reserva <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M14 7l5 5-5 5"/></svg>`;
      }
    });
  }

  fetchChargers();
}
