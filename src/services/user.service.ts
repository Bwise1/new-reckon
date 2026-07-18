import { apiClient } from '@/lib/api-client';

export interface UserProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  profession?: string;
  phoneNumber?: string;
  level?: string;
  dateOfBirth?: string;
  emailVerified?: boolean;
  hasPassword?: boolean;
  googleLinked?: boolean;
  appleLinked?: boolean;
  profileCompletion?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  profession?: string;
  level?: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export const userService = {
  getProfile: () =>
    apiClient.get<{ data: { user: UserProfile; profileCompletion: number } }>('/users/profile'),

  updateProfile: (data: UpdateProfilePayload) =>
    apiClient.patch<{ data: { user: UserProfile } }>('/users/profile', data),

  uploadProfilePicture: (file: File) => {
    const formData = new FormData();
    formData.append('profilePicture', file);
    return apiClient.postForm<{ data: { url: string } }>('/users/profile/picture', formData);
  },

  changePassword: (data: ChangePasswordPayload) =>
    apiClient.put<{ message: string }>('/users/profile/password', data),

  deleteAccount: () =>
    apiClient.delete<{ message: string }>('/users/profile'),
};
