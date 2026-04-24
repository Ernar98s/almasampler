import { ref } from 'vue';
import { defineStore } from 'pinia';

type Toast = {
  id: string;
  message: string;
};

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([]);

  function show(message: string, durationMs = 2600) {
    const id = crypto.randomUUID();

    toasts.value = [...toasts.value, { id, message }];

    window.setTimeout(() => {
      dismiss(id);
    }, durationMs);
  }

  function dismiss(id: string) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  return {
    dismiss,
    show,
    toasts
  };
});
