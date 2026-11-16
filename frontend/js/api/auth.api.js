import { apiRequest } from './client.js';

export const authApi = {
  login: (email, password) => {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },

  register: (userData) => {
    return apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  getProfile: () => {
    return apiRequest('/auth/me', {
      method: 'GET'
    });
  },

  updateProfile: (profileData) => {
    return apiRequest('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData)
    });
  },

  getAvailableClasses: () => {
    return apiRequest('/auth/classes', {
      method: 'GET'
    });
  }
};

