import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userService } from '@/services/user.service';
import type { UpdateProfilePayload, ChangePasswordPayload } from '@/services/user.service';

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => userService.getProfile(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateProfilePayload) => userService.updateProfile(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });
}

export function useUploadProfilePicture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => userService.uploadProfilePicture(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: ChangePasswordPayload) => userService.changePassword(data),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => userService.deleteAccount(),
  });
}
