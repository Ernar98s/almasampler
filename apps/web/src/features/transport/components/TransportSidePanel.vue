<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@/entities/project/project.store';
import { useHoldStepper } from '@/shared/use-hold-stepper';

const projectStore = useProjectStore();
const { hasLoadedSample, projectBpm, metronomeEnabled } =
  storeToRefs(projectStore);

const bpmStepper = useHoldStepper((delta) => {
  projectStore.updateProjectBpm(projectBpm.value + delta);
});
</script>

<template>
  <aside class="transport-side-panel">
    <div class="transport-side-card">
      <span class="transport-label">BPM</span>
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
      Metronome
    </button>
  </aside>
</template>
