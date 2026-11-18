import { requireAuth } from '../guards/authGuard.js';
import { storage } from '../utils/storage.js';
import { bookingsApi } from '../api/bookings.api.js';
import { initTheme } from '../utils/theme.js';
import { setupUserMenu } from '../utils/userMenu.js';
import { showError, showConfirm, showSuccess } from '../utils/alerts.js';

if (requireAuth()) {
  initTheme();
  setupUserMenu();
  const user = storage.getUser() || {};
  let allChargers = [];

  // Saludo personalizado
  const greetingEl = document.getElementById('hero-user-name');
  if (greetingEl) {
    const firstName = (user.name || 'Alumno').split(' ')[0];
    greetingEl.textContent = firstName;
  }

  // Logout en topbar
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      storage.clear();
      window.location.href = 'login.html';
    });
  }

  // Paleta de tonos visuales para los cargadores
  const tones = ['tone-lime', 'tone-blue', 'tone-sand'];

  function getInitials(name) {
    if (!name) return 'EV';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  // Formatear fecha y hora legible
  function formatSlotDateTime(isoStart, isoEnd) {
    const s = new Date(isoStart);
    const e = new Date(isoEnd);

    const pad = (n) => String(n).padStart(2, '0');
    const startHour = `${pad(s.getHours())}:${pad(s.getMinutes())}`;
    const endHour = `${pad(e.getHours())}:${pad(e.getMinutes())}`;

    const options = { weekday: 'short', day: 'numeric', month: 'short' };
    const dateFormatted = s.toLocaleDateString('es-ES', options);

    return {
      dateFormatted,
      startHour,
      endHour,
      isToday: s.toDateString() === new Date().toDateString()
    };
  }

  // 1. Cargar y mostrar el próximo turno personal del alumno
  async function loadUserUpcomingSlot() {
    const heroBox = document.getElementById('hero-next-slot-box');
    const slotBody = document.getElementById('hero-slot-body');
    const statHours = document.getElementById('stat-user-hours');
    const statBookingsCount = document.getElementById('stat-user-bookings-count');
    const statPlate = document.getElementById('stat-user-plate');
    const statModel = document.getElementById('stat-user-model');

    if (statPlate) {
      statPlate.textContent = user.vehicle_plate || 'Sin matrícula';
    }
    if (statModel) {
      const brandModel = [user.vehicle_brand, user.vehicle_model].filter(Boolean).join(' ');
      statModel.textContent = brandModel || (user.vehicle_plate ? 'Vehículo activo' : 'Registra tu coche en Mi perfil');
    }

    try {
      const res = await bookingsApi.getMyBookings();
      const myBookings = res.data || [];

      // Calcular horas totales completadas/activas
      let totalChargedHours = 0;
      let completedCount = 0;

      const now = new Date();
      // Encontrar la próxima reserva activa futura o en curso
      const futureOrActive = myBookings
        .filter(b => b.status === 'active' && new Date(b.end_time) >= now)
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

      myBookings.forEach(b => {
        if (b.status === 'completed' || b.status === 'active') {
          const diffMs = new Date(b.end_time) - new Date(b.start_time);
          totalChargedHours += diffMs / (1000 * 3600);
          completedCount++;
        }
      });

      if (statHours) statHours.textContent = `${totalChargedHours.toFixed(1)} h`;
      if (statBookingsCount) statBookingsCount.textContent = completedCount;

      if (!slotBody) return;

      if (futureOrActive.length > 0) {
        const next = futureOrActive[0];
        const { dateFormatted, startHour, endHour, isToday } = formatSlotDateTime(next.start_time, next.end_time);

        if (heroBox) heroBox.classList.add('has-booking');

        slotBody.innerHTML = `
          <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px;">
            <strong style="font-size: 16px; color: var(--ink); text-transform: capitalize;">
              ${isToday ? '¡Hoy!' : dateFormatted}
            </strong>
            <span style="font-size: 12px; font-weight: 700; color: var(--green-dark); background: rgba(185, 244, 70, 0.15); padding: 2px 8px; border-radius: 6px;">
              ${startHour} – ${endHour}
            </span>
          </div>
          <div style="font-size: 12px; color: var(--ink); margin-top: 4px;">
            ⚡ <b>${next.charger_name || 'Cargador #' + next.charger_id}</b>
          </div>
          <div style="font-size: 11px; color: var(--muted); line-height: 1.4;">
            ${next.location_description || 'Aparcamiento del campus'}
          </div>
          <div style="margin-top: 8px; display: flex; gap: 8px; align-items: center;">
            <button type="button" class="secondary-button btn-cancel-home-slot" data-id="${next.id}" style="height: 32px; font-size: 11px; padding: 0 12px; color: var(--danger); border-color: rgba(239, 68, 68, 0.25);">
              Anular si no te viene bien
            </button>
          </div>
        `;

        const btnCancel = slotBody.querySelector('.btn-cancel-home-slot');
        if (btnCancel) {
          btnCancel.addEventListener('click', async () => {
            const confirmed = await showConfirm(
              '¿Deseas liberar tu plaza para este turno? La franja quedará libre para que otro compañero pueda cargar.',
              'Liberar plaza de carga',
              'Sí, anular plaza'
            );
            if (!confirmed) return;

            try {
              await bookingsApi.cancelBooking(next.id);
              showSuccess('Tu turno ha sido liberado correctamente.');
              await loadUserUpcomingSlot();
              await fetchChargers();
            } catch (err) {
              showError(err.message, 'No se pudo cancelar el turno');
            }
          });
        }
      } else {
        if (heroBox) heroBox.classList.remove('has-booking');
        slotBody.innerHTML = `
          <strong style="font-size: 15px; color: var(--ink); display: block;">
            Sin turno próximo
          </strong>
          <p style="margin: 4px 0 0; font-size: 12px; color: var(--muted); line-height: 1.4;">
            El sistema de equidad asignará tu siguiente turno en la próxima planificación semanal.
          </p>
          <div style="margin-top: 8px;">
            <a href="horarios.html" style="font-size: 11px; font-weight: 700; color: var(--green-dark); text-decoration: underline;">
              Consultar cuadrante de clases →
            </a>
          </div>
        `;
      }
    } catch (err) {
      console.error('Error cargando próximo turno:', err);
      if (slotBody) {
        slotBody.innerHTML = `
          <span style="font-size: 12px; color: var(--muted);">No se pudo obtener tu información de reservas.</span>
        `;
      }
    }
  }

  // 2. Renderizar puntos de recarga en formato puramente informativo (sin botón de reserva manual)
  function renderChargers(chargers) {
    const container = document.getElementById('chargers-container');
    const badge = document.getElementById('chargers-count-badge');

    if (badge) {
      badge.textContent = `${chargers.length} cargadores`;
    }

    if (!container) return;

    if (chargers.length === 0) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--muted); grid-column: 1/-1;">
          No hay cargadores registrados en el centro.
        </div>
      `;
      return;
    }

    container.innerHTML = chargers.map((c, idx) => {
      const tone = tones[idx % tones.length];
      const letter = getInitials(c.name);

      let statusDotClass = 'idle';
      let statusText = 'Operativo';

      if (c.status === 'occupied') {
        statusDotClass = 'active';
        statusText = 'En servicio lectivo';
      } else if (c.status === 'maintenance' || c.status === 'out_of_service') {
        statusDotClass = 'break';
        statusText = 'En mantenimiento';
      } else {
        statusDotClass = 'active';
        statusText = 'Disponible para turnos';
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
                <h3 style="font-size: 16px;">${c.name}</h3>
                <p>${c.location_description || 'Campus Principal · Instituto'}</p>
              </div>
              <span class="distance" style="font-weight: 700; color: var(--ink);">
                ${c.power_kw} kW
              </span>
            </div>
            <div class="station-meta" style="margin-top: 8px;">
              <span class="status-badge-inline ${c.status === 'available' ? 'available' : 'unavailable'}">
                <i class="charger-status-dot ${statusDotClass}"></i> ${statusText}
              </span>
              <span style="font-size: 11px; color: var(--muted);">Tarde: 15:10–21:00</span>
            </div>
            <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 11px; color: var(--muted);">Turnos automáticos</span>
              <a href="horarios.html" style="font-size: 11px; font-weight: 700; color: var(--green-dark); display: inline-flex; align-items: center; gap: 4px;">
                Ver en cuadrante
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
              </a>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  async function fetchChargers() {
    try {
      const res = await bookingsApi.getAllChargers();
      allChargers = res.data || [];
      renderChargers(allChargers);
    } catch (err) {
      console.error('Error cargando cargadores:', err);
    }
  }

  // Inicialización
  loadUserUpcomingSlot();
  fetchChargers();
}
