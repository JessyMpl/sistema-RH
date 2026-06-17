// Helpers centralizados para llamadas a la API
// Usa la variable de entorno VITE_API_URL definida en .env

const API_URL = import.meta.env.VITE_API_URL || '/biometrico-api'

/**
 * Construye la URL completa de un endpoint de la API
 * @param {string} path - Ruta del endpoint (ej: '/api/auth/login')
 * @returns {string} URL completa
 */
export function apiUrl(path) {
  return `${API_URL}${path}`
}

export default API_URL
