/**
 * Utilidades para fechas y horas en el frontend
 */

/**
 * Convierte un objeto Date o ISO string a formato local amigable (dd/mm/aaaa, hh:mm)
 */
export function formatDateTime(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '-';
  
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

