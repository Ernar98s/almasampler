import { onBeforeUnmount, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@/entities/project/project.store';

export function useSpaceWaveformToggle() {
  const projectStore = useProjectStore();
  const { hasLoadedSample, isRecording } = storeToRefs(projectStore);

  function onKeydown(event: KeyboardEvent) {
    if (event.code !== 'Space') {
      return;
    }

    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement
    ) {
      return;
    }

    if (!hasLoadedSample.value) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (isRecording.value) {
      void projectStore.stopRecording();
      return;
    }

    projectStore.stopSequence();
  }

  function onKeyup(event: KeyboardEvent) {
    if (event.code !== 'Space' || !hasLoadedSample.value) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown, true);
    window.addEventListener('keyup', onKeyup, true);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('keyup', onKeyup, true);
  });
}
