<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { PAD_KEY_CODES, useProjectStore } from '@/entities/project/project.store';

const projectStore = useProjectStore();
const { pads, selectedSliceId, slices, hasLoadedSample, hoveredPadId } = storeToRefs(projectStore);

const padView = computed(() =>
  pads.value.slice(0, 9).map((pad, index) => ({
    ...pad,
    slice: slices.value.find((slice) => slice.id === pad.sliceId)
  }))
);

function getPadActiveStyle(color?: string) {
  if (!color) {
    return undefined;
  }

  return {
    background: color,
    borderColor: color
  };
}

function onKeydown(event: KeyboardEvent) {
  if (!hasLoadedSample.value) {
    return;
  }

  if (event.repeat) {
    return;
  }

  const normalizedCode = event.code.startsWith('Numpad')
    ? `Digit${event.code.replace('Numpad', '')}`
    : event.code;
  const padIndex = PAD_KEY_CODES.indexOf(normalizedCode as (typeof PAD_KEY_CODES)[number]);
  const pad = padIndex >= 0 ? pads.value[padIndex] : undefined;

  if (!pad) {
    return;
  }

  event.preventDefault();
  void projectStore.triggerPad(pad.id);
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="pad-section">
    <div class="pads-grid pads-grid--row">
      <button
        v-for="pad in padView"
        :key="pad.id"
        class="pad-button"
        :class="{
          'pad-button--active': pad.slice?.id === selectedSliceId,
          'pad-button--hovered': hoveredPadId === pad.id
        }"
        :style="pad.slice?.id === selectedSliceId ? getPadActiveStyle(pad.slice?.color) : undefined"
        :disabled="!pad.slice"
        @click="projectStore.triggerPad(pad.id)"
        @mouseenter="projectStore.setHoveredPad(pad.id)"
        @mouseleave="projectStore.setHoveredPad(null)"
      >
        <strong>{{ `Pad ${pad.index + 1}` }}</strong>
      </button>
    </div>
  </div>
</template>
