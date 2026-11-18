import { apiRequest } from './client.js';

export const bookingsApi = {
  getAllChargers: () => {
    return apiRequest('/chargers', {
      method: 'GET'
    });
  },

  getMyBookings: () => {
    return apiRequest('/bookings/my', {
      method: 'GET'
    });
  },

  cancelBooking: (bookingId) => {
    return apiRequest(`/bookings/${bookingId}/cancel`, {
      method: 'PATCH'
    });
  },

  getWeeklySchedule: (weekStart = null) => {
    const query = weekStart ? `?week_start=${encodeURIComponent(weekStart)}` : '';
    return apiRequest(`/bookings/weekly-schedule${query}`, {
      method: 'GET'
    });
  }
};

