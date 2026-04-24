<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import PadsPanel from '@/features/pads/components/PadsPanel.vue';
import WaveformWorkspace from '@/features/waveform-editor/components/WaveformWorkspace.vue';
import { useAuthStore } from '@/entities/auth/auth.store';
import { useProjectStore } from '@/entities/project/project.store';
import AppToasts from '@/shared/ui/AppToasts.vue';
import AppSidebar from './AppSidebar.vue';
import { useSpaceWaveformToggle } from './use-space-waveform-toggle';

const authStore = useAuthStore();
const projectStore = useProjectStore();
useSpaceWaveformToggle();
const {
  isAuthenticated,
  token,
  user
} = storeToRefs(authStore);
const {
  errorMessage,
  sampleFile,
  waveformPeaks,
  zoom,
  isExporting
} = storeToRefs(projectStore);
let authSyncVersion = 0;

async function syncProjectWithAuthState() {
  const syncVersion = ++authSyncVersion;

  if (!isAuthenticated.value || !token.value || !user.value) {
    projectStore.resetLocalProject();
    return;
  }

  await projectStore.loadRemoteProject();

  if (syncVersion !== authSyncVersion) {
    return;
  }
}

onMounted(async () => {
  await authStore.bootstrap();
  await syncProjectWithAuthState();
});

watch(
  () => [isAuthenticated.value, token.value, user.value?.id] as const,
  async () => {
    await syncProjectWithAuthState();
  }
);
</script>

<template>
  <div class="app-shell">
    <div class="app-frame">
      <AppSidebar />
      <div class="device-shell">
        <main class="device-content">
          <div class="workspace-stack">
            <WaveformWorkspace
              class="device-panel"
              :waveform-peaks="waveformPeaks"
              :duration-seconds="sampleFile?.durationSeconds ?? 0"
              :zoom="zoom"
            />

            <PadsPanel />
          </div>
        </main>

        <p v-if="isExporting" class="device-status">Rendering WAV export...</p>
        <p v-if="errorMessage" class="error-banner">
          {{ errorMessage }}
        </p>
      </div>
    </div>
    <AppToasts />
  </div>
</template>
