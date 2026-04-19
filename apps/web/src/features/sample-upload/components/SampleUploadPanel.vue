<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@/entities/project/project.store';

const projectStore = useProjectStore();
const { isDecoding } = storeToRefs(projectStore);

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
  <label class="upload-dropzone upload-dropzone--waveform">
    <input
      accept=".wav,.mp3,.ogg,.m4a,audio/*"
      class="sr-only"
      type="file"
      @change="onFileChange"
    />
    <span>{{ isDecoding ? 'Decoding audio...' : 'Load Sample' }}</span>
    <small>Drop or choose WAV / MP3 / OGG / M4A, max 6 minutes</small>
  </label>
</template>
