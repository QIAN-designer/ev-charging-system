import { requireAuth } from '../guards/authGuard.js';
import { storage } from '../utils/storage.js';
import { incidentsApi } from '../api/incidents.api.js';
import { initTheme } from '../utils/theme.js';
import { setupUserMenu } from '../utils/userMenu.js';
import { showError, showSuccess } from '../utils/alerts.js';
import { formatDateTime } from '../utils/date.js';

if (requireAuth()) {
  initTheme();
  setupUserMenu();
  const user = storage.getUser();

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      storage.clear();
      window.location.href = 'login.html';
    });
  }

  // Manejo de opciones de tipo de incidencia
  const typeOptions = document.querySelectorAll('.incident-type-option');
  const plateField = document.getElementById('field-vehicle-plate');
  const plateInput = document.getElementById('incident-plate');
  const titleInput = document.getElementById('incident-title');

  typeOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      typeOptions.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const radio = opt.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        
        // Auto-sugerir asuntos según el tipo seleccionado
        if (radio.value === 'unauthorized_parking') {
          plateField.style.display = 'block';
          if (!titleInput.value || titleInput.value.includes('Cargador averiado') || titleInput.value.includes('Incidencia')) {
            titleInput.value = 'Vehículo no autorizado ocupando la plaza';
          }
        } else if (radio.value === 'broken_charger') {
          if (!titleInput.value || titleInput.value.includes('Vehículo no autorizado') || titleInput.value.includes('Incidencia')) {
            titleInput.value = 'Cargador averiado / no suministra carga';
          }
        } else {
          if (!titleInput.value || titleInput.value.includes('Vehículo') || titleInput.value.includes('averiado')) {
            titleInput.value = 'Incidencia en punto de recarga';
          }
        }
      }
    });
  });

  // Prellenar asunto por defecto
  if (titleInput && !titleInput.value) {
    titleInput.value = 'Vehículo no autorizado ocupando la plaza';
  }

  // Envío del formulario
  const incidentForm = document.getElementById('incident-form');
  const btnSubmit = document.getElementById('btn-submit-incident');

  if (incidentForm) {
    incidentForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const selectedType = document.querySelector('input[name="incident-type"]:checked')?.value || 'other';
      const chargerId = document.getElementById('incident-charger')?.value;
      const reportedPlate = plateInput?.value?.trim();
      const title = titleInput?.value?.trim();
      const description = document.getElementById('incident-desc')?.value?.trim();

      if (!chargerId) {
        showError('Por favor selecciona el cargador afectado.', 'Campo requerido');
        return;
      }

      if (!title) {
        showError('Por favor introduce un asunto breve.', 'Campo requerido');
        return;
      }

      try {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = 'Enviando aviso...';

        await incidentsApi.createIncident({
          charger_id: chargerId,
          type: selectedType,
          title,
          description,
          reported_vehicle_plate: reportedPlate || null
        });

        await showSuccess(
          'Tu aviso ha sido registrado y el administrador ha recibido la notificación para gestionarlo.',
          '¡Incidencia notificada!'
        );

        incidentForm.reset();
        document.getElementById('opt-unauthorized')?.click();
        loadMyIncidents();
      } catch (err) {
        console.error('Error al enviar incidencia:', err);
        showError(err.message || 'No se pudo enviar la incidencia. Inténtalo de nuevo.', 'Error');
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Enviar aviso al administrador
        `;
      }
    });
  }

  // Cargar lista de incidencias del usuario
  const myIncidentsContainer = document.getElementById('my-incidents-container');
  const btnRefresh = document.getElementById('btn-refresh-incidents');

  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => loadMyIncidents());
  }

  async function loadMyIncidents() {
    if (!myIncidentsContainer) return;
    myIncidentsContainer.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--muted);">Cargando tus incidencias...</div>';

    try {
      const res = await incidentsApi.getMyIncidents();
      const list = res.data || [];

      if (list.length === 0) {
        myIncidentsContainer.innerHTML = `
          <div style="padding: 40px; text-align: center; color: var(--muted); background: var(--white); border: 1px dashed var(--line); border-radius: 16px;">
            <p style="font-weight: 600; color: var(--ink); margin-bottom: 4px;">No tienes incidencias registradas</p>
            <span style="font-size: 12px;">Cuando reportes un vehículo indebido o cargador roto, aquí verás el estado y la respuesta del centro.</span>
          </div>
        `;
        return;
      }

      const statusLabels = {
        pending: 'Pendiente de revisión',
        in_progress: 'En gestión',
        resolved: 'Resuelta',
        dismissed: 'Desestimada'
      };

      const typeIcons = {
        unauthorized_parking: '🚗 Vehículo no autorizado',
        broken_charger: '⚠️ Avería de cargador',
        other: '💬 Otra incidencia'
      };

      myIncidentsContainer.innerHTML = list.map(inc => {
        const statusClass = inc.status;
        const statusText = statusLabels[inc.status] || inc.status;
        const typeLabel = typeIcons[inc.type] || inc.type;

        return `
          <div class="incident-card">
            <div class="incident-header">
              <div>
                <span style="font-size: 11px; font-weight: 700; color: var(--green-dark); text-transform: uppercase; letter-spacing: 0.5px;">
                  ${typeLabel} · ${inc.charger_name || 'Cargador #' + inc.charger_id}
                </span>
                <h3 style="margin: 4px 0 2px; font-size: 15px; color: var(--ink); font-weight: 700;">
                  ${inc.title}
                </h3>
                <span style="font-size: 11px; color: var(--muted);">
                  Reportado el ${formatDateTime(inc.created_at)}
                </span>
              </div>
              <span class="incident-badge-status ${statusClass}">
                ${statusText}
              </span>
            </div>

            ${inc.reported_vehicle_plate ? `
              <div style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: rgba(239, 68, 68, 0.1); border-radius: 8px; color: #dc2626; font-size: 12px; font-weight: 700; margin-bottom: 8px;">
                <span>🚘 Matrícula infractora:</span>
                <span style="letter-spacing: 1px;">${inc.reported_vehicle_plate}</span>
              </div>
            ` : ''}

            ${inc.description ? `
              <p style="font-size: 13px; color: var(--ink); margin: 6px 0 10px; line-height: 1.5;">
                ${inc.description}
              </p>
            ` : ''}

            ${inc.admin_response ? `
              <div class="incident-admin-reply">
                <strong>Respuesta de la Administración:</strong>
                <span>${inc.admin_response}</span>
                ${inc.resolved_at ? `<div style="font-size: 10px; color: var(--muted); margin-top: 4px;">Resuelto el ${formatDateTime(inc.resolved_at)}</div>` : ''}
              </div>
            ` : `
              <div style="font-size: 11px; color: var(--muted); margin-top: 8px; font-style: italic;">
                ⏳ Esperando respuesta del administrador del centro...
              </div>
            `}
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('Error al cargar mis incidencias:', err);
      myIncidentsContainer.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--danger);">
          Error al cargar las incidencias: ${err.message}
        </div>
      `;
    }
  }

  loadMyIncidents();
}
