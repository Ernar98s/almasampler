<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@/entities/project/project.store';
import { useToastStore } from '@/shared/ui/toast.store';

const projectStore = useProjectStore();
const toastStore = useToastStore();
const { isDecoding, isReadOnlySharedProject } = storeToRefs(projectStore);
const isMicRecording = ref(false);
const isMicStopping = ref(false);
const mediaRecorder = ref<MediaRecorder | null>(null);
const mediaStream = ref<MediaStream | null>(null);
const recordedChunks = ref<Blob[]>([]);

const canUseMicrophone = computed(
  () =>
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
);

const microphoneLabel = computed(() => {
  if (isMicRecording.value) {
    return isMicStopping.value ? 'Saving...' : 'Stop Recording';
  }

  return canUseMicrophone.value ? 'Record Mic' : 'Mic Requires HTTPS';
});

function getMicrophoneMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac'
  ];

  return candidates.find((value) => MediaRecorder.isTypeSupported(value)) ?? '';
}

function stopMicrophoneTracks() {
  mediaStream.value?.getTracks().forEach((track) => track.stop());
  mediaStream.value = null;
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  await projectStore.loadAudioFile(file);
  input.value = '';
}

async function toggleMicrophoneRecording() {
  if (isDecoding.value || !canUseMicrophone.value) {
    return;
  }

  if (isMicRecording.value && mediaRecorder.value) {
    isMicStopping.value = true;
    mediaRecorder.value.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getMicrophoneMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    recordedChunks.value = [];
    mediaStream.value = stream;
    mediaRecorder.value = recorder;
    isMicRecording.value = true;
    isMicStopping.value = false;

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        recordedChunks.value.push(event.data);
      }
    });

    recorder.addEventListener('stop', async () => {
      try {
        const fallbackType = recorder.mimeType || 'audio/webm';
        const extension = fallbackType.includes('mp4') || fallbackType.includes('aac') ? 'm4a' : 'webm';
        const recordedBlob = new Blob(recordedChunks.value, { type: fallbackType });
        const recordedFile = new File([recordedBlob], `microphone-take.${extension}`, {
          type: fallbackType
        });

        await projectStore.loadAudioFile(recordedFile);
      } catch (error) {
        toastStore.show(error instanceof Error ? error.message : 'Failed to load microphone recording.');
      } finally {
        recordedChunks.value = [];
        mediaRecorder.value = null;
        isMicRecording.value = false;
        isMicStopping.value = false;
        stopMicrophoneTracks();
      }
    });

    recorder.start();
    toastStore.show('Microphone recording started');
  } catch (error) {
    stopMicrophoneTracks();
    mediaRecorder.value = null;
    isMicRecording.value = false;
    isMicStopping.value = false;
    toastStore.show(error instanceof Error ? error.message : 'Microphone access failed.');
  }
}
</script>

<template>
  <div v-if="isReadOnlySharedProject" class="upload-dropzone upload-dropzone--waveform upload-dropzone--readonly">
    <span>Shared Project</span>
    <small>This public link is read-only. Sample editing and uploads are disabled.</small>
  </div>
  <div v-else class="upload-dropzone upload-dropzone--waveform">
    <label class="upload-dropzone__file-trigger">
      <input
        accept=".wav,.mp3,.ogg,.m4a,audio/*"
        class="sr-only"
        type="file"
        @change="onFileChange"
      />
      <span>{{ isDecoding ? 'Decoding audio...' : 'Load Sample' }}</span>
      <small>Drop or choose WAV / MP3 / OGG / M4A, max 6 minutes</small>
    </label>

    <button
      class="upload-dropzone__mic-button"
      type="button"
      :disabled="isDecoding || isMicStopping || !canUseMicrophone"
      :aria-pressed="isMicRecording"
      :title="canUseMicrophone ? (isMicRecording ? 'Stop microphone recording' : 'Record from microphone') : 'Microphone recording needs HTTPS or localhost'"
      @click="toggleMicrophoneRecording"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5v-4a3.5 3.5 0 1 0-7 0v4a3.5 3.5 0 0 0 3.5 3.5Z"
          fill="currentColor"
        />
        <path
          d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3M9 20h6"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.8"
        />
      </svg>
      <span>{{ microphoneLabel }}</span>
    </button>
  </div>
</template>
