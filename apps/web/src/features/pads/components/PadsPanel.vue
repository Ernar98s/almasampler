<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { PAD_KEY_CODES, useProjectStore } from '@/entities/project/project.store';

const projectStore = useProjectStore();
const { pads, selectedSliceId, slices, hasLoadedSample } = storeToRefs(projectStore);
const padPalette = [
  'pad-theme-orange',
  'pad-theme-amber',
  'pad-theme-lime',
  'pad-theme-green',
  'pad-theme-red',
  'pad-theme-magenta',
  'pad-theme-cyan',
  'pad-theme-chartreuse',
  'pad-theme-gold'
];

const padView = computed(() =>
  pads.value.slice(0, 9).map((pad, index) => ({
    ...pad,
    slice: slices.value.find((slice) => slice.id === pad.sliceId),
    colorClass: padPalette[index % padPalette.length]
  }))
);

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
    <div class="pads-grid pads-grid--nine">
      <button
        v-for="pad in padView"
        :key="pad.id"
        class="pad-button"
        :class="[pad.colorClass, { 'pad-button--active': pad.slice?.id === selectedSliceId }]"
        :disabled="!pad.slice"
        @click="projectStore.triggerPad(pad.id)"
      >
        <strong>{{ pad.index + 1 }}</strong>
        <span>{{ pad.keyBinding.toUpperCase() }}</span>
        <small>
          {{ pad.slice?.label ?? 'Empty' }}
        </small>
      </button>
    </div>
  </div>
</template>
