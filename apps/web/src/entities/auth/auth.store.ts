import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  apiClient,
  clearStoredAuthToken,
  getStoredAuthToken,
  setStoredAuthToken,
  type AuthUser
} from '@/shared/api/api-client';
import { useToastStore } from '@/shared/ui/toast.store';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize(options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }): void;
          prompt(callback?: (notification: {
            isNotDisplayed?: () => boolean;
            isSkippedMoment?: () => boolean;
            isDismissedMoment?: () => boolean;
          }) => void): void;
        };
      };
    };
  }
}

const GOOGLE_SCRIPT_ID = 'google-identity-services';

function loadGoogleIdentityScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google login.')), {
        once: true
      });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Failed to load Google login.')), {
      once: true
    });
    document.head.append(script);
  });
}

export const useAuthStore = defineStore('auth', () => {
  const toastStore = useToastStore();
  const user = ref<AuthUser | null>(null);
  const token = ref(getStoredAuthToken());
  const isLoading = ref(false);
  const errorMessage = ref('');
  const isAuthenticated = computed(() => Boolean(token.value && user.value));

  async function bootstrap() {
    if (!token.value) {
      return;
    }

    isLoading.value = true;
    errorMessage.value = '';

    try {
      const response = await apiClient.getMe();
      user.value = response.user;
    } catch (error) {
      token.value = null;
      user.value = null;
      clearStoredAuthToken();
      errorMessage.value = error instanceof Error ? error.message : 'Failed to restore session.';
      toastStore.show(errorMessage.value);
    } finally {
      isLoading.value = false;
    }
  }

  async function loginWithGoogle() {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    if (!googleClientId) {
      errorMessage.value = 'VITE_GOOGLE_CLIENT_ID is not configured.';
      return false;
    }

    isLoading.value = true;
    errorMessage.value = '';

    try {
      await loadGoogleIdentityScript();

      return await new Promise<boolean>((resolve) => {
        window.google?.accounts?.id?.initialize({
          client_id: googleClientId,
          callback: async (response) => {
            if (!response.credential) {
              errorMessage.value = 'Google did not return a credential.';
              isLoading.value = false;
              resolve(false);
              return;
            }

            try {
              const result = await apiClient.loginWithGoogle(response.credential);
              token.value = result.token;
              user.value = result.user;
              setStoredAuthToken(result.token);
              toastStore.show('Google account connected');
              resolve(true);
            } catch (error) {
              errorMessage.value =
                error instanceof Error ? error.message : 'Google login failed.';
              toastStore.show(errorMessage.value);
              resolve(false);
            } finally {
              isLoading.value = false;
            }
          }
        });
        window.google?.accounts?.id?.prompt((notification: {
          isNotDisplayed?: () => boolean;
          isSkippedMoment?: () => boolean;
          isDismissedMoment?: () => boolean;
        }) => {
          if (
            notification.isNotDisplayed?.() ||
            notification.isSkippedMoment?.() ||
            notification.isDismissedMoment?.()
          ) {
            isLoading.value = false;
            resolve(false);
          }
        });
      });
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Failed to start Google login.';
      toastStore.show(errorMessage.value);
      isLoading.value = false;
      return false;
    }
  }

  function logout() {
    token.value = null;
    user.value = null;
    clearStoredAuthToken();
    toastStore.show('Logged out');
  }

  return {
    bootstrap,
    errorMessage,
    isAuthenticated,
    isLoading,
    loginWithGoogle,
    logout,
    token,
    user
  };
});
