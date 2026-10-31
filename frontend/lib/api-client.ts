import axios, { AxiosInstance, AxiosError } from 'axios'
import { supabase } from './supabase'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'

class ApiClient {
  private client: AxiosInstance

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    })

    // Add request interceptor for auth token
    this.client.interceptors.request.use(async (config) => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    })

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Handle unauthorized
          if (typeof window !== 'undefined') window.location.href = '/login'
        }
        return Promise.reject(error)
      }
    )
  }

  async get<T>(path: string, config = {}) {
    try {
      const response = await this.client.get<T>(path, config)
      return { data: response.data, status: response.status }
    } catch (error) {
      return this.handleError(error)
    }
  }

  async post<T>(path: string, data?: any, config = {}) {
    try {
      const response = await this.client.post<T>(path, data, config)
      return { data: response.data, status: response.status }
    } catch (error) {
      return this.handleError(error)
    }
  }

  async put<T>(path: string, data?: any, config = {}) {
    try {
      const response = await this.client.put<T>(path, data, config)
      return { data: response.data, status: response.status }
    } catch (error) {
      return this.handleError(error)
    }
  }

  async delete<T>(path: string, config = {}) {
    try {
      const response = await this.client.delete<T>(path, config)
      return { data: response.data, status: response.status }
    } catch (error) {
      return this.handleError(error)
    }
  }

  private handleError(error: any) {
    const message =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message ||
      'An error occurred'
    
    console.error('API Error:', message)
    
    return {
      data: null,
      status: error.response?.status || 500,
      error: message,
    }
  }
}

export const apiClient = new ApiClient(API_BASE_URL)

export async function checkApiHealth() {
  try {
    const { status } = await apiClient.get('/api/health')
    return status === 200
  } catch {
    return false
  }
}
