import axios from 'axios';

// In development Vite proxies "/api" to the Express server (see vite.config.js).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true, // send the httpOnly login cookie
  timeout: 30000,
});

/** Turns any axios error into { status, message, code, fieldErrors } for the UI. */
export function parseApiError(error) {
  if (error?.response) {
    const { data, status } = error.response;
    const isJson = data && typeof data === 'object' && !(typeof Blob !== 'undefined' && data instanceof Blob);
    return {
      status,
      message: (isJson && data.message) || 'Something went wrong. Please try again.',
      code: isJson ? data.code : undefined,
      fieldErrors: (isJson && data.errors) || {},
    };
  }
  if (error?.code === 'ECONNABORTED') {
    return { status: 0, message: 'The request took too long. Please try again.', code: 'TIMEOUT', fieldErrors: {} };
  }
  return {
    status: 0,
    message: 'Cannot reach the server. Make sure the backend is running.',
    code: 'NETWORK',
    fieldErrors: {},
  };
}

export default api;
