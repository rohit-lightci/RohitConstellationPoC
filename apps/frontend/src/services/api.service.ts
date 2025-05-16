"use client";

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

/**
 * ApiService class providing a wrapper around axios for making HTTP requests to the backend
 */
export class ApiService {
  private axiosInstance: AxiosInstance;

  /**
   * Creates a new ApiService instance
   * @param baseURL The base URL for API requests
   * @param timeout Request timeout in milliseconds (default: 10000)
   * @param headers Additional headers to include with every request
   */
  constructor(
    baseURL: string,
    timeout: number = 360000,
    headers: Record<string, string> = {},
  ) {
    this.axiosInstance = axios.create({
      baseURL,
      timeout,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    });

    // Add request interceptor for adding auth tokens, etc.
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Get token from localStorage or other storage mechanism
        const token =
          typeof window !== "undefined"
            ? localStorage.getItem("auth_token")
            : null;

        // If token exists, add it to the headers
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
      },
      (error) => Promise.reject(error),
    );

    // Add response interceptor for handling common errors
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        // Handle common errors (401, 403, etc.)
        if (error.response) {
          const { status } = error.response;

          // Handle 401 Unauthorized - redirect to login or refresh token
          if (status === 401) {
            console.error("Unauthorized access. Redirecting to login...");
            // Add logic for redirecting to login or refreshing token
          }

          // Handle 403 Forbidden
          if (status === 403) {
            console.error("Forbidden resource");
            // Add logic for handling forbidden resources
          }

          // Handle 500 Server Error
          if (status >= 500) {
            console.error("Server error occurred");
            // Add logic for handling server errors
          }
        }

        return Promise.reject(error);
      },
    );
  }

  /**
   * Makes a GET request to the specified endpoint
   * @param url The endpoint URL (will be appended to baseURL)
   * @param config Optional axios config overrides
   * @returns Promise with the response data
   */
  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.get(
      url,
      config,
    );
    return response.data;
  }

  /**
   * Makes a POST request to the specified endpoint
   * @param url The endpoint URL (will be appended to baseURL)
   * @param data The data to send in the request body
   * @param config Optional axios config overrides
   * @returns Promise with the response data
   */
  public async post<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.post(
      url,
      data,
      config,
    );
    return response.data;
  }

  /**
   * Makes a PUT request to the specified endpoint
   * @param url The endpoint URL (will be appended to baseURL)
   * @param data The data to send in the request body
   * @param config Optional axios config overrides
   * @returns Promise with the response data
   */
  public async put<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.put(
      url,
      data,
      config,
    );
    return response.data;
  }

  /**
   * Makes a PATCH request to the specified endpoint
   * @param url The endpoint URL (will be appended to baseURL)
   * @param data The data to send in the request body
   * @param config Optional axios config overrides
   * @returns Promise with the response data
   */
  public async patch<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.patch(
      url,
      data,
      config,
    );
    return response.data;
  }

  /**
   * Makes a DELETE request to the specified endpoint
   * @param url The endpoint URL (will be appended to baseURL)
   * @param config Optional axios config overrides
   * @returns Promise with the response data
   */
  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.delete(
      url,
      config,
    );
    return response.data;
  }

  /**
   * Makes a multipart form data request (for file uploads)
   * @param url The endpoint URL (will be appended to baseURL)
   * @param formData FormData object containing the files and other form fields
   * @param config Optional axios config overrides
   * @returns Promise with the response data
   */
  public async uploadFile<T>(
    url: string,
    formData: FormData,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const uploadConfig: AxiosRequestConfig = {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      ...config,
    };

    const response: AxiosResponse<T> = await this.axiosInstance.post(
      url,
      formData,
      uploadConfig,
    );
    return response.data;
  }
}
