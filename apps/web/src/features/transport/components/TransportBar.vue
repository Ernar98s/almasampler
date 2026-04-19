<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@/entities/project/project.store';
import { useHoldStepper } from '@/shared/use-hold-stepper';

const projectStore = useProjectStore();
const {
  hasLoadedSample,
  projectBpm,
  metronomeEnabled,
  detectedSampleBpm,
  recordedHitCount,
  isRecording,
  isExporting
} =
  storeToRefs(projectStore);

const bpmStepper = useHoldStepper((delta) => {
  projectStore.updateProjectBpm(projectBpm.value + delta);
});
</script>

<template>
  <header class="transport-bar">
    <div class="transport-brand">Almasampler</div>

    <div class="transport-controls">
      <div class="transport-cluster">
        <span class="transport-label">BPM</span>
        <div class="transport-stepper">
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
          <strong>{{ projectBpm }}</strong>
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
        class="transport-toggle"
        :class="{ 'transport-toggle--active': metronomeEnabled }"
        :disabled="!hasLoadedSample"
        @click="projectStore.toggleMetronome()"
      >
        Metronome
      </button>

      <button
        class="transport-toggle"
        :class="{ 'transport-recording': isRecording }"
        :disabled="!hasLoadedSample || isExporting"
        @click="isRecording ? projectStore.stopRecording() : projectStore.startRecording()"
      >
        {{ isRecording ? 'Recording...' : 'Record' }}
      </button>

      <button
        class="transport-secondary"
        :disabled="!hasLoadedSample"
        @click="projectStore.stopSequence()"
      >
        Stop
      </button>

      <div class="transport-mini-readout">
        <span>Sample {{ detectedSampleBpm ?? '--' }}</span>
        <span>{{ isRecording ? `Hits ${recordedHitCount}` : 'Sampler Ready' }}</span>
        <span v-if="isExporting">WAV...</span>
      </div>
    </div>
  </header>
</template>
