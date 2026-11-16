/**
 * Renderiza la cuadrícula semanal del horario de carga.
 *
 * Muestra el horario unificado en los dos bloques de carga de tarde con el patio intermedio:
 * - Tramo 1 (Antes del patio): 15:10 – 17:55 (Una única celda por día para la persona asignada durante las 3 clases).
 * - Patio (17:55 – 18:15): Fila diferenciada de 20 min para el cambio de coches (sin reservas).
 * - Tramo 2 (Después del patio): 18:15 – 21:00 (Una única celda por día para la persona asignada durante las 3 clases).
 *
 * @param {HTMLElement} tbodyEl - Elemento tbody donde se inyectan las filas
 * @param {Array} bookings - Lista de reservas de la semana
 * @param {String} weekStartStr - Fecha de inicio de semana (YYYY-MM-DD)
 * @param {Number|null} currentUserId - ID del usuario actual para resaltar sus plazas
 * @param {Function|null} updateHeadersFn - Función opcional para actualizar las cabeceras con el número de día
 */
export function renderWeeklyGrid(tbodyEl, bookings = [], weekStartStr, currentUserId = null, updateHeadersFn = null) {
  if (!tbodyEl) return;

  const monday = new Date(weekStartStr);

  // Días lectivos de Lunes (0) a Viernes (4)
  const daysDates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    daysDates.push(d);
  }

  if (typeof updateHeadersFn === 'function') {
    updateHeadersFn(daysDates);
  }

  // Tramos unificados de tarde
  const unifiedTramos = [
    {
      start: '15:10',
      end: '17:55',
      title: '15:10 – 17:55',
      subtitle: 'Bloque 1 (3 sesiones)',
      startMin: 15 * 60 + 10,
      endMin: 17 * 60 + 55
    },
    {
      isBreak: true,
      start: '17:55',
      end: '18:15',
      title: '17:55 – 18:15',
      label: 'PATIO — CAMBIO DE COCHES'
    },
    {
      start: '18:15',
      end: '21:00',
      title: '18:15 – 21:00',
      subtitle: 'Bloque 2 (3 sesiones)',
      startMin: 18 * 60 + 15,
      endMin: 21 * 60
    }
  ];

  // Helper para buscar reservas que caen dentro del bloque
  function findBookingsForBlock(dayDateStr, startMin, endMin) {
    return (bookings || []).filter(b => {
      const bStart = new Date(b.start_time);
      const bEnd = new Date(b.end_time);

      const year = bStart.getFullYear();
      const month = String(bStart.getMonth() + 1).padStart(2, '0');
      const day = String(bStart.getDate()).padStart(2, '0');
      const bDateStr = `${year}-${month}-${day}`;

      if (bDateStr !== dayDateStr) return false;

      const bStartMin = bStart.getHours() * 60 + bStart.getMinutes();
      const bEndMin = bEnd.getHours() * 60 + bEnd.getMinutes();

      // Se solapan si hay coincidencia temporal con el bloque
      return bStartMin < endMin && bEndMin > startMin;
    });
  }

  let html = '';

  unifiedTramos.forEach(tramo => {
    if (tramo.isBreak) {
      html += `
        <tr style="background: rgba(185, 244, 70, 0.06); border-top: 1px dashed var(--line); border-bottom: 1px dashed var(--line);">
          <td class="schedule-time-col" style="font-weight: 800; color: var(--green-dark); background: rgba(185, 244, 70, 0.1);">
            <div>${tramo.title}</div>
            <span style="font-size: 10px; font-weight: normal; color: var(--muted); display: block; margin-top: 2px;">20 min</span>
          </td>
          <td colspan="5" style="text-align: center; padding: 12px; font-weight: 700; font-size: 11px; letter-spacing: 1px; color: var(--green-dark);">
            ⏸ ${tramo.label} (SIN RESERVAS)
          </td>
        </tr>
      `;
      return;
    }

    html += `<tr>`;
    html += `
      <td class="schedule-time-col">
        <div style="font-size: 13px; font-weight: 800;">${tramo.title}</div>
        <span style="font-size: 10px; font-weight: normal; color: var(--muted); display: block; margin-top: 2px;">
          ${tramo.subtitle}
        </span>
      </td>
    `;

    // Columnas de Lunes a Viernes
    daysDates.forEach(dayDate => {
      const year = dayDate.getFullYear();
      const month = String(dayDate.getMonth() + 1).padStart(2, '0');
      const day = String(dayDate.getDate()).padStart(2, '0');
      const dayDateStr = `${year}-${month}-${day}`;

      const cellBookings = findBookingsForBlock(dayDateStr, tramo.startMin, tramo.endMin);

      if (cellBookings.length === 0) {
        html += `
          <td style="color: var(--muted); text-align: center; vertical-align: middle; font-size: 12px;">
            —
          </td>
        `;
      } else {
        html += `<td><div style="display: flex; flex-direction: column; gap: 8px;">`;
        cellBookings.forEach(b => {
          const isMySlot = currentUserId && b.user_id === currentUserId;
          const chargerLabel = b.charger_name || (b.charger_id ? `Cargador #${b.charger_id}` : 'Cargador');
          const className = b.class_name ? b.class_name : 'Sin clase';

          html += `
            <div class="schedule-cell-item ${isMySlot ? 'is-highlighted' : ''}">
              <div class="schedule-cell-title" style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
                <span>${b.user_name || 'Alumno'}</span>
                ${isMySlot ? '<span style="font-size: 9px; font-weight: 800; color: var(--green-dark);">¡Tu turno!</span>' : ''}
              </div>
              <div class="schedule-cell-meta" style="margin-top: 4px;">
                <span class="schedule-badge-cfs">${className}</span>
                <span class="schedule-badge-charger" title="${chargerLabel}">⚡ ${chargerLabel}</span>
              </div>
              ${b.vehicle_plate ? `
                <div style="font-size: 10px; color: var(--muted); margin-top: 2px;">
                  Matrícula: <strong style="color: var(--ink);">${b.vehicle_plate}</strong>
                </div>
              ` : ''}
            </div>
          `;
        });
        html += `</div></td>`;
      }
    });

    html += `</tr>`;
  });

  tbodyEl.innerHTML = html;
}
