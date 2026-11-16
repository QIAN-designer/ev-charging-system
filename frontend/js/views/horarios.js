import { requireAuth } from '../guards/authGuard.js';
import { storage } from '../utils/storage.js';
import { bookingsApi } from '../api/bookings.api.js';
import { initTheme } from '../utils/theme.js';
import { setupUserMenu } from '../utils/userMenu.js';
import { renderWeeklyGrid } from '../utils/weeklyScheduleGrid.js';

let currentWeekStart = null;
let currentUserId = null;

// Helper: Formatear fecha local YYYY-MM-DD
function toIsoDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Obtener el Lunes de la semana actual
function getMonday(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // lunes como día 1
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function updateHeadersWithDates(daysDates) {
  const names = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  daysDates.forEach((d, idx) => {
    const th = document.getElementById(`th-day-${idx + 1}`);
    if (th) {
      const dayNum = String(d.getDate()).padStart(2, '0');
      const monthNum = String(d.getMonth() + 1).padStart(2, '0');
      th.innerHTML = `${names[idx]} <span style="font-size: 11px; font-weight: normal; color: var(--muted); display: block; margin-top: 2px;">${dayNum}/${monthNum}</span>`;
    }
  });
}

function updateWeekLabel(startDateStr, endDateStr) {
  const labelEl = document.getElementById('week-display-label');
  if (!labelEl) return;
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  
  const options = { day: 'numeric', month: 'short' };
  const sStr = start.toLocaleDateString('es-ES', options);
  const eStr = end.toLocaleDateString('es-ES', options);
  const year = end.getFullYear();

  labelEl.textContent = `Semana ${sStr} - ${eStr}, ${year}`;
}

async function loadSchedule(weekStartStr) {
  const tbody = document.getElementById('weekly-schedule-body');
  const alertEl = document.getElementById('schedule-alert');
  if (alertEl) {
    alertEl.style.display = 'none';
  }

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 40px; text-align: center; color: var(--muted);">
          Cargando cuadrante semanal...
        </td>
      </tr>
    `;
  }

  try {
    const res = await bookingsApi.getWeeklySchedule(weekStartStr);
    if (!res || !res.success) {
      throw new Error(res?.message || 'Error al obtener el horario semanal.');
    }

    const { week_start, week_end, bookings } = res.data;
    currentWeekStart = week_start;
    updateWeekLabel(week_start, week_end);

    renderWeeklyGrid(tbody, bookings, week_start, currentUserId, updateHeadersWithDates);
  } catch (err) {
    console.error('Error cargando horario semanal:', err);
    if (alertEl) {
      alertEl.textContent = err.message || 'No se pudo cargar el horario de recarga.';
      alertEl.className = 'alert-clean alert-error';
      alertEl.style.display = 'block';
    }
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 40px; text-align: center; color: var(--danger);">
            Error al cargar los datos del horario.
          </td>
        </tr>
      `;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const user = requireAuth();
  if (!user) return;
  currentUserId = user.id;

  initTheme();
  setupUserMenu(user);

  // Inicializar con la semana en curso (lunes)
  const monday = getMonday();
  currentWeekStart = toIsoDate(monday);

  // Configurar botones de navegación
  const btnPrev = document.getElementById('btn-prev-week');
  const btnNext = document.getElementById('btn-next-week');

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      const cur = new Date(currentWeekStart);
      cur.setDate(cur.getDate() - 7);
      currentWeekStart = toIsoDate(cur);
      loadSchedule(currentWeekStart);
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const cur = new Date(currentWeekStart);
      cur.setDate(cur.getDate() + 7);
      currentWeekStart = toIsoDate(cur);
      loadSchedule(currentWeekStart);
    });
  }

  loadSchedule(currentWeekStart);
});
