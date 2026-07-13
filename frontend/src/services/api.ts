import axios from "axios"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
})

// Request Interceptor: Inject JWT and active Organization ID
api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token")
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }

      const orgId = localStorage.getItem("organizationId")
      if (orgId) {
        config.headers["x-organization-id"] = orgId
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
)

// Response Interceptor: Handle JWT token rotation (refresh token)
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem("refreshToken")
        if (refreshToken) {
          const res = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken })
          const { accessToken, refreshToken: newRefreshToken } = res.data;
          
          localStorage.setItem("token", accessToken)
          localStorage.setItem("refreshToken", newRefreshToken)
          
          originalRequest.headers.Authorization = `Bearer ${accessToken}`
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Clear tokens and redirect to login if refresh fails
        if (typeof window !== "undefined") {
          localStorage.removeItem("token")
          localStorage.removeItem("refreshToken")
          localStorage.removeItem("organizationId")
          window.location.href = "/login"
        }
      }
    }
    return Promise.reject(error.response?.data || error)
  }
)
