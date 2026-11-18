import { apiRequest } from './client.js';

export const incidentsApi = {
  /**
   * Crea una nueva incidencia
   */
  createIncident(incidentData) {
    return apiRequest('/incidents', {
      method: 'POST',
      body: JSON.stringify(incidentData)
    });
  },

  /**
   * Obtiene las incidencias reportadas por el usuario actual
   */
  getMyIncidents() {
    return apiRequest('/incidents/my', {
      method: 'GET'
    });
  },

  /**
   * (Admin) Obtiene todas las incidencias, con filtro opcional por estado
   */
  getAllIncidents(status = 'all') {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return apiRequest(`/incidents/all${query}`, {
      method: 'GET'
    });
  },

  /**
   * (Admin) Obtiene el número de incidencias pendientes
   */
  getPendingCount() {
    return apiRequest('/incidents/pending-count', {
      method: 'GET'
    });
  },

  /**
   * (Admin) Actualiza el estado y resolución de una incidencia
   */
  updateIncidentStatus(id, updateData) {
    return apiRequest(`/incidents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData)
    });
  }
};
