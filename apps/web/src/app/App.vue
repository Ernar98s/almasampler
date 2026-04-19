<script setup lang="ts">
import { storeToRefs } from 'pinia';
import PadsPanel from '@/features/pads/components/PadsPanel.vue';
import SampleUploadPanel from '@/features/sample-upload/components/SampleUploadPanel.vue';
import TransportBar from '@/features/transport/components/TransportBar.vue';
import TransportSidePanel from '@/features/transport/components/TransportSidePanel.vue';
import WaveformWorkspace from '@/features/waveform-editor/components/WaveformWorkspace.vue';
import { useProjectStore } from '@/entities/project/project.store';
import { useSpaceWaveformToggle } from './use-space-waveform-toggle';

const projectStore = useProjectStore();
useSpaceWaveformToggle();
const {
  errorMessage,
  sampleFile,
  waveformPeaks,
  zoom,
  isExporting
} = storeToRefs(projectStore);
</script>

<template>
  <div class="app-shell">
    <div class="app-frame">
      <div class="device-shell">
        <TransportBar />

        <main class="device-content">
          <SampleUploadPanel />

          <WaveformWorkspace
            class="device-panel"
            :waveform-peaks="waveformPeaks"
            :duration-seconds="sampleFile?.durationSeconds ?? 0"
            :zoom="zoom"
          />

          <PadsPanel />
        </main>

        <p v-if="isExporting" class="device-status">Rendering WAV export...</p>
        <p v-if="errorMessage" class="error-banner">
          {{ errorMessage }}
        </p>
      </div>

      <TransportSidePanel />
    </div>
  </div>
</template>
