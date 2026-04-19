<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@/entities/project/project.store';
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
    <div class="waveform-panel__header">
      <div>
        <h2>Waveform</h2>
        <p class="panel-copy">Canvas shell for the slice editor. Milestone 2 adds markers, playhead, and zoomed navigation.</p>
      </div>
      <div class="waveform-stats">
        <span>{{ durationSeconds ? `${durationSeconds.toFixed(2)}s loaded` : 'No sample loaded' }}</span>
        <span>{{ waveformPeaks.length }} peak bins</span>
        <span>{{ slices.length }} slices</span>
      </div>
    </div>

    <div class="waveform-toolbar">
      <div class="waveform-zoom-controls">
        <button class="ghost-action-button" :disabled="!hasLoadedSample || zoom <= 1" @click="projectStore.setZoom(zoom - 1)">
          -
        </button>
        <span class="waveform-zoom-label">Zoom {{ zoom }}x</span>
        <button class="ghost-action-button" :disabled="!hasLoadedSample || zoom >= 8" @click="projectStore.setZoom(zoom + 1)">
          +
        </button>
      </div>
      <button
        class="action-button"
        :class="{ 'toolbar-toggle-active': isAddingSlice }"
        :disabled="!hasLoadedSample"
        @click="projectStore.toggleAddSliceMode()"
      >
        {{ isAddingSlice ? 'Click Waveform...' : 'New Slice' }}
      </button>
      <button class="action-button" :disabled="!hasLoadedSample" @click="projectStore.smartSlice(9)">Auto flags</button>
      <button
        class="ghost-action-button"
        :disabled="!hasLoadedSample || !selectedSlice || selectedSlice.startTime === 0"
        @click="projectStore.deleteSelectedSliceMarker()"
      >
        Delete selected flag
      </button>
      <button class="ghost-action-button" :disabled="!hasLoadedSample || slices.length <= 1" @click="projectStore.deleteAllSliceMarkers()">
        Delete all
      </button>
      <button class="ghost-action-button" :disabled="!hasLoadedSample || !selectedSlice" @click="projectStore.previewSlice()">
        Preview slice
      </button>
    </div>

    <WaveformCanvas :waveform-peaks="waveformPeaks" :zoom="zoom" />
  </div>
</template>
