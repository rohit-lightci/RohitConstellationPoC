# API Service

This folder contains the API service for communicating with the backend.

## Usage Examples

### Basic usage with the default instance

```typescript
import { api } from "@/services";

// GET request
const fetchData = async () => {
  try {
    const data = await api.get("/users");
    console.log(data);
  } catch (error) {
    console.error("Error fetching users:", error);
  }
};

// POST request
const createUser = async (userData) => {
  try {
    const newUser = await api.post("/users", userData);
    return newUser;
  } catch (error) {
    console.error("Error creating user:", error);
    throw error;
  }
};

// PUT request
const updateUser = async (userId, userData) => {
  try {
    const updatedUser = await api.put(`/users/${userId}`, userData);
    return updatedUser;
  } catch (error) {
    console.error(`Error updating user ${userId}:`, error);
    throw error;
  }
};

// DELETE request
const deleteUser = async (userId) => {
  try {
    await api.delete(`/users/${userId}`);
    return true;
  } catch (error) {
    console.error(`Error deleting user ${userId}:`, error);
    throw error;
  }
};

// File upload
const uploadUserAvatar = async (userId, file) => {
  const formData = new FormData();
  formData.append("avatar", file);

  try {
    const result = await api.uploadFile(`/users/${userId}/avatar`, formData);
    return result;
  } catch (error) {
    console.error("Error uploading avatar:", error);
    throw error;
  }
};
```

### Creating a custom instance

```typescript
import { ApiService } from "@/services";

// Create a custom instance with different base URL or options
const analyticsApi = new ApiService(
  "https://analytics-api.example.com",
  30000, // 30 second timeout
  { "X-Custom-Header": "custom-value" },
);

// Use the custom instance
const fetchAnalytics = async () => {
  try {
    const data = await analyticsApi.get("/dashboard-stats");
    return data;
  } catch (error) {
    console.error("Error fetching analytics:", error);
    throw error;
  }
};
```

## TypeScript Generic Usage

The API methods support TypeScript generics for better type safety:

```typescript
// Define your types
interface User {
  id: string;
  name: string;
  email: string;
}

// Use the type with the API calls
const getUser = async (userId: string): Promise<User> => {
  return api.get<User>(`/users/${userId}`);
};

const createUser = async (userData: Omit<User, "id">): Promise<User> => {
  return api.post<User>("/users", userData);
};
```
