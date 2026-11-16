import { requireAuth } from '../guards/authGuard.js';
import { storage } from '../utils/storage.js';
import { adminApi } from '../api/admin.api.js';
import { bookingsApi } from '../api/bookings.api.js';
import { formatDateTime } from '../utils/date.js';
import { initTheme } from '../utils/theme.js';
import { setupUserMenu } from '../utils/userMenu.js';
import { showError, showConfirm, showSuccess, promptPasswordReset } from '../utils/alerts.js';
import { renderWeeklyGrid } from '../utils/weeklyScheduleGrid.js';

if (requireAuth({ requireAdmin: true })) {
  initTheme();
  setupUserMenu();
  const user = storage.getUser();

  const nameEl = document.getElementById('user-display-name');
  if (nameEl) nameEl.textContent = user.name;

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      storage.clear();
      window.location.href = 'login.html';
    });
  }

  const adminAlert = document.getElementById('admin-alert');
  function showAlert(msg, type = 'success') {
    if (type === 'danger' || type === 'error') {
      showError(msg, 'Error en administración');
      return;
    }
    if (!adminAlert) return;
    adminAlert.className = 'alert-clean alert-success visible';
    adminAlert.textContent = msg;
    setTimeout(() => adminAlert.classList.remove('visible'), 5000);
  }

  // Pestañas
  const tabs = document.querySelectorAll('.admin-tab-btn');
  const panes = document.querySelectorAll('.admin-tab-pane');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(tab.getAttribute('data-tab'));
      if (targetPane) targetPane.classList.add('active');

      if (tab.getAttribute('data-tab') === 'tab-weekly-schedule') {
        loadAdminWeeklySchedule(adminCurrentWeekStart);
      }
    });
  });

  // Métricas
  async function loadStats() {
    try {
      const res = await adminApi.getStats();
      const s = res.data;
      const elUsers = document.getElementById('stat-users');
      const elChargers = document.getElementById('stat-chargers');
      const elActive = document.getElementById('stat-active-bookings');
      const elTotal = document.getElementById('stat-total-bookings');

      if (elUsers) elUsers.textContent = s.total_users ?? 0;
      if (elChargers) elChargers.textContent = s.total_chargers ?? 0;
      if (elActive) elActive.textContent = s.active_bookings ?? 0;
      if (elTotal) elTotal.textContent = s.total_bookings ?? 0;
    } catch (err) {
      console.error('Error stats:', err);
    }
  }

  // Lista Cargadores (History list minimalista)
  const chargersContainer = document.getElementById('chargers-table-container');
  async function loadChargers() {
    if (!chargersContainer) return;
    try {
      const res = await bookingsApi.getAllChargers();
      const list = res.data || [];

      if (list.length === 0) {
        chargersContainer.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--muted);">No hay cargadores registrados.</div>`;
        return;
      }

      chargersContainer.innerHTML = list.map(c => `
        <article class="history-item">
          <div class="history-logo">#${c.id}</div>
          <div class="history-place">
            <strong>${c.name}</strong>
            <span>${c.location_description || 'Campus Principal'}</span>
          </div>
          <div class="history-meta">
            <strong>${c.power_kw} kW</strong>
          </div>
          <div>
            <span class="history-status" style="color: ${c.status === 'available' ? 'var(--green-dark)' : 'var(--muted)'};">
              ${c.status === 'available' ? 'Disponible' : (c.status === 'reserved' ? 'Reservado' : c.status)}
            </span>
          </div>
          <div style="display: flex; gap: 6px; justify-content: flex-end;">
            <button class="icon-button btn-edit-c" data-id="${c.id}" data-name="${c.name}" data-power="${c.power_kw}" data-status="${c.status}" data-location="${c.location_description || ''}" title="Editar" style="width: 32px; height: 32px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            <button class="icon-button btn-del-c" data-id="${c.id}" title="Eliminar" style="width: 32px; height: 32px; color: var(--danger);">
              &times;
            </button>
          </div>
        </article>
      `).join('');

      chargersContainer.querySelectorAll('.btn-edit-c').forEach(btn => {
        btn.addEventListener('click', () => {
          openChargerModal({
            id: btn.getAttribute('data-id'),
            name: btn.getAttribute('data-name'),
            power_kw: btn.getAttribute('data-power'),
            status: btn.getAttribute('data-status'),
            location_description: btn.getAttribute('data-location')
          });
        });
      });

      chargersContainer.querySelectorAll('.btn-del-c').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const confirmed = await showConfirm(`¿Eliminar cargador #${id}?`, 'Eliminar cargador', 'Sí, eliminar');
          if (!confirmed) return;
          try {
            await adminApi.deleteCharger(id);
            showAlert(`Cargador #${id} eliminado.`);
            loadChargers();
            loadStats();
          } catch (e) {
            showAlert(e.message, 'danger');
          }
        });
      });

    } catch (e) {
      showError(e.message, 'Error al cargar cargadores');
      chargersContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--danger);">${e.message}</div>`;
    }
  }

  // Lista Reservas
  const bookingsContainer = document.getElementById('bookings-table-container');
  const bookingFilterBtns = document.querySelectorAll('.booking-filter-btn');
  let allBookingsList = [];
  let currentBookingFilter = 'all';

  function getBookingStatusMeta(status) {
    if (status === 'active') {
      return { label: 'Reserva activa', color: 'var(--green-dark)' };
    }
    if (status === 'cancelled') {
      return { label: 'Cancelada', color: 'var(--danger)' };
    }
    if (status === 'completed') {
      return { label: 'Finalizada', color: 'var(--muted)' };
    }
    return { label: status, color: 'var(--muted)' };
  }

  function updateBookingFilterCounts() {
    const countAll = document.getElementById('count-bookings-all');
    const countActive = document.getElementById('count-bookings-active');
    const countCompleted = document.getElementById('count-bookings-completed');
    const countCancelled = document.getElementById('count-bookings-cancelled');

    if (countAll) countAll.textContent = allBookingsList.length;
    if (countActive) countActive.textContent = allBookingsList.filter(b => b.status === 'active').length;
    if (countCompleted) countCompleted.textContent = allBookingsList.filter(b => b.status === 'completed').length;
    if (countCancelled) countCancelled.textContent = allBookingsList.filter(b => b.status === 'cancelled').length;
  }

  function renderBookings() {
    if (!bookingsContainer) return;

    const filtered = currentBookingFilter === 'all'
      ? allBookingsList
      : allBookingsList.filter(b => b.status === currentBookingFilter);

    if (filtered.length === 0) {
      const emptyMsg = currentBookingFilter === 'all'
        ? 'No hay reservas en el sistema.'
        : 'No hay reservas con el estado seleccionado.';
      bookingsContainer.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--muted);">${emptyMsg}</div>`;
      return;
    }

    bookingsContainer.innerHTML = filtered.map(b => {
      const statusMeta = getBookingStatusMeta(b.status);
      return `
        <article class="history-item">
          <div class="history-logo">#${b.id}</div>
          <div class="history-place">
            <strong>${b.user_name || 'Usuario'} · <span style="font-weight: 500; color: var(--muted);">${b.charger_name || 'Punto #' + b.charger_id}</span></strong>
            <span>${b.user_email || ''} · Rol: ${b.user_role}</span>
          </div>
          <div class="history-meta">
            <span>${formatDateTime(b.start_time)}</span>
          </div>
          <div>
            <span class="history-status" style="color: ${statusMeta.color};">
              ${statusMeta.label}
            </span>
          </div>
          <div>
            ${b.status === 'active' ? `
              <button type="button" class="icon-button btn-admin-cancel-booking" data-id="${b.id}" title="Anular reserva" style="width: 32px; height: 32px; color: var(--danger); border-color: var(--line);">
                &times;
              </button>
            ` : ''}
          </div>
        </article>
      `;
    }).join('');

    bookingsContainer.querySelectorAll('.btn-admin-cancel-booking').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const confirmed = await confirmAction({
          title: `¿Anular reserva #${id}?`,
          text: 'Esta acción cancelará inmediatamente el turno de carga del usuario.'
        });
        if (!confirmed) return;

        try {
          await adminApi.cancelBooking(id);
          showSuccess(`Reserva #${id} anulada correctamente.`);
          await loadAllBookings();
          await loadStats();
          if (typeof loadAutoDispatchStats === 'function') loadAutoDispatchStats();
        } catch (e) {
          showError(e.message, 'Error al anular reserva');
        }
      });
    });
  }

  bookingFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      bookingFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentBookingFilter = btn.getAttribute('data-status-filter') || 'all';
      renderBookings();
    });
  });

  async function loadAllBookings() {
    if (!bookingsContainer) return;
    try {
      const res = await adminApi.getAllBookings();
      allBookingsList = res.data || [];
      updateBookingFilterCounts();
      renderBookings();
    } catch (e) {
      showError(e.message, 'Error al cargar reservas');
      bookingsContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--danger);">${e.message}</div>`;
    }
  }

  // Lista Usuarios
  const usersContainer = document.getElementById('users-table-container');
  async function loadUsers() {
    if (!usersContainer) return;
    try {
      const res = await adminApi.getAllUsers();
      const list = res.data || [];

      if (list.length === 0) {
        usersContainer.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--muted);">No hay usuarios registrados.</div>`;
        return;
      }

      usersContainer.innerHTML = list.map(u => `
        <article class="history-item">
          <div class="history-logo">${u.name ? u.name.substring(0, 2).toUpperCase() : 'U'}</div>
          <div class="history-place">
            <strong>${u.name} ${u.class_name ? `<span class="status-badge-inline status-available" style="margin-left: 6px; font-size: 10px;">${u.class_name}</span>` : ''}</strong>
            <span>${u.email} · Matrícula: ${u.vehicle_plate || '-'}</span>
          </div>
          <div class="history-meta">
            <span class="eyebrow" style="color: var(--ink);">${u.role}</span>
          </div>
          <div style="grid-column: span 2; display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
            <select class="input-field role-select" data-id="${u.id}" style="width: auto; height: 36px; padding: 0 10px; font-size: 11px;">
              <option value="alumno" ${u.role === 'alumno' ? 'selected' : ''}>Alumno</option>
              <option value="profesor" ${u.role === 'profesor' ? 'selected' : ''}>Profesor</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
            <button type="button" class="secondary-button btn-reset-pwd" data-id="${u.id}" data-name="${u.name}" style="height: 36px; padding: 0 12px; font-size: 11px; color: var(--ink); border-color: var(--line);">
              Resetear contraseña
            </button>
          </div>
        </article>
      `).join('');

      usersContainer.querySelectorAll('.role-select').forEach(sel => {
        sel.addEventListener('change', async () => {
          const id = sel.getAttribute('data-id');
          const newRole = sel.value;
          try {
            await adminApi.updateUserRole(id, newRole);
            showAlert(`Rol actualizado para usuario #${id}.`);
            loadStats();
          } catch (e) {
            showAlert(e.message, 'danger');
            loadUsers();
          }
        });
      });

      usersContainer.querySelectorAll('.btn-reset-pwd').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const userName = btn.getAttribute('data-name') || `Usuario #${id}`;
          const newPassword = await promptPasswordReset(userName);
          if (!newPassword) return;

          try {
            await adminApi.resetUserPassword(id, newPassword);
            showSuccess(`Contraseña de ${userName} restablecida correctamente.`);
          } catch (e) {
            showAlert(e.message, 'danger');
          }
        });
      });

    } catch (e) {
      showError(e.message, 'Error al cargar usuarios');
      usersContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--danger);">${e.message}</div>`;
    }
  }

  // Modal Crear/Editar Cargador
  const chargerModal = document.getElementById('charger-modal');
  const btnOpenModal = document.getElementById('btn-open-create-charger');
  const btnCloseModal = document.getElementById('btn-close-charger-modal');
  const btnCancelModal = document.getElementById('btn-cancel-charger-modal');
  const chargerForm = document.getElementById('charger-form');
  const modalAlert = document.getElementById('charger-modal-alert');

  function openChargerModal(c = null) {
    if (!chargerModal) return;
    if (modalAlert) {
      modalAlert.classList.remove('visible');
      modalAlert.textContent = '';
    }

    if (c) {
      document.getElementById('charger-modal-title').textContent = 'Editar cargador';
      document.getElementById('charger-id').value = c.id;
      document.getElementById('charger-name').value = c.name;
      document.getElementById('charger-power').value = c.power_kw;
      document.getElementById('charger-status').value = c.status;
      document.getElementById('charger-location').value = c.location_description;
    } else {
      document.getElementById('charger-modal-title').textContent = 'Nuevo cargador';
      document.getElementById('charger-id').value = '';
      if (chargerForm) chargerForm.reset();
      document.getElementById('charger-status').value = 'available';
    }

    chargerModal.style.display = 'flex';
  }

  function closeChargerModal() {
    if (chargerModal) chargerModal.style.display = 'none';
  }

  if (btnOpenModal) btnOpenModal.addEventListener('click', () => openChargerModal());
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeChargerModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeChargerModal);

  if (chargerForm) {
    chargerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-charger');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';

      const id = document.getElementById('charger-id').value;
      const name = document.getElementById('charger-name').value.trim();
      const power_kw = parseFloat(document.getElementById('charger-power').value);
      const status = document.getElementById('charger-status').value;
      const location_description = document.getElementById('charger-location').value.trim();

      try {
        if (id) {
          await adminApi.updateCharger(id, { name, power_kw, status, location_description });
          showAlert(`Cargador "${name}" actualizado.`);
        } else {
          await adminApi.createCharger({ name, power_kw, status, location_description });
          showAlert(`Cargador "${name}" creado exitosamente.`);
        }

        closeChargerModal();
        loadChargers();
        loadStats();
      } catch (err) {
        showError(err.message, 'Error al guardar cargador');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar punto';
      }
    });
  }

  loadStats();
  loadChargers();
  loadAllBookings();
  loadUsers();

  // =========================================================================
  // Gestión e Importación de Horarios (XML / JSON) en modo Tabla Desplegable
  // =========================================================================
  const schedulesContainer = document.getElementById('schedules-table-container');
  let allSchedulesList = [];
  const expandedScheduleNames = new Set();

  const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<horario>
  <dia nombre="Lunes">
    <clase inicio="15:10" fin="16:05" modulo="Despliegue De Aplicaciones WEB" cfs="2"/>
    <clase inicio="16:05" fin="17:00" modulo="Desarrollo WEB En Entorno Cliente" cfs="2"/>
    <clase inicio="17:00" fin="17:55" modulo="Desarrollo WEB En Entorno Cliente" cfs="2"/>
    <clase inicio="18:15" fin="19:10" modulo="Desarrollo WEB En Entorno Cliente" cfs="2"/>
    <clase inicio="19:10" fin="20:05" modulo="Desarrollo WEB En Entorno Servidor" cfs="2"/>
    <clase inicio="20:05" fin="21:00" modulo="Desarrollo WEB En Entorno Servidor" cfs="2"/>
  </dia>
  <dia nombre="Martes">
    <clase inicio="15:10" fin="16:05" modulo="Diseño De Interfaces WEB" cfs="2"/>
    <clase inicio="16:05" fin="17:00" modulo="Diseño De Interfaces WEB" cfs="2"/>
    <clase inicio="17:00" fin="17:55" modulo="Módulo Optativo" cfs="2"/>
    <clase inicio="18:15" fin="19:10" modulo="Módulo Optativo" cfs="2" destacado="true"/>
    <clase inicio="19:10" fin="20:05" modulo="Desarrollo WEB En Entorno Servidor" cfs="2"/>
    <clase inicio="20:05" fin="21:00" modulo="Desarrollo WEB En Entorno Servidor" cfs="2"/>
    <clase inicio="21:10" fin="22:00" modulo="Itinerario Personal Para La Empleabilidad II" cfs="2"/>
  </dia>
  <dia nombre="Miércoles">
    <clase inicio="16:05" fin="17:00" modulo="Desarrollo WEB En Entorno Cliente" cfs="2"/>
    <clase inicio="17:00" fin="17:55" modulo="Desarrollo WEB En Entorno Cliente" cfs="2"/>
    <clase inicio="18:15" fin="19:10" modulo="Desarrollo WEB En Entorno Cliente" cfs="2"/>
    <clase inicio="19:10" fin="20:05" modulo="Desarrollo WEB En Entorno Servidor" cfs="2"/>
    <clase inicio="20:05" fin="21:00" modulo="Desarrollo WEB En Entorno Servidor" cfs="2"/>
  </dia>
  <dia nombre="Jueves">
    <clase inicio="15:10" fin="16:05" modulo="Módulo Optativo" cfs="2"/>
    <clase inicio="16:05" fin="17:00" modulo="Sostenibilidad Aplicada Al Sistema Productivo" cfs="2"/>
    <clase inicio="17:00" fin="17:55" modulo="Despliegue De Aplicaciones WEB" cfs="2"/>
    <clase inicio="18:15" fin="19:10" modulo="Despliegue De Aplicaciones WEB" cfs="2"/>
    <clase inicio="19:10" fin="20:05" modulo="Diseño De Interfaces WEB" cfs="2"/>
    <clase inicio="20:05" fin="21:00" modulo="Diseño De Interfaces WEB" cfs="2"/>
    <clase inicio="21:10" fin="22:00" modulo="Tutoría Segundo" cfs="2"/>
  </dia>
  <dia nombre="Viernes">
    <clase inicio="15:10" fin="16:05" modulo="Proyecto Intermodular 2 De Desarrollo De Aplicaciones WEB" cfs="2"/>
    <clase inicio="16:05" fin="17:00" modulo="Proyecto Intermodular 2 De Desarrollo De Aplicaciones WEB" cfs="2"/>
    <clase inicio="17:00" fin="17:55" modulo="Proyecto Intermodular 2 De Desarrollo De Aplicaciones WEB" cfs="2"/>
    <clase inicio="18:15" fin="19:10" modulo="Digitalización Aplicada Al Sistema Productivo GS" cfs="2"/>
    <clase inicio="19:10" fin="20:05" modulo="Itinerario Personal Para La Empleabilidad II" cfs="2"/>
    <clase inicio="20:05" fin="21:00" modulo="Itinerario Personal Para La Empleabilidad II" cfs="2"/>
  </dia>
</horario>`;

  const SAMPLE_JSON = JSON.stringify({
    horario: {
      dia: [
        {
          nombre: "Lunes",
          clase: [
            { inicio: "15:10", fin: "16:05", modulo: "Despliegue De Aplicaciones WEB", cfs: "2" },
            { inicio: "16:05", fin: "17:00", modulo: "Desarrollo WEB En Entorno Cliente", cfs: "2" },
            { inicio: "17:00", fin: "17:55", modulo: "Desarrollo WEB En Entorno Cliente", cfs: "2" },
            { inicio: "18:15", fin: "19:10", modulo: "Desarrollo WEB En Entorno Cliente", cfs: "2" },
            { inicio: "19:10", fin: "20:05", modulo: "Desarrollo WEB En Entorno Servidor", cfs: "2" },
            { inicio: "20:05", fin: "21:00", modulo: "Desarrollo WEB En Entorno Servidor", cfs: "2" }
          ]
        },
        {
          nombre: "Martes",
          clase: [
            { inicio: "15:10", fin: "16:05", modulo: "Diseño De Interfaces WEB", cfs: "2" },
            { inicio: "16:05", fin: "17:00", modulo: "Diseño De Interfaces WEB", cfs: "2" },
            { inicio: "17:00", fin: "17:55", modulo: "Módulo Optativo", cfs: "2" },
            { inicio: "18:15", fin: "19:10", modulo: "Módulo Optativo", cfs: "2", destacado: true },
            { inicio: "19:10", fin: "20:05", modulo: "Desarrollo WEB En Entorno Servidor", cfs: "2" },
            { inicio: "20:05", fin: "21:00", modulo: "Desarrollo WEB En Entorno Servidor", cfs: "2" },
            { inicio: "21:10", fin: "22:00", modulo: "Itinerario Personal Para La Empleabilidad II", cfs: "2" }
          ]
        },
        {
          nombre: "Miércoles",
          clase: [
            { inicio: "16:05", fin: "17:00", modulo: "Desarrollo WEB En Entorno Cliente", cfs: "2" },
            { inicio: "17:00", fin: "17:55", modulo: "Desarrollo WEB En Entorno Cliente", cfs: "2" },
            { inicio: "18:15", fin: "19:10", modulo: "Desarrollo WEB En Entorno Cliente", cfs: "2" },
            { inicio: "19:10", fin: "20:05", modulo: "Desarrollo WEB En Entorno Servidor", cfs: "2" },
            { inicio: "20:05", fin: "21:00", modulo: "Desarrollo WEB En Entorno Servidor", cfs: "2" }
          ]
        },
        {
          nombre: "Jueves",
          clase: [
            { inicio: "15:10", fin: "16:05", modulo: "Módulo Optativo", cfs: "2" },
            { inicio: "16:05", fin: "17:00", modulo: "Sostenibilidad Aplicada Al Sistema Productivo", cfs: "2" },
            { inicio: "17:00", fin: "17:55", modulo: "Despliegue De Aplicaciones WEB", cfs: "2" },
            { inicio: "18:15", fin: "19:10", modulo: "Despliegue De Aplicaciones WEB", cfs: "2" },
            { inicio: "19:10", fin: "20:05", modulo: "Diseño De Interfaces WEB", cfs: "2" },
            { inicio: "20:05", fin: "21:00", modulo: "Diseño De Interfaces WEB", cfs: "2" },
            { inicio: "21:10", fin: "22:00", modulo: "Tutoría Segundo", cfs: "2" }
          ]
        },
        {
          nombre: "Viernes",
          clase: [
            { inicio: "15:10", fin: "16:05", modulo: "Proyecto Intermodular 2 De Desarrollo De Aplicaciones WEB", cfs: "2" },
            { inicio: "16:05", fin: "17:00", modulo: "Proyecto Intermodular 2 De Desarrollo De Aplicaciones WEB", cfs: "2" },
            { inicio: "17:00", fin: "17:55", modulo: "Proyecto Intermodular 2 De Desarrollo De Aplicaciones WEB", cfs: "2" },
            { inicio: "18:15", fin: "19:10", modulo: "Digitalización Aplicada Al Sistema Productivo GS", cfs: "2" },
            { inicio: "19:10", fin: "20:05", modulo: "Itinerario Personal Para La Empleabilidad II", cfs: "2" },
            { inicio: "20:05", fin: "21:00", modulo: "Itinerario Personal Para La Empleabilidad II", cfs: "2" }
          ]
        }
      ]
    }
  }, null, 2);

  const WEEK_DAYS = [
    { key: 'lunes', label: 'Lunes' },
    { key: 'martes', label: 'Martes' },
    { key: 'miercoles', label: 'Miércoles' },
    { key: 'jueves', label: 'Jueves' },
    { key: 'viernes', label: 'Viernes' }
  ];

  function normalizeDayKey(dayStr) {
    return (dayStr || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function getScheduleGroupsMap() {
    const groups = new Map();
    for (const item of allSchedulesList) {
      const sName = item.schedule_name || 'Horario General';
      if (!groups.has(sName)) {
        groups.set(sName, []);
      }
      groups.get(sName).push(item);
    }
    return groups;
  }

  function buildScheduleTableHtml(scheduleName, items) {
    const isOpen = expandedScheduleNames.has(scheduleName);
    const escapedName = scheduleName.replace(/"/g, '&quot;');

    // Obtener todos los tramos horarios únicos ordenados por hora de inicio
    const slotMap = new Map();
    for (const item of items) {
      const slotKey = `${item.start_time} - ${item.end_time}`;
      if (!slotMap.has(slotKey)) {
        slotMap.set(slotKey, {
          start: item.start_time,
          end: item.end_time,
          label: `${item.start_time} – ${item.end_time}`,
          byDay: {}
        });
      }
      const dKey = normalizeDayKey(item.day_name);
      if (!slotMap.get(slotKey).byDay[dKey]) {
        slotMap.get(slotKey).byDay[dKey] = [];
      }
      slotMap.get(slotKey).byDay[dKey].push(item);
    }

    const sortedSlots = Array.from(slotMap.values()).sort((a, b) =>
      (a.start || '').localeCompare(b.start || '')
    );

    const rowsHtml = sortedSlots.map(slot => {
      const cellsHtml = WEEK_DAYS.map(day => {
        const cellItems = slot.byDay[day.key] || [];
        if (cellItems.length === 0) {
          return `<td style="color: var(--muted); text-align: center; vertical-align: middle; font-size: 11px;">—</td>`;
        }
        return `
          <td>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${cellItems.map(c => `
                <div class="schedule-cell-item ${c.highlighted ? 'is-highlighted' : ''}">
                  <div class="schedule-cell-title">${c.module_name}</div>
                  <div class="schedule-cell-meta">
                    <span class="schedule-badge-cfs">CFS ${c.cfs || '2'}</span>
                    ${c.highlighted ? '<span class="schedule-badge-highlight">★ Destacado</span>' : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </td>
        `;
      }).join('');

      return `
        <tr>
          <td class="schedule-time-col">${slot.label}</td>
          ${cellsHtml}
        </tr>
      `;
    }).join('');

    return `
      <article class="schedule-group-card ${isOpen ? 'is-open' : ''}" data-schedule-card="${escapedName}">
        <div class="schedule-group-header" data-toggle-schedule="${escapedName}" role="button" tabindex="0" aria-expanded="${isOpen}">
          <div style="display: flex; align-items: center; gap: 14px;">
            <span class="schedule-toggle-arrow" title="Mostrar / ocultar horario">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
            <div>
              <span class="eyebrow">Horario de clase</span>
              <h3 style="margin: 2px 0 0; font-size: 17px; font-weight: 800;">${scheduleName}</h3>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="schedule-badge-cfs">${items.length} sesiones semanales</span>
            <button type="button" class="secondary-button btn-delete-single-schedule" data-schedule-name="${escapedName}" style="height: 34px; padding: 0 12px; font-size: 11px; color: var(--danger); border-color: var(--line); background: var(--white);">
              Eliminar
            </button>
          </div>
        </div>
        <div class="schedule-table-wrap">
          <table class="schedule-grid-table">
            <thead>
              <tr>
                <th style="width: 125px;">Tramo Horario</th>
                ${WEEK_DAYS.map(d => `<th>${d.label}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </article>
    `;
  }

  function renderSchedules() {
    if (!schedulesContainer) return;
    const groupsMap = getScheduleGroupsMap();

    if (groupsMap.size === 0) {
      schedulesContainer.innerHTML = `
        <div class="history-list" style="padding: 36px; text-align: center; color: var(--muted);">
          No hay horarios importados todavía. Usa el botón <b>"Añadir horario (XML / JSON)"</b> para importar el horario de cada clase.
        </div>
      `;
      return;
    }

    schedulesContainer.innerHTML = Array.from(groupsMap.entries())
      .map(([name, items]) => buildScheduleTableHtml(name, items))
      .join('');

    // Evento para desplegar/plegar al pulsar sobre la flecha o la cabecera
    schedulesContainer.querySelectorAll('[data-toggle-schedule]').forEach(headerEl => {
      headerEl.addEventListener('click', (e) => {
        // Evitar desplegar si se hizo click en el botón de eliminar
        if (e.target.closest('.btn-delete-single-schedule')) return;

        const name = headerEl.getAttribute('data-toggle-schedule');
        const card = headerEl.closest('.schedule-group-card');
        if (!card || !name) return;

        const willOpen = !card.classList.contains('is-open');
        card.classList.toggle('is-open', willOpen);
        headerEl.setAttribute('aria-expanded', String(willOpen));

        if (willOpen) {
          expandedScheduleNames.add(name);
        } else {
          expandedScheduleNames.delete(name);
        }
      });
    });

    schedulesContainer.querySelectorAll('.btn-delete-single-schedule').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const targetName = btn.getAttribute('data-schedule-name');
        if (!targetName) return;
        const confirmed = await showConfirm(
          `¿Seguro que deseas eliminar el horario "${targetName}"?`,
          'Eliminar horario',
          'Sí, eliminar'
        );
        if (!confirmed) return;

        try {
          await adminApi.clearSchedules(targetName);
          expandedScheduleNames.delete(targetName);
          showAlert(`Horario "${targetName}" eliminado.`);
          loadSchedules();
        } catch (err) {
          showError(err.message, 'Error al eliminar horario');
        }
      });
    });
  }

  async function loadSchedules() {
    if (!schedulesContainer) return;
    try {
      const res = await adminApi.getSchedules();
      allSchedulesList = res.data || [];
      renderSchedules();
    } catch (e) {
      schedulesContainer.innerHTML = `<div class="history-list" style="padding: 20px; text-align: center; color: var(--danger);">${e.message}</div>`;
    }
  }

  // Modal de importación XML / JSON
  const scheduleModal = document.getElementById('schedule-modal');
  const btnOpenImportTop = document.getElementById('btn-open-import-schedule');
  const btnOpenImportTab = document.getElementById('btn-tab-import-schedule');
  const btnCloseScheduleModal = document.getElementById('btn-close-schedule-modal');
  const btnCancelScheduleModal = document.getElementById('btn-cancel-schedule-modal');
  const scheduleForm = document.getElementById('schedule-import-form');
  const scheduleNameInput = document.getElementById('schedule-name-input');
  const scheduleFormatSelect = document.getElementById('schedule-format');
  const scheduleModeSelect = document.getElementById('schedule-mode');
  const scheduleContentInput = document.getElementById('schedule-content');
  const scheduleFileInput = document.getElementById('schedule-file-input');
  const scheduleDropzone = document.getElementById('schedule-dropzone');
  const scheduleFileLabel = document.getElementById('schedule-file-label');
  const btnLoadSampleXml = document.getElementById('btn-load-sample-xml');
  const btnLoadSampleJson = document.getElementById('btn-load-sample-json');
  const btnClearSchedule = document.getElementById('btn-clear-schedule');

  function openScheduleModal() {
    if (!scheduleModal) return;
    scheduleModal.style.display = 'flex';
  }

  function closeScheduleModal() {
    if (!scheduleModal) return;
    scheduleModal.style.display = 'none';
  }

  if (btnOpenImportTop) btnOpenImportTop.addEventListener('click', openScheduleModal);
  if (btnOpenImportTab) btnOpenImportTab.addEventListener('click', openScheduleModal);
  if (btnCloseScheduleModal) btnCloseScheduleModal.addEventListener('click', closeScheduleModal);
  if (btnCancelScheduleModal) btnCancelScheduleModal.addEventListener('click', closeScheduleModal);

  function handleSelectedFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'xml' && scheduleFormatSelect) {
      scheduleFormatSelect.value = 'xml';
    } else if (ext === 'json' && scheduleFormatSelect) {
      scheduleFormatSelect.value = 'json';
    }

    // Autocompletar el nombre del horario con el nombre del archivo si está vacío
    if (scheduleNameInput && !scheduleNameInput.value.trim()) {
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      scheduleNameInput.value = baseName;
    }

    if (scheduleFileLabel) {
      scheduleFileLabel.textContent = `Archivo cargado: ${file.name}`;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      if (scheduleContentInput) {
        scheduleContentInput.value = ev.target.result || '';
      }
    };
    reader.onerror = () => {
      showError('No se pudo leer el archivo seleccionado', 'Error de lectura');
    };
    reader.readAsText(file, 'UTF-8');
  }

  if (scheduleDropzone && scheduleFileInput) {
    scheduleDropzone.addEventListener('click', () => scheduleFileInput.click());
    scheduleFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleSelectedFile(e.target.files[0]);
      }
    });

    scheduleDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      scheduleDropzone.classList.add('dragover');
    });
    scheduleDropzone.addEventListener('dragleave', () => {
      scheduleDropzone.classList.remove('dragover');
    });
    scheduleDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      scheduleDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleSelectedFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (btnLoadSampleXml) {
    btnLoadSampleXml.addEventListener('click', () => {
      if (scheduleFormatSelect) scheduleFormatSelect.value = 'xml';
      if (scheduleNameInput && !scheduleNameInput.value.trim()) {
        scheduleNameInput.value = '2º DAW';
      }
      if (scheduleContentInput) scheduleContentInput.value = SAMPLE_XML;
      if (scheduleFileLabel) scheduleFileLabel.textContent = 'Plantilla de ejemplo XML cargada';
    });
  }

  if (btnLoadSampleJson) {
    btnLoadSampleJson.addEventListener('click', () => {
      if (scheduleFormatSelect) scheduleFormatSelect.value = 'json';
      if (scheduleNameInput && !scheduleNameInput.value.trim()) {
        scheduleNameInput.value = '2º DAW (JSON)';
      }
      if (scheduleContentInput) scheduleContentInput.value = SAMPLE_JSON;
      if (scheduleFileLabel) scheduleFileLabel.textContent = 'Plantilla de ejemplo JSON cargada';
    });
  }

  if (scheduleForm) {
    scheduleForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btn-submit-schedule');
      const scheduleName = scheduleNameInput ? scheduleNameInput.value.trim() : '';
      const format = scheduleFormatSelect ? scheduleFormatSelect.value : 'xml';
      const replaceExisting = scheduleModeSelect ? scheduleModeSelect.value === 'replace' : true;
      const content = scheduleContentInput ? scheduleContentInput.value.trim() : '';

      if (!scheduleName) {
        showError('Introduce un nombre para identificar este horario (ej: 2º DAW)', 'Nombre obligatorio');
        return;
      }

      if (!content) {
        showError('Selecciona un archivo o pega el contenido XML/JSON del horario', 'Contenido vacío');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Importando...';
      }

      try {
        const res = await adminApi.importSchedules({ scheduleName, format, content, replaceExisting });
        closeScheduleModal();
        showSuccess(res.message || `Horario "${scheduleName}" importado correctamente`);
        expandedScheduleNames.add(scheduleName);
        await loadSchedules();

        // Activar la pestaña de horarios automáticamente para ver la tabla
        const scheduleTabBtn = document.querySelector('.admin-tab-btn[data-tab="tab-schedules"]');
        if (scheduleTabBtn) scheduleTabBtn.click();
      } catch (err) {
        showError(err.message, 'Error al importar horario');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Importar horario';
        }
      }
    });
  }

  if (btnClearSchedule) {
    btnClearSchedule.addEventListener('click', async () => {
      if (allSchedulesList.length === 0) return;
      const confirmed = await showConfirm(
        '¿Estás seguro de que deseas eliminar TODOS los horarios de todas las clases?',
        'Vaciar todos los horarios',
        'Sí, eliminar todos'
      );
      if (!confirmed) return;

      try {
        await adminApi.clearSchedules();
        expandedScheduleNames.clear();
        showAlert('Todos los horarios han sido eliminados.');
        loadSchedules();
      } catch (err) {
        showError(err.message, 'Error al eliminar horarios');
      }
    });
  }

  loadSchedules();

  // =========================================================================
  // Panel de Reparto Inteligente de Horas (Auto-Dispatch)
  // =========================================================================
  const statCourseHours = document.getElementById('stat-course-hours');
  const statEnrolledEv = document.getElementById('stat-enrolled-ev');
  const statQuotaPerStudent = document.getElementById('stat-quota-per-student');
  const rankingContainer = document.getElementById('auto-dispatch-ranking-container');

  // Tarjeta de estado de la programación automática
  const scheduleStatusBadge = document.getElementById('schedule-status-badge');
  const scheduleStatusText = document.getElementById('schedule-status-text');
  const scheduleLastRunInfo = document.getElementById('schedule-last-run-info');

  const btnEditAlgoModal = document.getElementById('btn-edit-algorithm-settings');
  const algoModal = document.getElementById('algorithm-settings-modal');
  const btnCloseAlgoModal = document.getElementById('btn-close-algorithm-modal');
  const btnCancelAlgoModal = document.getElementById('btn-cancel-algorithm-modal');
  const algoForm = document.getElementById('algorithm-settings-form');

  const btnOpenSchedulerModal = document.getElementById('btn-open-scheduler-modal');
  const schedulerModal = document.getElementById('scheduler-settings-modal');
  const btnCloseSchedulerModal = document.getElementById('btn-close-scheduler-modal');
  const btnCancelSchedulerModal = document.getElementById('btn-cancel-scheduler-modal');
  const schedulerForm = document.getElementById('scheduler-settings-form');

  const inputCourseHours = document.getElementById('input-course-total-hours');
  const inputStart = document.getElementById('input-charging-start');
  const inputEnd = document.getElementById('input-charging-end');
  const inputSlot = document.getElementById('input-slot-duration');
  const btnRunAutoDispatch = document.getElementById('btn-run-auto-dispatch');

  // Inputs del modal de scheduler
  const inputSchedulerEnabled = document.getElementById('input-scheduler-enabled');
  const inputSchedulerFrequency = document.getElementById('input-scheduler-frequency');
  const inputSchedulerTime = document.getElementById('input-scheduler-time');
  const inputSchedulerDayOfWeek = document.getElementById('input-scheduler-day-of-week');
  const inputSchedulerDayOfMonth = document.getElementById('input-scheduler-day-of-month');
  const inputSchedulerScope = document.getElementById('input-scheduler-scope');

  const freqDailyOpts = document.getElementById('freq-daily-opts');
  const freqWeeklyOpts = document.getElementById('freq-weekly-opts');
  const freqMonthlyOpts = document.getElementById('freq-monthly-opts');

  function updateFrequencyVisibility(freq) {
    if (freqDailyOpts) freqDailyOpts.style.display = freq === 'daily' ? 'block' : 'none';
    if (freqWeeklyOpts) freqWeeklyOpts.style.display = freq === 'weekly' ? 'block' : 'none';
    if (freqMonthlyOpts) freqMonthlyOpts.style.display = freq === 'monthly' ? 'block' : 'none';
  }

  if (inputSchedulerFrequency) {
    inputSchedulerFrequency.addEventListener('change', () => {
      updateFrequencyVisibility(inputSchedulerFrequency.value);
    });
  }

  let currentAlgoData = null;

  async function loadAutoDispatchStats() {
    if (!rankingContainer) return;
    try {
      const res = await adminApi.getAutoDispatchStats();
      currentAlgoData = res.data;
      const { settings, total_course_hours, enrolled_students_count, quota_per_student, priority_ranking } = currentAlgoData;

      if (statCourseHours) statCourseHours.textContent = `${total_course_hours.toLocaleString('es-ES')} h`;
      if (statEnrolledEv) statEnrolledEv.textContent = enrolled_students_count;
      if (statQuotaPerStudent) statQuotaPerStudent.textContent = `${quota_per_student.toLocaleString('es-ES')} h`;

      // Actualizar tarjeta informativa de programación automática
      if (scheduleStatusBadge && scheduleStatusText) {
        if (settings.auto_dispatch_enabled) {
          scheduleStatusBadge.textContent = 'Activa';
          scheduleStatusBadge.style.color = 'var(--green-dark)';
          const scopeLabel = settings.auto_dispatch_target_scope === 'tomorrow' ? 'mañana' : 'hoy';
          
          let freqDesc = '';
          const daysMap = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 7: 'Domingo' };
          if (settings.auto_dispatch_frequency === 'weekly') {
            const dayName = daysMap[settings.auto_dispatch_day_of_week] || 'Lunes';
            freqDesc = `Semanal (cada <b>${dayName}</b> a las <b>${settings.auto_dispatch_time}</b>)`;
          } else if (settings.auto_dispatch_frequency === 'monthly') {
            freqDesc = `Mensual (el <b>día ${settings.auto_dispatch_day_of_month}</b> de cada mes a las <b>${settings.auto_dispatch_time}</b>)`;
          } else {
            freqDesc = `Diaria (a las <b>${settings.auto_dispatch_time}</b> para <b>${scopeLabel}</b>)`;
          }

          scheduleStatusText.innerHTML = `Reparto automático programado: ${freqDesc}.`;
        } else {
          scheduleStatusBadge.textContent = 'Pausada';
          scheduleStatusBadge.style.color = 'var(--danger)';
          scheduleStatusText.textContent = 'La ejecución automática está desactivada. Solo se ejecuta al pulsar manualmente.';
        }
      }

      if (scheduleLastRunInfo) {
        if (settings.auto_dispatch_last_run) {
          scheduleLastRunInfo.innerHTML = `Última ejecución:<br><b style="color: var(--ink);">${formatDateTime(settings.auto_dispatch_last_run)}</b>`;
        } else {
          scheduleLastRunInfo.innerHTML = `Última ejecución:<br><i>Nunca</i>`;
        }
      }

      if (priority_ranking.length === 0) {
        rankingContainer.innerHTML = `
          <div style="padding: 30px; text-align: center; color: var(--muted);">
            No hay alumnos registrados con vehículo (matrícula). Registra vehículos para calcular la cuota y generar reservas.
          </div>
        `;
        return;
      }

      rankingContainer.innerHTML = priority_ranking.map((s, idx) => {
        const isTopPriority = idx === 0;
        return `
          <article class="history-item">
            <div class="history-logo" style="${isTopPriority ? 'background: var(--green); color: var(--navy); font-weight: 800;' : ''}">
              #${idx + 1}
            </div>
            <div class="history-place">
              <strong>${s.name} ${isTopPriority ? '<span class="status-badge-inline status-available" style="margin-left: 6px; font-size: 10px;">⚡ Máxima prioridad</span>' : ''}</strong>
              <span>${s.email} · ${s.vehicle_brand || ''} ${s.vehicle_model || ''} (${s.vehicle_plate})</span>
            </div>
            <div class="history-meta">
              <span style="font-weight: 700; color: var(--ink);">${s.total_hours_charged} h</span>
              <small style="color: var(--muted); font-size: 10px;">${s.total_bookings_count} reserva(s)</small>
            </div>
            <div>
              <span class="history-status" style="color: ${s.total_hours_charged < quota_per_student ? 'var(--green-dark)' : 'var(--muted)'};">
                ${s.total_hours_charged < quota_per_student ? 'Cupo disponible' : 'Cupo alcanzado'}
              </span>
            </div>
            <div></div>
          </article>
        `;
      }).join('');
    } catch (e) {
      rankingContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--danger);">${e.message}</div>`;
    }
  }

  function openAlgoModal() {
    if (!algoModal || !currentAlgoData) return;
    const { settings } = currentAlgoData;
    if (inputCourseHours) inputCourseHours.value = settings.course_total_hours;
    if (inputStart) inputStart.value = settings.charging_window_start;
    if (inputEnd) inputEnd.value = settings.charging_window_end;
    if (inputSlot) inputSlot.value = settings.slot_duration_hours;
    algoModal.style.display = 'flex';
  }

  function closeAlgoModal() {
    if (algoModal) algoModal.style.display = 'none';
  }

  if (btnEditAlgoModal) btnEditAlgoModal.addEventListener('click', openAlgoModal);
  if (btnCloseAlgoModal) btnCloseAlgoModal.addEventListener('click', closeAlgoModal);
  if (btnCancelAlgoModal) btnCancelAlgoModal.addEventListener('click', closeAlgoModal);

  function openSchedulerModal() {
    if (!schedulerModal || !currentAlgoData) return;
    const { settings } = currentAlgoData;
    if (inputSchedulerEnabled) inputSchedulerEnabled.value = String(settings.auto_dispatch_enabled);
    if (inputSchedulerFrequency) inputSchedulerFrequency.value = settings.auto_dispatch_frequency || 'daily';
    if (inputSchedulerTime) inputSchedulerTime.value = settings.auto_dispatch_time || '20:00';
    if (inputSchedulerDayOfWeek) inputSchedulerDayOfWeek.value = String(settings.auto_dispatch_day_of_week || 1);
    if (inputSchedulerDayOfMonth) inputSchedulerDayOfMonth.value = String(settings.auto_dispatch_day_of_month || 1);
    if (inputSchedulerScope) inputSchedulerScope.value = settings.auto_dispatch_target_scope || 'tomorrow';

    const selectedDays = (settings.auto_dispatch_days || '1,2,3,4,5').split(',');
    document.querySelectorAll('input[name="sched_days"]').forEach(chk => {
      chk.checked = selectedDays.includes(chk.value);
    });

    updateFrequencyVisibility(inputSchedulerFrequency.value);
    schedulerModal.style.display = 'flex';
  }

  function closeSchedulerModal() {
    if (schedulerModal) schedulerModal.style.display = 'none';
  }

  if (btnOpenSchedulerModal) btnOpenSchedulerModal.addEventListener('click', openSchedulerModal);
  if (btnCloseSchedulerModal) btnCloseSchedulerModal.addEventListener('click', closeSchedulerModal);
  if (btnCancelSchedulerModal) btnCancelSchedulerModal.addEventListener('click', closeSchedulerModal);

  if (schedulerForm) {
    schedulerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const enabled = inputSchedulerEnabled.value === 'true';
      const frequency = inputSchedulerFrequency.value;
      const time = inputSchedulerTime.value;
      const dayOfWeek = inputSchedulerDayOfWeek ? inputSchedulerDayOfWeek.value : '1';
      const dayOfMonth = inputSchedulerDayOfMonth ? inputSchedulerDayOfMonth.value : '1';
      const scope = inputSchedulerScope.value;

      const checkedDays = Array.from(document.querySelectorAll('input[name="sched_days"]:checked'))
        .map(c => c.value)
        .join(',');

      try {
        await adminApi.updateAutoDispatchSettings({
          auto_dispatch_enabled: enabled,
          auto_dispatch_frequency: frequency,
          auto_dispatch_time: time,
          auto_dispatch_day_of_week: dayOfWeek,
          auto_dispatch_day_of_month: dayOfMonth,
          auto_dispatch_target_scope: scope,
          auto_dispatch_days: checkedDays || '1,2,3,4,5'
        });
        closeSchedulerModal();
        showSuccess('Programación de horarios automáticos guardada con éxito.');
        loadAutoDispatchStats();
      } catch (err) {
        showError(err.message, 'Error al guardar programación');
      }
    });
  }

  if (algoForm) {
    algoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await adminApi.updateAutoDispatchSettings({
          course_total_hours: inputCourseHours.value,
          charging_window_start: inputStart.value,
          charging_window_end: inputEnd.value,
          slot_duration_hours: inputSlot.value
        });
        closeAlgoModal();
        showSuccess('Configuración de horas y franjas actualizada correctamente.');
        loadAutoDispatchStats();
      } catch (err) {
        showError(err.message, 'Error al guardar configuración');
      }
    });
  }

  if (btnRunAutoDispatch) {
    btnRunAutoDispatch.addEventListener('click', async () => {
      const confirmed = await showConfirm(
        'El sistema planificará las plazas de carga para toda la semana lectiva (Lunes a Viernes), priorizando a los alumnos que menos horas acumuladas lleven. ¿Deseas ejecutarlo ahora?',
        'Planificación Semanal Automática',
        '⚡ Planificar Semana Completa'
      );
      if (!confirmed) return;

      btnRunAutoDispatch.disabled = true;
      btnRunAutoDispatch.textContent = 'Calculando semana...';

      try {
        const res = await adminApi.runAutoDispatch();
        if (res.success) {
          showSuccess(res.message);
          await loadAutoDispatchStats();
          await loadAllBookings();
          await loadStats();
          if (adminCurrentWeekStart) {
            await loadAdminWeeklySchedule(adminCurrentWeekStart);
          }
        } else {
          showError(res.message, 'Aviso de Asignación');
        }
      } catch (err) {
        showError(err.message, 'Error al ejecutar asignación');
      } finally {
        btnRunAutoDispatch.disabled = false;
        btnRunAutoDispatch.textContent = '⚡ Ejecutar Asignación Ahora';
      }
    });
  }

  // ==========================================
  // Cuadrante Semanal de Recargas
  // ==========================================
  let adminCurrentWeekStart = null;

  function toIsoDate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getMonday(d = new Date()) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function updateAdminWeekLabel(startDateStr, endDateStr) {
    const labelEl = document.getElementById('admin-week-range-label');
    if (!labelEl) return;
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const options = { day: 'numeric', month: 'short' };
    const sStr = start.toLocaleDateString('es-ES', options);
    const eStr = end.toLocaleDateString('es-ES', options);
    const year = end.getFullYear();
    labelEl.textContent = `${sStr} - ${eStr}, ${year}`;
  }

  function updateAdminHeadersWithDates(daysDates) {
    const names = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    daysDates.forEach((d, idx) => {
      const th = document.getElementById(`th-admin-day-${idx + 1}`);
      if (th) {
        const dayNum = String(d.getDate()).padStart(2, '0');
        const monthNum = String(d.getMonth() + 1).padStart(2, '0');
        th.innerHTML = `${names[idx]} <span style="font-size: 11px; font-weight: normal; color: var(--muted); display: block; margin-top: 2px;">${dayNum}/${monthNum}</span>`;
      }
    });
  }

  async function loadAdminWeeklySchedule(weekStartStr) {
    const tbody = document.getElementById('admin-weekly-grid-body');
    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 30px; text-align: center; color: var(--muted);">
          Cargando cuadrante semanal...
        </td>
      </tr>
    `;

    try {
      const res = await bookingsApi.getWeeklySchedule(weekStartStr);
      if (!res || !res.success) {
        throw new Error(res?.message || 'Error al obtener horario semanal.');
      }

      const { week_start, week_end, bookings } = res.data;
      adminCurrentWeekStart = week_start;
      updateAdminWeekLabel(week_start, week_end);

      renderWeeklyGrid(tbody, bookings, week_start, user.id, updateAdminHeadersWithDates);
    } catch (err) {
      console.error('Error cargando horario semanal en admin:', err);
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 30px; text-align: center; color: var(--danger);">
            ${err.message || 'Error al cargar horario semanal.'}
          </td>
        </tr>
      `;
    }
  }

  adminCurrentWeekStart = toIsoDate(getMonday());

  const btnAdminPrev = document.getElementById('btn-admin-prev-week');
  const btnAdminNext = document.getElementById('btn-admin-next-week');

  if (btnAdminPrev) {
    btnAdminPrev.addEventListener('click', () => {
      const cur = new Date(adminCurrentWeekStart);
      cur.setDate(cur.getDate() - 7);
      adminCurrentWeekStart = toIsoDate(cur);
      loadAdminWeeklySchedule(adminCurrentWeekStart);
    });
  }

  if (btnAdminNext) {
    btnAdminNext.addEventListener('click', () => {
      const cur = new Date(adminCurrentWeekStart);
      cur.setDate(cur.getDate() + 7);
      adminCurrentWeekStart = toIsoDate(cur);
      loadAdminWeeklySchedule(adminCurrentWeekStart);
    });
  }

  loadAutoDispatchStats();
}
