import { apiRequest } from './client.js';

export const bookingsApi = {
  getAllChargers: () => {
    return apiRequest('/chargers', {
      method: 'GET'
    });
  },

  getChargerById: (id) => {
    return apiRequest(`/chargers/${id}`, {
      method: 'GET'
    });
  },

  getMyBookings: () => {
    return apiRequest('/bookings/my', {
      method: 'GET'
    });
  },

  createBooking: (bookingData) => {
    return apiRequest('/bookings', {
      method: 'POST',
      body: JSON.stringify(bookingData)
    });
  },

  cancelBooking: (bookingId) => {
    return apiRequest(`/bookings/${bookingId}/cancel`, {
      method: 'PATCH'
    });
  }
};

