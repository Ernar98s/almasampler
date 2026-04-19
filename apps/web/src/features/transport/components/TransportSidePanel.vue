<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@/entities/project/project.store';
import { useHoldStepper } from '@/shared/use-hold-stepper';
import supportGifUrl from '@/assets/support-popup.gif';

const projectStore = useProjectStore();
const { hasLoadedSample, projectBpm, metronomeEnabled, isRecording, isExporting } =
  storeToRefs(projectStore);
const isSupportOpen = ref(false);

const bpmStepper = useHoldStepper((delta) => {
  projectStore.updateProjectBpm(projectBpm.value + delta);
});
</script>

<template>
  <aside class="transport-side-panel">
    <div class="transport-side-card">
      <span class="transport-label">Tempo</span>
      <div class="transport-side-value">
        {{ hasLoadedSample ? projectBpm : '' }}
      </div>
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
      <span class="transport-side-toggle__meta">
        {{ hasLoadedSample ? `${projectBpm} BPM · Count 4 beats` : 'Count 4 beats' }}
      </span>
    </button>

    <button
      class="transport-side-toggle"
      :class="{ 'transport-recording': isRecording }"
      :disabled="!hasLoadedSample || isExporting"
      @click="isRecording ? projectStore.stopRecording() : projectStore.startRecording()"
    >
      {{ isRecording ? 'Recording...' : 'Record' }}
    </button>

    <button
      class="transport-side-toggle transport-side-link"
      type="button"
      @click="isSupportOpen = true"
    >
      Contact / Support
    </button>

    <div
      v-if="isSupportOpen"
      class="support-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-title"
      @click.self="isSupportOpen = false"
    >
      <div class="support-modal__card">
        <button class="support-modal__close" type="button" @click="isSupportOpen = false">
          Close
        </button>

        <img :src="supportGifUrl" alt="Support gif" class="support-modal__gif" />

        <div class="support-modal__copy">
          <h3 id="support-modal-title">Hey friend</h3>
          <p>
            If you enjoyed the project and want to support the author, or if you have any
            feedback, send an email to
            <a href="mailto:oneera.pro@gmail.com">oneera.pro@gmail.com</a>.
          </p>
          <p class="support-modal__donate">
            Want to donate directly?
            <a href="https://boosty.to/onlyoneera/donate" target="_blank" rel="noreferrer">
              Support on Boosty
            </a>
          </p>
        </div>
      </div>
    </div>
  </aside>
</template>
