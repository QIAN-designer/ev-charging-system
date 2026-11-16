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

/**
 * Obtiene la fecha y hora actual formateada para un input datetime-local: YYYY-MM-DDTHH:mm
 */
export function toInputDateTime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Suma horas a una fecha y devuelve un Date
 */
export function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

