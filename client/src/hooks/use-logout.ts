import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

/**
 * Custom hook for handling user logout.
 * Clears all cached data and executes the provided onLogout callback.
 */
export function useLogout(onLogout?: () => void) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/logout");
      return response.json();
    },
    onSuccess: () => {
      queryClient.clear();
      toast({ 
        title: "Logged Out", 
        description: "You have been logged out successfully" 
      });
      if (onLogout) onLogout();
    },
    onError: (error: Error) => {
      toast({ 
        title: "Logout Failed", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });
}
