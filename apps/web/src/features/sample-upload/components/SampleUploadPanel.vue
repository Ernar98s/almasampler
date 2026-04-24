<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@/entities/project/project.store';

const projectStore = useProjectStore();
const { isDecoding, isReadOnlySharedProject } = storeToRefs(projectStore);

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
  <div v-if="isReadOnlySharedProject" class="upload-dropzone upload-dropzone--waveform upload-dropzone--readonly">
    <span>Shared Project</span>
    <small>This public link is read-only. Sample editing and uploads are disabled.</small>
  </div>
  <label v-else class="upload-dropzone upload-dropzone--waveform">
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
