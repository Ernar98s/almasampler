<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@/entities/project/project.store';

const projectStore = useProjectStore();
const {
  hasLoadedSample,
  projectBpm,
  metronomeEnabled,
  detectedSampleBpm,
  isExporting
} =
  storeToRefs(projectStore);
</script>

<template>
  <header class="transport-bar">
    <div class="transport-brand-block">
      <div class="transport-brand">Almasampler</div>
      <p class="transport-copy">
        Lightweight browser sampler for chopping, pad performance and WAV bounce.
      </p>
    </div>

    <div class="transport-controls transport-controls--overview">
      <div class="transport-cluster transport-cluster--pill">
        <span class="transport-label">Sample BPM</span>
        <strong>{{ projectBpm }} BPM</strong>
        <span class="transport-cluster__meta">
          Detected {{ detectedSampleBpm ?? '--' }} BPM
        </span>
      </div>

      <div class="transport-cluster transport-cluster--pill">
        <span class="transport-label">Metronome</span>
        <strong>Count 4</strong>
        <span class="transport-cluster__meta">
          {{ metronomeEnabled ? 'Enabled' : 'Disabled' }}
        </span>
      </div>

      <button
        class="transport-secondary"
        :disabled="!hasLoadedSample"
        @click="projectStore.stopSequence()"
      >
        Stop
      </button>
    </div>
  </header>
</template>
