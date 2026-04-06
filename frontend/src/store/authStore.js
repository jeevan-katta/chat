import { create } from 'zustand';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`, // dynamic production host or local
  withCredentials: true,
});

export const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('userInfo')) || null,
  
  login: async (username, password) => {
    try {
      const res = await api.post('/auth/login', { username, password });
      localStorage.setItem('userInfo', JSON.stringify(res.data));
      set({ user: res.data });
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Login failed' };
    }
  },
  
  register: async (username, email, password) => {
    try {
      const res = await api.post('/auth/register', { username, email, password });
      localStorage.setItem('userInfo', JSON.stringify(res.data));
      set({ user: res.data });
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Registration failed' };
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
      localStorage.removeItem('userInfo');
      set({ user: null });
    } catch (error) {
      console.error(error);
    }
  },
}));

export default api;
