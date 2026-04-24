<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@/entities/project/project.store';
import SampleUploadPanel from '@/features/sample-upload/components/SampleUploadPanel.vue';
import diceIconUrl from '@/assets/dice-icon.png';
import flagIconUrl from '@/assets/flag-icon.png';
import { useHoldStepper } from '@/shared/use-hold-stepper';
import WaveformCanvas from './WaveformCanvas.vue';

defineProps<{
  waveformPeaks: Float32Array;
  durationSeconds: number;
  zoom: number;
}>();

const projectStore = useProjectStore();
const {
  hasLoadedSample,
  selectedSlice,
  slices,
  isAddingSlice,
  projectBpm,
  metronomeEnabled,
  isRecording,
  isExporting,
  recordingCountdown,
  isRestoringRemoteProject
} = storeToRefs(projectStore);
const bpmStepper = useHoldStepper((delta) => {
  projectStore.updateProjectBpm(projectBpm.value + delta);
});
</script>

<template>
  <div class="stack waveform-panel">
    <div v-if="isRestoringRemoteProject" class="waveform-restore-loader">
      <span class="waveform-restore-loader__spinner" />
      <strong>Loading saved sample...</strong>
    </div>
    <template v-if="hasLoadedSample">
      <div class="waveform-toolbar">
        <div class="waveform-toolbar-group">
          <button
            class="action-button waveform-toolbar-button"
            :class="{ 'toolbar-toggle-active': isAddingSlice }"
            :aria-label="isAddingSlice ? 'Place new slice flag' : 'New slice flag'"
            :title="isAddingSlice ? 'Place new slice flag' : 'New slice flag'"
            :data-tooltip="isAddingSlice ? 'Place new slice flag' : 'New slice flag'"
            @click="projectStore.toggleAddSliceMode()"
          >
            <img class="toolbar-icon toolbar-icon--flag" :src="flagIconUrl" alt="" />
            <svg class="toolbar-icon toolbar-icon--overlay" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M18 8v8M14 12h8"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-width="1.9"
              />
            </svg>
          </button>
          <button
            class="action-button waveform-toolbar-button"
            aria-label="Auto flags"
            title="Auto flags"
            data-tooltip="Auto flags"
            @click="projectStore.smartSlice(9)"
          >
            <img class="toolbar-icon toolbar-icon--flag" :src="diceIconUrl" alt="" />
          </button>
          <button
            class="ghost-action-button waveform-toolbar-button"
            :disabled="!selectedSlice || selectedSlice.startTime === 0"
            aria-label="Delete selected flag"
            title="Delete selected flag"
            data-tooltip="Delete selected flag"
            @click="projectStore.deleteSelectedSliceMarker()"
          >
            <img class="toolbar-icon toolbar-icon--flag" :src="flagIconUrl" alt="" />
            <svg class="toolbar-icon toolbar-icon--overlay" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M14 12h8"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-width="1.9"
              />
            </svg>
          </button>
          <button
            class="ghost-action-button waveform-toolbar-button"
            :disabled="slices.length <= 1"
            aria-label="Delete all flags"
            title="Delete all flags"
            data-tooltip="Delete all flags"
            @click="projectStore.deleteAllSliceMarkers()"
          >
            <svg class="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M9 4h6M5 7h14M8 7v11m4-11v11m4-11v11M7 7l.8 12h8.4L17 7"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.9"
              />
            </svg>
          </button>
        </div>
        <div class="waveform-toolbar-group waveform-toolbar-group--right">
          <div class="waveform-bpm-control">
            <button
              class="transport-stepper__button waveform-toolbar-stepper"
              :disabled="!hasLoadedSample"
              aria-label="Decrease BPM"
              title="Decrease BPM"
              data-tooltip="Decrease BPM"
              @pointerdown.prevent="bpmStepper.start(-1)"
              @pointerup="bpmStepper.stop()"
              @pointerleave="bpmStepper.stop()"
              @pointercancel="bpmStepper.stop()"
            >
              -
            </button>
            <button
              class="ghost-action-button waveform-toolbar-bpm waveform-toolbar-hint"
              :disabled="!hasLoadedSample"
              aria-label="Current BPM"
              title="Current BPM"
              data-tooltip="Current BPM"
            >
              {{ hasLoadedSample ? `${projectBpm} BPM` : 'BPM' }}
            </button>
            <button
              class="transport-stepper__button waveform-toolbar-stepper"
              :disabled="!hasLoadedSample"
              aria-label="Increase BPM"
              title="Increase BPM"
              data-tooltip="Increase BPM"
              @pointerdown.prevent="bpmStepper.start(1)"
              @pointerup="bpmStepper.stop()"
              @pointerleave="bpmStepper.stop()"
              @pointercancel="bpmStepper.stop()"
            >
              +
            </button>
          </div>
          <button
            class="ghost-action-button waveform-toolbar-chip waveform-toolbar-hint"
            :class="{ 'toolbar-toggle-active': metronomeEnabled }"
            :disabled="!hasLoadedSample"
            aria-label="Toggle metronome"
            title="Toggle metronome"
            data-tooltip="Toggle metronome"
            @click="projectStore.toggleMetronome()"
          >
            Metro
          </button>
          <button
            class="waveform-record-button"
            :class="{
              'waveform-record-button--active': isRecording,
              'waveform-record-button--countdown': recordingCountdown !== null
            }"
            :disabled="!hasLoadedSample || isExporting"
            :aria-label="isRecording ? 'Stop recording' : recordingCountdown !== null ? 'Recording starts after count-in' : 'Start recording'"
            :title="isRecording ? 'Stop recording' : recordingCountdown !== null ? 'Recording starts after count-in' : 'Start recording'"
            :data-tooltip="isRecording ? 'Stop recording' : recordingCountdown !== null ? 'Recording starts after count-in' : 'Start recording'"
            @click="isRecording ? projectStore.stopRecording() : projectStore.startRecording()"
          >
            <span v-if="recordingCountdown !== null" class="waveform-record-button__count">
              {{ recordingCountdown }}
            </span>
            <span v-else class="waveform-record-button__dot" />
          </button>
        </div>
      </div>

      <div class="waveform-stage">
        <div class="waveform-zoom-controls waveform-zoom-controls--floating">
          <button class="waveform-zoom-button" :disabled="zoom <= 1" @click="projectStore.setZoom(zoom - 1)">
            -
          </button>
          <span class="waveform-zoom-label">{{ zoom }}x</span>
          <button class="waveform-zoom-button" :disabled="zoom >= 6" @click="projectStore.setZoom(zoom + 1)">
            +
          </button>
        </div>
        <WaveformCanvas :waveform-peaks="waveformPeaks" :zoom="zoom" />
      </div>
    </template>
    <SampleUploadPanel v-else />
  </div>
</template>
