import { onBeforeUnmount, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@/entities/project/project.store';

export function useSpaceWaveformToggle() {
  const projectStore = useProjectStore();
  const { activeEditorTab, hasLoadedSample, isPreviewPlaying } = storeToRefs(projectStore);

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

    if (!hasLoadedSample.value || activeEditorTab.value !== 'waveform') {
      return;
    }

    event.preventDefault();

    if (isPreviewPlaying.value) {
      projectStore.stopSequence();
      return;
    }

    void projectStore.previewSlice();
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown);
  });
}
