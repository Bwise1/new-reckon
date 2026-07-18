import { apiClient } from '@/lib/api-client';

export interface UserProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  profession?: string;
  phoneNumber?: string;
}

export const userService = {
  getProfile: () =>
    apiClient.get<{ data: { user: UserProfile } }>('/users/profile'),
};
