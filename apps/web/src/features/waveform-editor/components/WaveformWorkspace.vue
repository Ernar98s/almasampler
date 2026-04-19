<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@/entities/project/project.store';
import SampleUploadPanel from '@/features/sample-upload/components/SampleUploadPanel.vue';
import WaveformCanvas from './WaveformCanvas.vue';

defineProps<{
  waveformPeaks: Float32Array;
  durationSeconds: number;
  zoom: number;
}>();

const projectStore = useProjectStore();
const { hasLoadedSample, selectedSlice, slices, isAddingSlice } = storeToRefs(projectStore);
</script>

<template>
  <div class="stack waveform-panel">
    <template v-if="hasLoadedSample">
      <div class="waveform-toolbar">
        <button
          class="action-button"
          :class="{ 'toolbar-toggle-active': isAddingSlice }"
          @click="projectStore.toggleAddSliceMode()"
        >
          {{ isAddingSlice ? 'Click Waveform...' : 'New Slice' }}
        </button>
        <button class="action-button" @click="projectStore.smartSlice(9)">Auto flags</button>
        <button
          class="ghost-action-button"
          :disabled="!selectedSlice || selectedSlice.startTime === 0"
          @click="projectStore.deleteSelectedSliceMarker()"
        >
          Delete selected flag
        </button>
        <button class="ghost-action-button" :disabled="slices.length <= 1" @click="projectStore.deleteAllSliceMarkers()">
          Delete all
        </button>
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
