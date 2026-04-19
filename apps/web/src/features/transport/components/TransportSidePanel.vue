<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@/entities/project/project.store';
import { useHoldStepper } from '@/shared/use-hold-stepper';

const projectStore = useProjectStore();
const { hasLoadedSample, projectBpm, metronomeEnabled, isRecording, isExporting } =
  storeToRefs(projectStore);

const bpmStepper = useHoldStepper((delta) => {
  projectStore.updateProjectBpm(projectBpm.value + delta);
});
</script>

<template>
  <aside class="transport-side-panel">
    <div class="transport-side-card">
      <span class="transport-label">Tempo</span>
      <div class="transport-side-value">{{ projectBpm }}</div>
      <div class="transport-side-buttons">
        <button
          class="transport-stepper__button"
          :disabled="!hasLoadedSample"
          @pointerdown.prevent="bpmStepper.start(-1)"
          @pointerup="bpmStepper.stop()"
          @pointerleave="bpmStepper.stop()"
          @pointercancel="bpmStepper.stop()"
        >
          -
        </button>
        <button
          class="transport-stepper__button"
          :disabled="!hasLoadedSample"
          @pointerdown.prevent="bpmStepper.start(1)"
          @pointerup="bpmStepper.stop()"
          @pointerleave="bpmStepper.stop()"
          @pointercancel="bpmStepper.stop()"
        >
          +
        </button>
      </div>
    </div>

    <button
      class="transport-side-toggle"
      :class="{ 'transport-side-toggle--active': metronomeEnabled }"
      :disabled="!hasLoadedSample"
      @click="projectStore.toggleMetronome()"
    >
      <span class="transport-side-toggle__title">Metronome</span>
      <span class="transport-side-toggle__meta">{{ projectBpm }} BPM · Count 4 beats</span>
    </button>

    <button
      class="transport-side-toggle"
      :class="{ 'transport-recording': isRecording }"
      :disabled="!hasLoadedSample || isExporting"
      @click="isRecording ? projectStore.stopRecording() : projectStore.startRecording()"
    >
      {{ isRecording ? 'Recording...' : 'Record' }}
    </button>

    <a
      class="transport-side-toggle transport-side-link"
      href="https://github.com/Ernar98s/almasampler"
      target="_blank"
      rel="noreferrer"
    >
      Contact / Support
    </a>
  </aside>
</template>
