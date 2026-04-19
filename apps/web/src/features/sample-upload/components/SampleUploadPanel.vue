<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@/entities/project/project.store';

const projectStore = useProjectStore();
const { isDecoding, sampleFile, hasLoadedSample, selectedSlice, detectedSampleBpm } =
  storeToRefs(projectStore);

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  await projectStore.loadAudioFile(file);
  input.value = '';
}
</script>

<template>
  <div class="sampler-info stack">
    <label class="upload-dropzone">
      <input
        accept=".wav,.mp3,.ogg,.m4a,audio/*"
        class="sr-only"
        type="file"
        @change="onFileChange"
      />
      <span>{{ isDecoding ? 'Decoding audio...' : 'Load Sample' }}</span>
      <small>WAV / MP3 / OGG / M4A, max 6 minutes</small>
    </label>

    <div class="meta-strip">
      <template v-if="sampleFile">
        <p><strong>{{ sampleFile.name }}</strong></p>
        <p>{{ sampleFile.durationSeconds.toFixed(2) }}s</p>
        <p>{{ sampleFile.sampleRate }} Hz</p>
        <p>BPM {{ detectedSampleBpm ?? 'Unknown' }}</p>
      </template>
      <p v-else>No file loaded yet</p>
    </div>

    <div class="sampler-actions">
      <button class="transport-secondary" :disabled="!hasLoadedSample" @click="projectStore.redetectSampleBpm()">
        Detect BPM Again
      </button>
      <p v-if="selectedSlice">
        Selected {{ selectedSlice.label }}: {{ selectedSlice.startTime.toFixed(2) }}s - {{ selectedSlice.endTime.toFixed(2) }}s
      </p>
      <p v-else>Select a slice on the waveform or tap a pad</p>
    </div>
  </div>
</template>
