"use client";

import { ApiService } from "./api.service";

// Environment variables should be defined in .env.local or .env files
// The API_URL would typically be something like:
// - Development: http://localhost:3001
// - Production: https://api.example.com
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Create a default API service instance for common use
export const api = new ApiService(API_URL);

// Export the service classes for custom instances
export { ApiService };

// Export type definitions
export type { AxiosRequestConfig, AxiosResponse } from "axios";
