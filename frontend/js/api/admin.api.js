import { apiRequest } from './client.js';

export const adminApi = {
  getStats: () => {
    return apiRequest('/admin/stats', {
      method: 'GET'
    });
  },

  getAllUsers: () => {
    return apiRequest('/admin/users', {
      method: 'GET'
    });
  },

  updateUserRole: (userId, role) => {
    return apiRequest(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role })
    });
  },

  resetUserPassword: (userId, password) => {
    return apiRequest(`/admin/users/${userId}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password })
    });
  },

  getAllBookings: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.charger_id) params.append('charger_id', filters.charger_id);
    const query = params.toString() ? `?${params.toString()}` : '';

    return apiRequest(`/admin/bookings${query}`, {
      method: 'GET'
    });
  },

  cancelBooking: (id) => {
    return apiRequest(`/admin/bookings/${id}/cancel`, {
      method: 'PATCH'
    });
  },

  getAutoDispatchStats: () => {
    return apiRequest('/admin/auto-dispatch/stats', {
      method: 'GET'
    });
  },

  updateAutoDispatchSettings: (settings) => {
    return apiRequest('/admin/auto-dispatch/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  },

  runAutoDispatch: (targetDate = null) => {
    return apiRequest('/admin/auto-dispatch/run', {
      method: 'POST',
      body: JSON.stringify({ targetDate })
    });
  },

  createCharger: (chargerData) => {
    return apiRequest('/chargers', {
      method: 'POST',
      body: JSON.stringify(chargerData)
    });
  },

  updateCharger: (id, chargerData) => {
    return apiRequest(`/chargers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(chargerData)
    });
  },

  deleteCharger: (id) => {
    return apiRequest(`/chargers/${id}`, {
      method: 'DELETE'
    });
  },

  getSchedules: () => {
    return apiRequest('/admin/schedules', {
      method: 'GET'
    });
  },

  importSchedules: ({ scheduleName, format, content, replaceExisting = true }) => {
    return apiRequest('/admin/schedules/import', {
      method: 'POST',
      body: JSON.stringify({ scheduleName, format, content, replaceExisting })
    });
  },

  clearSchedules: (scheduleName = null) => {
    const query = scheduleName ? `?name=${encodeURIComponent(scheduleName)}` : '';
    return apiRequest(`/admin/schedules${query}`, {
      method: 'DELETE'
    });
  }
};

