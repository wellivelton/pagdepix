import axios from 'axios';

// Em produção NUNCA usar localhost: o navegador pede "acesso à rede local". Defina VITE_API_URL no build (ex: https://api.pagdepix.com).
const API_BASE = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? (typeof window !== 'undefined' ? window.location.origin : '') : 'http://localhost:3001/api');
const api = axios.create({
  baseURL: (API_BASE || '').endsWith('/api') ? (API_BASE || '').replace(/\/$/, '') : `${(API_BASE || '').replace(/\/$/, '')}/api`,
});

// Adicionar token em todas as requisições
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Retorna a base URL da API (ex: https://api.pagdepix.com/api). */
export function getApiBaseUrl(): string {
  return api.defaults.baseURL || '';
}

// Redirecionar para tela de manutenção quando API retornar 503 (modo manutenção)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 503 && error.response?.data?.maintenance) {
      const message = error.response.data.message || 'Sistema em manutenção. Tente novamente em breve.';
      window.sessionStorage.setItem('maintenanceMessage', message);
      window.location.href = '/manutencao';
      return Promise.reject(error);
    }
    return Promise.reject(error);
  }
);

export default api;
