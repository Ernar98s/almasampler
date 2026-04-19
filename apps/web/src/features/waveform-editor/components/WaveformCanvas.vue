<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@/entities/project/project.store';

const props = defineProps<{
  waveformPeaks: Float32Array;
  zoom: number;
}>();

const projectStore = useProjectStore();
const { sampleFile, selectedSliceId, sliceMarkers, slices, isAddingSlice } = storeToRefs(projectStore);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const viewportRef = ref<HTMLDivElement | null>(null);
const draggingMarkerIndex = ref<number | null>(null);

const totalDuration = computed(() => sampleFile.value?.durationSeconds ?? 0);
const canvasWidth = computed(() => {
  const viewport = viewportRef.value;
  if (!viewport) {
    return 320;
  }

  return Math.max(320, Math.floor(viewport.clientWidth * props.zoom));
});

function getCanvasMetrics(canvas: HTMLCanvasElement, viewport: HTMLDivElement) {
  const rect = canvas.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  const width = Math.max(320, Math.floor(viewport.clientWidth * props.zoom));
  const height = Math.max(160, Math.floor(rect.height));
  return { rect, viewportRect, width, height, scrollLeft: viewport.scrollLeft };
}

function timeToX(time: number, width: number) {
  if (!totalDuration.value) {
    return 0;
  }

  return (time / totalDuration.value) * width;
}

function xToTime(clientX: number, viewportRect: DOMRect, scrollLeft: number) {
  if (!totalDuration.value) {
    return 0;
  }

  const absoluteX = scrollLeft + (clientX - viewportRect.left);
  const clampedX = Math.max(0, Math.min(scrollLeft + viewportRect.width, absoluteX));
  const virtualWidth = Math.max(320, viewportRect.width * props.zoom);
  return (clampedX / virtualWidth) * totalDuration.value;
}

function drawWaveform() {
  const canvas = canvasRef.value;
  const viewport = viewportRef.value;

  if (!canvas || !viewport) {
    return;
  }

  const { width, height } = getCanvasMetrics(canvas, viewport);

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  if (!context) {
    return;
  }

  context.clearRect(0, 0, width, height);
  context.fillStyle = '#0f1720';
  context.fillRect(0, 0, width, height);

  context.strokeStyle = '#1f2c38';
  context.beginPath();
  context.moveTo(0, height / 2);
  context.lineTo(width, height / 2);
  context.stroke();

  if (!props.waveformPeaks.length) {
    context.fillStyle = '#6f8594';
    context.font = '14px sans-serif';
    context.fillText('Upload an audio file to render waveform data.', 24, height / 2 - 12);
    return;
  }

  const bins = props.waveformPeaks;
  const step = bins.length / width;

  context.strokeStyle = '#61d7b7';
  context.lineWidth = 1;

  for (let x = 0; x < width; x += 1) {
    const binIndex = Math.min(bins.length - 1, Math.floor(x * step));
    const amplitude = bins[binIndex] ?? 0;
    const lineHeight = Math.max(1, amplitude * height * 0.46);
    const top = (height - lineHeight) / 2;

    context.beginPath();
    context.moveTo(x + 0.5, top);
    context.lineTo(x + 0.5, top + lineHeight);
    context.stroke();
  }

  for (const slice of slices.value) {
    const startX = timeToX(slice.startTime, width);
    const endX = timeToX(slice.endTime, width);

    if (slice.id === selectedSliceId.value) {
      context.fillStyle = `${slice.color ?? '#f8bb5d'}33`;
      context.fillRect(startX, 0, Math.max(2, endX - startX), height);
    }
  }

  sliceMarkers.value.forEach((markerTime, index) => {
    const x = timeToX(markerTime, width);
    const markerSlice = slices.value[index + 1];
    const isSelected = markerSlice?.id === selectedSliceId.value;
    const markerColor = markerSlice?.color ?? '#ff8c94';

    context.strokeStyle = markerColor;
    context.lineWidth = isSelected ? 2 : 1;
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, height);
    context.stroke();

    context.fillStyle = markerColor;
    context.beginPath();
    context.moveTo(x - 6, 10);
    context.lineTo(x + 6, 10);
    context.lineTo(x, 20);
    context.closePath();
    context.fill();
  });
}

function findMarkerIndex(clientX: number) {
  const canvas = canvasRef.value;
  const viewport = viewportRef.value;

  if (!canvas || !viewport) {
    return -1;
  }

  const { viewportRect, width, scrollLeft } = getCanvasMetrics(canvas, viewport);
  const relativeX = scrollLeft + (clientX - viewportRect.left);

  return sliceMarkers.value.findIndex((markerTime) => Math.abs(timeToX(markerTime, width) - relativeX) <= 8);
}

function onPointerDown(event: PointerEvent) {
  const canvas = canvasRef.value;
  const viewport = viewportRef.value;

  if (!canvas || !viewport || !totalDuration.value) {
    return;
  }

  const markerIndex = findMarkerIndex(event.clientX);

  if (markerIndex >= 0) {
    draggingMarkerIndex.value = markerIndex;
    projectStore.selectSlice(slices.value[markerIndex + 1]?.id ?? null);
    return;
  }

  const { viewportRect, scrollLeft } = getCanvasMetrics(canvas, viewport);
  const time = xToTime(event.clientX, viewportRect, scrollLeft);
  const clickedSlice = slices.value.find((slice) => time >= slice.startTime && time < slice.endTime);

  if (clickedSlice) {
    projectStore.selectSlice(clickedSlice.id);
  }

  if (isAddingSlice.value || event.shiftKey) {
    projectStore.addMarkerAtTime(time);
  }
}

function onPointerMove(event: PointerEvent) {
  const markerIndex = draggingMarkerIndex.value;
  const canvas = canvasRef.value;
  const viewport = viewportRef.value;

  if (markerIndex === null || !canvas || !viewport) {
    return;
  }

  const { viewportRect, scrollLeft } = getCanvasMetrics(canvas, viewport);
  const time = xToTime(event.clientX, viewportRect, scrollLeft);
  projectStore.moveMarker(markerIndex, time);
}

function stopDragging() {
  draggingMarkerIndex.value = null;
}

function onWheel(event: WheelEvent) {
  const viewport = viewportRef.value;

  if (!viewport || !props.waveformPeaks.length) {
    return;
  }

  const isZoomGesture = event.ctrlKey || event.metaKey || Math.abs(event.deltaY) > Math.abs(event.deltaX);

  if (!isZoomGesture) {
    return;
  }

  event.preventDefault();

  const previousZoom = props.zoom;
  const nextZoom = Math.max(1, Math.min(6, previousZoom + (event.deltaY < 0 ? 1 : -1)));

  if (nextZoom === previousZoom) {
    return;
  }

  const rect = viewport.getBoundingClientRect();
  const pointerX = event.clientX - rect.left + viewport.scrollLeft;
  const pointerRatio = pointerX / Math.max(1, viewport.scrollWidth);

  projectStore.setZoom(nextZoom);

  requestAnimationFrame(() => {
    const nextScrollWidth = viewport.scrollWidth;
    viewport.scrollLeft = Math.max(0, pointerRatio * nextScrollWidth - (event.clientX - rect.left));
  });
}

onMounted(drawWaveform);
onMounted(() => {
  const canvas = canvasRef.value;
  const viewport = viewportRef.value;

  if (!canvas || !viewport) {
    return;
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', stopDragging);
});

onBeforeUnmount(() => {
  const canvas = canvasRef.value;
  const viewport = viewportRef.value;

  if (canvas) {
    canvas.removeEventListener('pointerdown', onPointerDown);
  }

  if (viewport) {
    viewport.removeEventListener('wheel', onWheel);
  }

  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', stopDragging);
});

watch(() => [props.waveformPeaks, props.zoom, sliceMarkers.value, selectedSliceId.value], drawWaveform, { deep: false });
</script>

<template>
  <div class="waveform-shell">
    <div ref="viewportRef" class="waveform-viewport">
      <canvas ref="canvasRef" class="waveform-canvas" :style="{ width: `${canvasWidth}px` }" />
    </div>
    <div class="waveform-hint">
      Click to select a part. Use New Slice to place a flag. Drag a flag to move it. Use +/- or trackpad zoom.
    </div>
  </div>
</template>
