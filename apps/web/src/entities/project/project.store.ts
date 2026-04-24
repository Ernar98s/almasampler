import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type {
  NoteEvent,
  Pad,
  PianoRollState,
  RecordedPadHit,
  RecordedPerformance,
  SampleFile,
  Slice
} from '@almasampler/shared';
import { decodeAudioFile } from '@/shared/audio/decode-audio-file';
import { detectApproximateBpm } from '@/shared/audio/detect-bpm';
import { playMetronomeSample } from '@/shared/audio/metronome-sample';
import { renderMonophonicPerformanceToWav } from '@/shared/audio/render-monophonic-performance';
import { renderArrangementToWav } from '@/shared/audio/render-arrangement';
import { buildWaveformPeaks } from '@/shared/audio/waveform-peaks';
import { playBufferSlice, stopPlayback as stopAudioPlayback } from '@/shared/audio/sample-playback';
import { apiClient, getStoredAuthToken, type RemoteProject } from '@/shared/api/api-client';
import { useToastStore } from '@/shared/ui/toast.store';

const MAX_DURATION_SECONDS = 6 * 60;
const PAD_COUNT = 9;
const LEAD_IN_SLICE_COUNT = 1;
const PAD_KEYS = '123456789'.split('');
const PAD_COLORS = [
  '#ff7a11',
  '#ffb400',
  '#d8eb00',
  '#7fc700',
  '#ff3027',
  '#d61e8c',
  '#12b8d1',
  '#9ddb00',
  '#ffb04b'
] as const;
export const PAD_KEY_CODES = [
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9'
] as const;

function projectNameFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || fileName || 'Untitled Project';
}

function createDefaultPads(): Pad[] {
  return Array.from({ length: PAD_COUNT }, (_, index) => ({
    id: `pad-${index + 1}`,
    index,
    keyBinding: PAD_KEYS[index] ?? '',
    rootNote: 60
  }));
}

function deriveBoundariesFromSlices(slices: Slice[], totalDuration: number) {
  const boundaries = [0];

  for (const slice of slices) {
    if (slice.startTime > 0) {
      boundaries.push(slice.startTime);
    }
  }

  boundaries.push(totalDuration);

  return Array.from(new Set(boundaries))
    .map((value) => Math.max(0, Math.min(totalDuration, value)))
    .sort((left, right) => left - right);
}

function createSlicesFromBoundaries(boundaries: number[]): Slice[] {
  return boundaries.slice(0, -1).map((startTime, index) => ({
    id: crypto.randomUUID(),
    startTime,
    endTime: boundaries[index + 1],
    rootNote: 60,
    pitchSemitones: 0,
    color: PAD_COLORS[index % PAD_COLORS.length],
    label: `S${index + 1}`
  }));
}

function rebuildSlicesFromMarkers(markers: number[], totalDuration: number, pads: Pad[]) {
  const boundaries = [0, ...markers, totalDuration]
    .map((value) => Math.max(0, Math.min(totalDuration, value)))
    .sort((left, right) => left - right);
  const uniqueBoundaries = boundaries.filter(
    (value, index) => index === 0 || Math.abs(value - boundaries[index - 1]) > 0.02
  );
  const nextSlices = createSlicesFromBoundaries(uniqueBoundaries);

  return nextSlices.map((slice, index) => ({
    ...slice,
    padId: pads[index]?.id
  }));
}

function rebuildSlicesPreservingPadIdentity(markerSlices: Slice[], totalDuration: number) {
  const sortedMarkers = markerSlices
    .map((slice) => ({
      ...slice,
      startTime: Math.max(0.02, Math.min(totalDuration - 0.02, slice.startTime))
    }))
    .sort((left, right) => left.startTime - right.startTime)
    .map((slice, index, ordered) => ({
      ...slice,
      startTime:
        index === 0 ? slice.startTime : Math.max(slice.startTime, ordered[index - 1]!.startTime + 0.02)
    }));
  const firstStart = sortedMarkers[0]?.startTime ?? totalDuration;
  const leadSlice: Slice = {
    id: crypto.randomUUID(),
    startTime: 0,
    endTime: firstStart,
    rootNote: 60,
    pitchSemitones: 0
  };

  return [
    leadSlice,
    ...sortedMarkers.map((slice, index) => ({
      ...slice,
      endTime: sortedMarkers[index + 1]?.startTime ?? totalDuration
    }))
  ];
}

function createEqualSlices(totalDuration: number, parts: number, pads: Pad[]) {
  const boundaries = Array.from({ length: parts + 1 }, (_, index) => (totalDuration / parts) * index);
  return rebuildSlicesFromMarkers(boundaries.slice(1, -1), totalDuration, pads);
}

function createAutoSlicesFromWaveform(
  waveformPeaks: Float32Array,
  totalDuration: number,
  parts: number,
  pads: Pad[]
) {
  if (!waveformPeaks.length || parts < 2) {
    return createEqualSlices(totalDuration, Math.max(1, parts), pads);
  }

  const desiredMarkers = Math.max(0, parts - 1);
  const chunkSize = Math.max(8, Math.floor(waveformPeaks.length / parts));
  const markers: number[] = [];

  for (let partIndex = 1; partIndex <= desiredMarkers; partIndex += 1) {
    const center = Math.floor((waveformPeaks.length * partIndex) / parts);
    const start = Math.max(1, center - Math.floor(chunkSize / 2));
    const end = Math.min(waveformPeaks.length - 2, center + Math.floor(chunkSize / 2));
    let bestIndex = center;
    let bestScore = -1;

    for (let peakIndex = start; peakIndex <= end; peakIndex += 1) {
      const score = (waveformPeaks[peakIndex] ?? 0) + Math.random() * 0.12;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = peakIndex;
      }
    }

    markers.push((bestIndex / waveformPeaks.length) * totalDuration);
  }

  return rebuildSlicesFromMarkers(markers, totalDuration, pads);
}

export const useProjectStore = defineStore('project', () => {
  const toastStore = useToastStore();
  const projectName = ref('Untitled Project');
  const sampleFile = ref<SampleFile | null>(null);
  const sourceSampleFile = ref<File | null>(null);
  const audioBuffer = ref<AudioBuffer | null>(null);
  const waveformPeaks = ref<Float32Array>(new Float32Array());
  const errorMessage = ref('');
  const isDecoding = ref(false);
  const zoom = ref(1);
  const pads = ref<Pad[]>(createDefaultPads());
  const slices = ref<Slice[]>([]);
  const selectedSliceId = ref<string | null>(null);
  const hoveredPadId = ref<string | null>(null);
  const projectBpm = ref(120);
  const detectedSampleBpm = ref<number | null>(null);
  const pianoRollState = ref<PianoRollState>({
    totalBars: 4,
    beatsPerBar: 4,
    snapDivisionsPerBeat: 4,
    notes: []
  });
  const selectedNoteId = ref<string | null>(null);
  const activeEditorTab = ref<'waveform' | 'piano-roll'>('waveform');
  const isAddingSlice = ref(false);
  const playbackCursorBeat = ref(-1);
  const isPreviewPlaying = ref(false);
  const isSequencePlaying = ref(false);
  const isRecording = ref(false);
  const recordingCountdown = ref<number | null>(null);
  const metronomeEnabled = ref(false);
  const isExporting = ref(false);
  const activePadPlayback = ref<{
    padId: string;
    sliceId: string;
    progress: number;
    color?: string;
  } | null>(null);
  let sequenceTimeouts: number[] = [];
  let sequenceCursorInterval: number | null = null;
  let recordingStartedAt = 0;
  let recordingCountdownTimeout: number | null = null;
  let passiveMetronomeTimeout: number | null = null;
  let recordingMetronomeInterval: number | null = null;
  let activePadPlaybackFrame: number | null = null;
  let activePadPlaybackToken = 0;
  let persistProjectStateTimeout: number | null = null;
  let pendingDragHistorySliceId: string | null = null;
  const flagHistory = ref<Array<{
    slices: Slice[];
    pads: Pad[];
    selectedSliceId: string | null;
  }>>([]);
  const isRestoringRemoteProject = ref(false);
  const isReadOnlySharedProject = ref(false);
  const sharedProjectId = ref<string | null>(null);
  const shareId = ref<string | null>(null);
  const recordedHits = ref<Array<{ padId: string; startMs: number; endMs: number | null }>>([]);
  const lastRecording = ref<RecordedPerformance | null>(null);
  const recordedHitCount = computed(() => recordedHits.value.length);

  const hasLoadedSample = computed(() => Boolean(sampleFile.value && audioBuffer.value));
  const selectedSlice = computed(
    () => slices.value.find((slice) => slice.id === selectedSliceId.value) ?? null
  );
  const sliceMarkers = computed(() =>
    slices.value.slice(1).map((slice) => slice.startTime)
  );
  const selectedNote = computed(
    () => pianoRollState.value.notes.find((note) => note.id === selectedNoteId.value) ?? null
  );
  const padMappedSlices = computed(() => slices.value.slice(getPadSliceOffset()));
  const canUndoFlagChange = computed(() => flagHistory.value.length > 0);
  const canReplayLastRecording = computed(
    () => Boolean(lastRecording.value?.hits.length && audioBuffer.value)
  );
  const canEditProject = computed(() => !isReadOnlySharedProject.value);

  function getPadSliceOffset() {
    return slices.value.length > LEAD_IN_SLICE_COUNT ? LEAD_IN_SLICE_COUNT : 0;
  }

  function getFirstMappedSliceId() {
    return padMappedSlices.value[0]?.id ?? slices.value[0]?.id ?? null;
  }

  function resetLocalProject() {
    if (persistProjectStateTimeout !== null) {
      window.clearTimeout(persistProjectStateTimeout);
      persistProjectStateTimeout = null;
    }

    activePadPlaybackToken += 1;
    clearSequenceTimers();
    clearPadPlaybackProgress();
    clearRecordingCountdown();
    stopPassiveMetronome();

    if (recordingMetronomeInterval !== null) {
      window.clearInterval(recordingMetronomeInterval);
      recordingMetronomeInterval = null;
    }

    void stopPlayback();

    sourceSampleFile.value = null;
    sampleFile.value = null;
    audioBuffer.value = null;
    waveformPeaks.value = new Float32Array();
    errorMessage.value = '';
    isDecoding.value = false;
    zoom.value = 1;
    pads.value = createDefaultPads();
    slices.value = [];
    selectedSliceId.value = null;
    hoveredPadId.value = null;
    projectName.value = 'Untitled Project';
    projectBpm.value = 120;
    detectedSampleBpm.value = null;
    pianoRollState.value.notes = [];
    selectedNoteId.value = null;
    activeEditorTab.value = 'waveform';
    isAddingSlice.value = false;
    playbackCursorBeat.value = -1;
    isPreviewPlaying.value = false;
    isSequencePlaying.value = false;
    isRecording.value = false;
    recordingCountdown.value = null;
    metronomeEnabled.value = false;
    isExporting.value = false;
    activePadPlayback.value = null;
    recordedHits.value = [];
    lastRecording.value = null;
    isReadOnlySharedProject.value = false;
    sharedProjectId.value = null;
    shareId.value = null;
  }

  function hasBackendSession() {
    return Boolean(getStoredAuthToken()) && !isReadOnlySharedProject.value;
  }

  function cloneSlices(nextSlices: Slice[]) {
    return nextSlices.map((slice) => ({ ...slice }));
  }

  function clonePads(nextPads: Pad[]) {
    return nextPads.map((pad) => ({ ...pad }));
  }

  function pushFlagHistory() {
    if (!slices.value.length) {
      return;
    }

    const snapshot = {
      slices: cloneSlices(slices.value),
      pads: clonePads(pads.value),
      selectedSliceId: selectedSliceId.value
    };

    flagHistory.value = [...flagHistory.value.slice(-4), snapshot];
  }

  function beginMarkerDrag(sliceId: string) {
    if (pendingDragHistorySliceId === sliceId) {
      return;
    }

    pushFlagHistory();
    pendingDragHistorySliceId = sliceId;
  }

  function endMarkerDrag() {
    pendingDragHistorySliceId = null;
  }

  function undoFlagChange() {
    const previousState = flagHistory.value[flagHistory.value.length - 1];

    if (!previousState) {
      return;
    }

    flagHistory.value = flagHistory.value.slice(0, -1);
    slices.value = cloneSlices(previousState.slices);
    pads.value = clonePads(previousState.pads);
    selectedSliceId.value = previousState.selectedSliceId;
    pendingDragHistorySliceId = null;
    schedulePersistProjectState();
    toastStore.show('Flag change undone');
  }

  function schedulePersistProjectState(delayMs = 450) {
    if (!hasBackendSession() || isRestoringRemoteProject.value) {
      return;
    }

    if (persistProjectStateTimeout !== null) {
      window.clearTimeout(persistProjectStateTimeout);
    }

    persistProjectStateTimeout = window.setTimeout(() => {
      persistProjectStateTimeout = null;
      void persistProjectState();
    }, delayMs);
  }

  async function persistProjectState() {
    if (!hasBackendSession()) {
      return;
    }

    try {
      await apiClient.saveProjectState({
        name: projectName.value,
        bpm: projectBpm.value,
        slices: slices.value,
        pads: pads.value,
        waveformZoom: zoom.value,
        selectedSliceId: selectedSliceId.value,
        sampleDurationSeconds: sampleFile.value?.durationSeconds ?? null
      });
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Failed to save project.';
      toastStore.show(errorMessage.value);
    }
  }

  async function uploadCurrentSampleFile() {
    if (!hasBackendSession() || !sourceSampleFile.value || !sampleFile.value) {
      return;
    }

    try {
      await apiClient.uploadSample(sourceSampleFile.value, sampleFile.value.durationSeconds);
      await persistProjectState();
      toastStore.show('Sample saved to project');
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Failed to upload sample.';
      toastStore.show(errorMessage.value);
    }
  }

  function applyRemoteProjectState(project: RemoteProject) {
    shareId.value = project.shareId ?? null;
    projectName.value =
      project.name && project.name !== 'Untitled Project'
        ? project.name
        : project.sampleOriginalName
          ? projectNameFromFileName(project.sampleOriginalName)
          : 'Untitled Project';
    projectBpm.value = project.bpm;
    lastRecording.value = project.latestRecording ?? null;
    zoom.value = Math.min(6, Math.max(1, project.waveformZoom ?? zoom.value));

    if (project.pads?.length) {
      pads.value = project.pads;
    }

    if (project.slices?.length) {
      slices.value = project.slices;
      selectedSliceId.value = project.selectedSliceId ?? getFirstMappedSliceId();
    }
  }

  async function restoreProjectSample(project: RemoteProject, blob: Blob) {
    const restoredFile = new File(
      [blob],
      project.sampleOriginalName || 'restored-sample',
      { type: project.sampleMimeType || blob.type || 'audio/mpeg' }
    );
    const decoded = await decodeAudioFile(restoredFile);

    sourceSampleFile.value = restoredFile;
    projectName.value = project.name || projectNameFromFileName(restoredFile.name);
    sampleFile.value = decoded.metadata;
    audioBuffer.value = decoded.audioBuffer;
    waveformPeaks.value = buildWaveformPeaks(decoded.audioBuffer, 768);
    detectedSampleBpm.value = detectApproximateBpm(decoded.audioBuffer);
    applyRemoteProjectState(project);
    syncPadsToExistingSliceAssignments();
  }

  async function loadRemoteProject() {
    if (!hasBackendSession()) {
      return;
    }

    errorMessage.value = '';
    isRestoringRemoteProject.value = true;

    try {
      resetLocalProject();
      isRestoringRemoteProject.value = true;
      const project = await apiClient.getProject();
      applyRemoteProjectState(project);

      if (project.samplePath) {
        const blob = await apiClient.downloadSample();

        if (blob) {
          await restoreProjectSample(project, blob);
        }
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Failed to load saved project.';
      toastStore.show(errorMessage.value);
    } finally {
      isRestoringRemoteProject.value = false;
    }
  }

  async function syncAuthenticatedProject() {
    if (!hasBackendSession()) {
      return;
    }

    await loadRemoteProject();
  }

  async function loadSharedProject(nextSharedProjectId: string) {
    errorMessage.value = '';
    isRestoringRemoteProject.value = true;

    try {
      resetLocalProject();
      isRestoringRemoteProject.value = true;
      isReadOnlySharedProject.value = true;
      sharedProjectId.value = nextSharedProjectId;
      const project = await apiClient.getSharedProject(nextSharedProjectId);
      applyRemoteProjectState(project);

      if (project.samplePath) {
        const blob = await apiClient.downloadSharedSample(nextSharedProjectId);

        if (blob) {
          await restoreProjectSample(project, blob);
        }
      }
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : 'Failed to load shared project.';
      toastStore.show(errorMessage.value);
    } finally {
      isRestoringRemoteProject.value = false;
    }
  }

  async function createShareLink() {
    if (!hasBackendSession()) {
      throw new Error('Sign in before sharing a project.');
    }

    const response = await apiClient.createShareLink();
    shareId.value = response.shareId;
    return `${window.location.origin}${response.sharePath}`;
  }

  async function deleteProject() {
    if (!hasBackendSession()) {
      throw new Error('Sign in before deleting a project.');
    }

    await apiClient.deleteProject();
    resetLocalProject();
  }

  async function saveLocalProjectToBackend() {
    try {
      await uploadCurrentSampleFile();
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Failed to sync project.';
      toastStore.show(errorMessage.value);
    }
  }

  async function loadAudioFile(file: File) {
    errorMessage.value = '';
    isDecoding.value = true;

    try {
      const decoded = await decodeAudioFile(file);

      if (decoded.metadata.durationSeconds > MAX_DURATION_SECONDS) {
        throw new Error('Audio file must be 6 minutes or shorter.');
      }

      sourceSampleFile.value = file;
      projectName.value = projectNameFromFileName(file.name);
      sampleFile.value = decoded.metadata;
      audioBuffer.value = decoded.audioBuffer;
      waveformPeaks.value = buildWaveformPeaks(decoded.audioBuffer, 768);
      pads.value = createDefaultPads();
      slices.value = createEqualSlices(
        decoded.metadata.durationSeconds,
        PAD_COUNT + LEAD_IN_SLICE_COUNT,
        pads.value
      );
      assignSlicesToPads();
      selectedSliceId.value = getFirstMappedSliceId();
      detectedSampleBpm.value = detectApproximateBpm(decoded.audioBuffer);
      projectBpm.value = detectedSampleBpm.value;
      pianoRollState.value.notes = [];
      selectedNoteId.value = null;
      await uploadCurrentSampleFile();
      toastStore.show('Sample loaded');
    } catch (error) {
      sourceSampleFile.value = null;
      projectName.value = 'Untitled Project';
      sampleFile.value = null;
      audioBuffer.value = null;
      waveformPeaks.value = new Float32Array();
      slices.value = [];
      selectedSliceId.value = null;
      detectedSampleBpm.value = null;
      pianoRollState.value.notes = [];
      selectedNoteId.value = null;
      errorMessage.value =
        error instanceof Error ? error.message : 'Failed to decode the selected audio file.';
      toastStore.show(errorMessage.value);
    } finally {
      isDecoding.value = false;
    }
  }

  function setZoom(nextZoom: number) {
    zoom.value = Math.min(6, Math.max(1, nextZoom));
    schedulePersistProjectState();
  }

  function selectSlice(sliceId: string | null) {
    selectedSliceId.value = sliceId;
    schedulePersistProjectState();
  }

  function setHoveredPad(padId: string | null) {
    hoveredPadId.value = padId;
  }

  function selectNote(noteId: string | null) {
    selectedNoteId.value = noteId;
  }

  function setActiveEditorTab(tab: 'waveform' | 'piano-roll') {
    activeEditorTab.value = tab;
  }

  function toggleAddSliceMode() {
    isAddingSlice.value = !isAddingSlice.value;
  }

  function assignSlicesToPads() {
    const offset = getPadSliceOffset();

    pads.value = pads.value.map((pad, index) => ({
      ...pad,
      sliceId: slices.value[index + offset]?.id
    }));

    slices.value = slices.value.map((slice, index) => ({
      ...slice,
      padId: pads.value[index - offset]?.id,
      color: index >= offset ? PAD_COLORS[(index - offset) % PAD_COLORS.length] : undefined
    }));
  }

  function syncPadsToExistingSliceAssignments() {
    pads.value = pads.value.map((pad) => ({
      ...pad,
      sliceId: slices.value.find((slice) => slice.padId === pad.id)?.id
    }));
  }

  function updateProjectBpm(nextBpm: number) {
    projectBpm.value = Math.min(220, Math.max(40, Math.round(nextBpm || 120)));
    schedulePersistProjectState();

    if (metronomeEnabled.value && !isRecording.value && !isSequencePlaying.value) {
      restartPassiveMetronome();
    }
  }

  function toggleMetronome() {
    metronomeEnabled.value = !metronomeEnabled.value;

    if (metronomeEnabled.value) {
      restartPassiveMetronome();
      return;
    }

    stopPassiveMetronome();

    if (recordingMetronomeInterval !== null) {
      window.clearInterval(recordingMetronomeInterval);
      recordingMetronomeInterval = null;
    }
  }

  function stopPassiveMetronome() {
    if (passiveMetronomeTimeout !== null) {
      window.clearTimeout(passiveMetronomeTimeout);
      passiveMetronomeTimeout = null;
    }
  }

  function clearRecordingCountdown() {
    if (recordingCountdownTimeout !== null) {
      window.clearTimeout(recordingCountdownTimeout);
      recordingCountdownTimeout = null;
    }

    recordingCountdown.value = null;
  }

  function schedulePassiveMetronomeBeat(beatIndex: number) {
    if (!metronomeEnabled.value || isRecording.value || isSequencePlaying.value) {
      passiveMetronomeTimeout = null;
      return;
    }

    void playMetronomeClick(beatIndex % pianoRollState.value.beatsPerBar === 0);
    passiveMetronomeTimeout = window.setTimeout(() => {
      schedulePassiveMetronomeBeat(beatIndex + 1);
    }, (60 * 1000) / projectBpm.value);
  }

  function restartPassiveMetronome() {
    stopPassiveMetronome();

    if (!metronomeEnabled.value || isRecording.value || isSequencePlaying.value) {
      return;
    }

    schedulePassiveMetronomeBeat(0);
  }

  function getSlicePlaybackRate(slice: Slice) {
    const sampleBpm = detectedSampleBpm.value ?? projectBpm.value;
    const bpmRatio = projectBpm.value / Math.max(1, sampleBpm);
    return bpmRatio;
  }

  function getPadSlice(padId: string) {
    const pad = pads.value.find((entry) => entry.id === padId);

    if (!pad) {
      return null;
    }

    return slices.value.find((entry) => entry.id === pad.sliceId) ?? null;
  }

  function getNoteDurationSeconds(note: NoteEvent) {
    return (60 / projectBpm.value) * note.durationBeats;
  }

  function getSliceNaturalDurationSeconds(slice: Slice) {
    return (slice.endTime - slice.startTime) / Math.max(0.01, getSlicePlaybackRate(slice));
  }

  function buildRecordedPerformanceFromHits() {
    const hits: RecordedPadHit[] = recordedHits.value
      .filter((hit): hit is { padId: string; startMs: number; endMs: number } => hit.endMs !== null)
      .map((hit) => ({
        padId: hit.padId,
        startMs: hit.startMs,
        endMs: hit.endMs
      }))
      .filter((hit) => hit.endMs > hit.startMs);

    if (!hits.length) {
      return null;
    }

    return {
      bpm: projectBpm.value,
      totalDurationMs: hits[hits.length - 1]!.endMs + 250,
      hits
    } satisfies RecordedPerformance;
  }

  function buildPerformanceClips(recording: RecordedPerformance) {
    if (!audioBuffer.value) {
      return [];
    }

    const oneSampleSeconds = 1 / audioBuffer.value.sampleRate;

    return recording.hits
      .map((hit) => {
        const slice = getPadSlice(hit.padId);

        if (!slice) {
          return null;
        }

        const startSeconds = hit.startMs / 1000;
        const endSeconds = hit.endMs / 1000;
        const naturalDurationSeconds = getSliceNaturalDurationSeconds(slice);
        const heldDurationSeconds = endSeconds - startSeconds;
        const outputDurationSeconds = Math.max(
          0,
          Math.min(naturalDurationSeconds, heldDurationSeconds - oneSampleSeconds)
        );

        return {
          startSeconds,
          outputDurationSeconds,
          sliceStartSeconds: slice.startTime,
          sliceEndSeconds: slice.endTime,
          playbackRate: getSlicePlaybackRate(slice)
        };
      })
      .filter(
        (clip): clip is NonNullable<typeof clip> =>
          clip !== null && clip.outputDurationSeconds > 0
      );
  }

  function clearPadPlaybackProgress() {
    if (activePadPlaybackFrame !== null) {
      window.cancelAnimationFrame(activePadPlaybackFrame);
      activePadPlaybackFrame = null;
    }

    activePadPlayback.value = null;
  }

  function startPadPlaybackProgress(
    padId: string,
    sliceId: string,
    color: string | undefined,
    durationSeconds: number
  ) {
    clearPadPlaybackProgress();

    const token = ++activePadPlaybackToken;
    const startedAt = performance.now();
    const totalDurationMs = Math.max(10, durationSeconds * 1000);

    const tick = () => {
      if (token !== activePadPlaybackToken) {
        return;
      }

      const progress = Math.min(1, (performance.now() - startedAt) / totalDurationMs);
      activePadPlayback.value = {
        padId,
        sliceId,
        progress,
        color
      };

      if (progress < 1) {
        activePadPlaybackFrame = window.requestAnimationFrame(tick);
        return;
      }

      activePadPlaybackFrame = null;
    };

    activePadPlayback.value = {
      padId,
      sliceId,
      progress: 0,
      color
    };
    activePadPlaybackFrame = window.requestAnimationFrame(tick);

    return token;
  }

  function finishPadPlayback(token?: number) {
    if (token !== undefined && token !== activePadPlaybackToken) {
      return;
    }

    clearPadPlaybackProgress();
  }

  async function stopPlayback() {
    clearPadPlaybackProgress();
    isPreviewPlaying.value = false;
    await stopAudioPlayback();
  }

  async function stopActivePlayback() {
    if (isRecording.value || recordingCountdown.value !== null) {
      await stopRecording();
      return;
    }

    stopSequence();
    await stopPlayback();
  }

  async function replayLastRecording() {
    if (!audioBuffer.value || !lastRecording.value?.hits.length) {
      return;
    }

    stopSequence();
    stopPassiveMetronome();
    isSequencePlaying.value = true;

    for (const hit of lastRecording.value.hits) {
      const timeoutId = window.setTimeout(() => {
        const slice = getPadSlice(hit.padId);

        if (!slice || !audioBuffer.value) {
          return;
        }

        selectedSliceId.value = slice.id;
        const playbackToken = startPadPlaybackProgress(
          hit.padId,
          slice.id,
          slice.color,
          Math.max(0.01, (hit.endMs - hit.startMs) / 1000)
        );

        void playBufferSlice({
          audioBuffer: audioBuffer.value,
          startTime: slice.startTime,
          endTime: slice.endTime,
          playbackRate: getSlicePlaybackRate(slice),
          outputDurationSeconds: Math.max(0.01, (hit.endMs - hit.startMs) / 1000),
          onEnded: () => {
            finishPadPlayback(playbackToken);
          }
        });
      }, hit.startMs);

      sequenceTimeouts.push(timeoutId);
    }

    const stopTimeoutId = window.setTimeout(() => {
      stopSequence();
    }, lastRecording.value.totalDurationMs);
    sequenceTimeouts.push(stopTimeoutId);
  }

  async function exportLastRecordingToWav() {
    if (!audioBuffer.value || !sampleFile.value || !lastRecording.value) {
      return;
    }

    isExporting.value = true;
    errorMessage.value = '';

    try {
      const clips = buildPerformanceClips(lastRecording.value);

      if (!clips.length) {
        errorMessage.value = 'Last recording has no playable hits.';
        toastStore.show(errorMessage.value);
        return;
      }

      const wavBlob = await renderMonophonicPerformanceToWav({
        sourceBuffer: audioBuffer.value,
        clips,
        totalDurationSeconds: lastRecording.value.totalDurationMs / 1000
      });
      const objectUrl = URL.createObjectURL(wavBlob);
      const anchor = document.createElement('a');
      const fileName = sampleFile.value.name.replace(/\.[^.]+$/, '') || 'almasampler-performance';

      anchor.href = objectUrl;
      anchor.download = `${fileName}-recording.wav`;
      anchor.click();

      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 1000);
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : 'Failed to export last recording.';
      toastStore.show(errorMessage.value);
    } finally {
      isExporting.value = false;
    }
  }

  async function redetectSampleBpm() {
    if (!audioBuffer.value) {
      return;
    }

    detectedSampleBpm.value = detectApproximateBpm(audioBuffer.value);
  }

  function addMarkerAtTime(time: number) {
    if (!sampleFile.value) {
      return;
    }

    pushFlagHistory();
    const markers = [...sliceMarkers.value, time]
      .filter((value) => value > 0.02 && value < sampleFile.value!.durationSeconds - 0.02);
    slices.value = rebuildSlicesFromMarkers(markers, sampleFile.value.durationSeconds, pads.value);
    assignSlicesToPads();
    const targetSlice = padMappedSlices.value.find((slice) => time >= slice.startTime && time < slice.endTime);
    selectedSliceId.value = targetSlice?.id ?? getFirstMappedSliceId();
    isAddingSlice.value = false;
    schedulePersistProjectState();
  }

  function moveMarker(sliceId: string, nextTime: number) {
    if (!sampleFile.value) {
      return;
    }

    const markers = slices.value.slice(1).map((slice) => ({ ...slice }));
    const markerIndex = markers.findIndex((marker) => marker.id === sliceId);

    if (markerIndex < 0) {
      return;
    }

    markers[markerIndex] = {
      ...markers[markerIndex]!,
      startTime: Math.max(0.02, Math.min(sampleFile.value.durationSeconds - 0.02, nextTime))
    };
    slices.value = rebuildSlicesPreservingPadIdentity(markers, sampleFile.value.durationSeconds);
    syncPadsToExistingSliceAssignments();
    selectedSliceId.value = sliceId;
    schedulePersistProjectState();
  }

  function deleteSelectedSliceMarker() {
    if (!sampleFile.value || !selectedSlice.value) {
      return;
    }

    if (selectedSlice.value.id === getFirstMappedSliceId()) {
      return;
    }

    pushFlagHistory();
    const markers = sliceMarkers.value.filter(
      (markerTime) => Math.abs(markerTime - selectedSlice.value!.startTime) > 0.001
    );

    slices.value = rebuildSlicesFromMarkers(markers, sampleFile.value.durationSeconds, pads.value);
    assignSlicesToPads();
    selectedSliceId.value = getFirstMappedSliceId();
    schedulePersistProjectState();
  }

  function deleteAllSliceMarkers() {
    if (!sampleFile.value) {
      return;
    }

    pushFlagHistory();
    const preservedLeadMarker = sliceMarkers.value[0];
    const markersToKeep =
      preservedLeadMarker !== undefined ? [preservedLeadMarker] : [];

    slices.value = rebuildSlicesFromMarkers(
      markersToKeep,
      sampleFile.value.durationSeconds,
      pads.value
    );
    assignSlicesToPads();
    selectedSliceId.value = getFirstMappedSliceId();
    isAddingSlice.value = false;
    schedulePersistProjectState();
  }

  function autoSlice(parts: 9 | 18 | 27) {
    if (!sampleFile.value) {
      return;
    }

    pushFlagHistory();
    slices.value = createEqualSlices(
      sampleFile.value.durationSeconds,
      parts + LEAD_IN_SLICE_COUNT,
      pads.value
    );
    assignSlicesToPads();
    selectedSliceId.value = getFirstMappedSliceId();
    schedulePersistProjectState();
  }

  function smartSlice(parts: 9 | 18 | 27 = 9) {
    if (!sampleFile.value) {
      return;
    }

    pushFlagHistory();
    slices.value = createAutoSlicesFromWaveform(
      waveformPeaks.value,
      sampleFile.value.durationSeconds,
      parts + LEAD_IN_SLICE_COUNT,
      pads.value
    );
    assignSlicesToPads();
    selectedSliceId.value = getFirstMappedSliceId();
    schedulePersistProjectState();
  }

  async function previewSlice(sliceId = selectedSliceId.value) {
    if (!audioBuffer.value || !sliceId) {
      return;
    }

    const slice = slices.value.find((entry) => entry.id === sliceId);

    if (!slice) {
      return;
    }

    await playBufferSlice({
      audioBuffer: audioBuffer.value,
      startTime: slice.startTime,
      endTime: slice.endTime,
      playbackRate: getSlicePlaybackRate(slice),
      onEnded: () => {
        isPreviewPlaying.value = false;
      }
    });
    isPreviewPlaying.value = true;
  }

  async function previewNote(noteId = selectedNoteId.value) {
    if (!audioBuffer.value || !noteId) {
      return;
    }

    const note = pianoRollState.value.notes.find((entry) => entry.id === noteId);

    if (!note) {
      return;
    }

    const slice = getPadSlice(note.padId);

    if (!slice) {
      return;
    }

    selectedSliceId.value = slice.id;

    await playBufferSlice({
      audioBuffer: audioBuffer.value,
      startTime: slice.startTime,
      endTime: slice.endTime,
      playbackRate: getSlicePlaybackRate(slice),
      outputDurationSeconds: getNoteDurationSeconds(note),
      exclusive: false
    });
  }

  async function triggerPad(padId: string) {
    const pad = pads.value.find((entry) => entry.id === padId);
    const slice = slices.value.find((entry) => entry.id === pad?.sliceId);

    if (!pad || !slice || !audioBuffer.value) {
      return;
    }

    selectedSliceId.value = slice.id;
    isPreviewPlaying.value = true;
    const playbackToken = startPadPlaybackProgress(
      padId,
      slice.id,
      slice.color,
      getSliceNaturalDurationSeconds(slice)
    );

    if (isRecording.value) {
      const elapsedMs = Math.max(0, performance.now() - recordingStartedAt);
      const previousHit = recordedHits.value[recordedHits.value.length - 1];

      if (previousHit && previousHit.endMs === null) {
        previousHit.endMs = elapsedMs;
      }

      recordedHits.value.push({
        padId,
        startMs: elapsedMs,
        endMs: null
      });
    }

    await playBufferSlice({
      audioBuffer: audioBuffer.value,
      startTime: slice.startTime,
      endTime: slice.endTime,
      playbackRate: getSlicePlaybackRate(slice),
      onEnded: () => {
        if (playbackToken === activePadPlaybackToken) {
          isPreviewPlaying.value = false;
        }
        finishPadPlayback(playbackToken);
      }
    });
  }

  function beginRecording() {
    if (!audioBuffer.value) {
      return;
    }

    stopSequence();
    stopPassiveMetronome();
    errorMessage.value = '';

    if (recordingMetronomeInterval !== null) {
      window.clearInterval(recordingMetronomeInterval);
      recordingMetronomeInterval = null;
    }

    isRecording.value = true;
    recordedHits.value = [];
    recordingStartedAt = performance.now();

    if (metronomeEnabled.value) {
      let beatIndex = 0;
      void playMetronomeClick(true);
      recordingMetronomeInterval = window.setInterval(() => {
        beatIndex += 1;
        void playMetronomeClick(beatIndex % pianoRollState.value.beatsPerBar === 0);
      }, (60 * 1000) / projectBpm.value);
    }
  }

  function startRecording() {
    if (!audioBuffer.value) {
      return;
    }

    stopSequence();
    stopPassiveMetronome();
    clearRecordingCountdown();
    errorMessage.value = '';

    const startCountdownStep = (count: number) => {
      recordingCountdown.value = count;

      if (metronomeEnabled.value) {
        void playMetronomeClick(count === 1);
      }

      if (count <= 1) {
        recordingCountdownTimeout = window.setTimeout(() => {
          clearRecordingCountdown();
          beginRecording();
        }, 1000);
        return;
      }

      recordingCountdownTimeout = window.setTimeout(() => {
        startCountdownStep(count - 1);
      }, 1000);
    };

    startCountdownStep(3);
  }

  async function stopRecording() {
    if (!isRecording.value && recordingCountdown.value === null) {
      return;
    }

    clearRecordingCountdown();

    if (!isRecording.value) {
      return;
    }

    isRecording.value = false;
    isPreviewPlaying.value = false;
    await stopPlayback();

    if (recordingMetronomeInterval !== null) {
      window.clearInterval(recordingMetronomeInterval);
      recordingMetronomeInterval = null;
    }

    if (metronomeEnabled.value) {
      restartPassiveMetronome();
    }

    const finalElapsedMs = Math.max(0, performance.now() - recordingStartedAt);
    const lastHit = recordedHits.value[recordedHits.value.length - 1];

    if (lastHit && lastHit.endMs === null) {
      lastHit.endMs = finalElapsedMs;
    }

    if (!sampleFile.value || !recordedHits.value.length) {
      errorMessage.value = 'No pad hits were recorded.';
      toastStore.show(errorMessage.value);
      return;
    }

    try {
      const performance = buildRecordedPerformanceFromHits();

      if (!performance) {
        errorMessage.value = 'No playable pad hits were recorded.';
        toastStore.show(errorMessage.value);
        return;
      }

      lastRecording.value = performance;

      if (hasBackendSession()) {
        await apiClient.saveRecording(performance);
        toastStore.show('Last record progression saved');
      }
      await exportLastRecordingToWav();
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : 'Failed to export recorded performance.';
      toastStore.show(errorMessage.value);
    }
  }

  function addPianoRollNote(padId: string, startBeat: number) {
    const maxBeats = pianoRollState.value.totalBars * pianoRollState.value.beatsPerBar;
    const durationBeats = 1;
    const note: NoteEvent = {
      id: crypto.randomUUID(),
      padId,
      startBeat: Math.min(maxBeats - durationBeats, Math.max(0, startBeat)),
      durationBeats,
      pitchOffset: 0,
      velocity: 1
    };

    pianoRollState.value.notes = [...pianoRollState.value.notes, note].sort(
      (left, right) => left.startBeat - right.startBeat
    );
    selectedNoteId.value = note.id;
  }

  function movePianoRollNote(noteId: string, nextStartBeat: number) {
    const maxBeats = pianoRollState.value.totalBars * pianoRollState.value.beatsPerBar;

    pianoRollState.value.notes = pianoRollState.value.notes.map((note) =>
      note.id === noteId
        ? {
            ...note,
            startBeat: Math.min(maxBeats - note.durationBeats, Math.max(0, nextStartBeat))
          }
        : note
    );
  }

  function resizePianoRollNote(noteId: string, nextDurationBeats: number) {
    const maxBeats = pianoRollState.value.totalBars * pianoRollState.value.beatsPerBar;

    pianoRollState.value.notes = pianoRollState.value.notes.map((note) =>
      note.id === noteId
        ? {
            ...note,
            durationBeats: Math.min(
              maxBeats - note.startBeat,
              Math.max(0.25, nextDurationBeats)
            )
          }
        : note
    );
  }

  function deleteSelectedNote() {
    if (!selectedNoteId.value) {
      return;
    }

    pianoRollState.value.notes = pianoRollState.value.notes.filter(
      (note) => note.id !== selectedNoteId.value
    );
    selectedNoteId.value = null;
  }

  function clearSequenceTimers() {
    for (const timeoutId of sequenceTimeouts) {
      window.clearTimeout(timeoutId);
    }

    sequenceTimeouts = [];

    if (sequenceCursorInterval !== null) {
      window.clearInterval(sequenceCursorInterval);
      sequenceCursorInterval = null;
    }
  }

  function scheduleMetronomeClicks(totalBeats: number, beatToMs: (beat: number) => number) {
    if (!metronomeEnabled.value) {
      return;
    }

    for (let beatIndex = 0; beatIndex < totalBeats; beatIndex += 1) {
      const timeoutId = window.setTimeout(() => {
        void playMetronomeClick(beatIndex % pianoRollState.value.beatsPerBar === 0);
      }, beatToMs(beatIndex));
      sequenceTimeouts.push(timeoutId);
    }
  }

  async function playMetronomeClick(isAccent: boolean) {
    await playMetronomeSample({
      gain: isAccent ? 0.62 : 0.48
    });
  }

  async function playSequence() {
    if (!audioBuffer.value || !pianoRollState.value.notes.length) {
      return;
    }

    stopSequence();
    stopPassiveMetronome();
    isSequencePlaying.value = true;
    activeEditorTab.value = 'piano-roll';

    const startedAt = performance.now();
    const beatToMs = (beat: number) => (beat * 60 * 1000) / projectBpm.value;
    const totalBeats = pianoRollState.value.totalBars * pianoRollState.value.beatsPerBar;

    playbackCursorBeat.value = 0;
    sequenceCursorInterval = window.setInterval(() => {
      const elapsedMs = performance.now() - startedAt;
      playbackCursorBeat.value = Math.min(totalBeats, (elapsedMs / 1000) * (projectBpm.value / 60));
    }, 30);

    for (const note of pianoRollState.value.notes) {
      const timeoutId = window.setTimeout(() => {
        void previewNote(note.id);
      }, beatToMs(note.startBeat));
      sequenceTimeouts.push(timeoutId);
    }

    scheduleMetronomeClicks(totalBeats, beatToMs);

    const stopTimeoutId = window.setTimeout(() => {
      stopSequence();
    }, beatToMs(totalBeats));
    sequenceTimeouts.push(stopTimeoutId);
  }

  function stopSequence() {
    clearSequenceTimers();
    isSequencePlaying.value = false;
    isPreviewPlaying.value = false;
    playbackCursorBeat.value = -1;
    void stopPlayback();

    if (metronomeEnabled.value && !isRecording.value) {
      restartPassiveMetronome();
    }
  }

  async function exportSequenceToWav() {
    if (!audioBuffer.value || !sampleFile.value || !pianoRollState.value.notes.length) {
      errorMessage.value = 'Add at least one piano roll note before exporting.';
      toastStore.show(errorMessage.value);
      return;
    }

    isExporting.value = true;
    errorMessage.value = '';

    try {
      const totalBeats = pianoRollState.value.totalBars * pianoRollState.value.beatsPerBar;
      const totalDurationSeconds = (totalBeats * 60) / projectBpm.value + 0.5;
      const clips = pianoRollState.value.notes
        .map((note) => {
          const slice = getPadSlice(note.padId);

          if (!slice) {
            return null;
          }

          return {
            startSeconds: (note.startBeat * 60) / projectBpm.value,
            outputDurationSeconds: getNoteDurationSeconds(note),
            sliceStartSeconds: slice.startTime,
            sliceEndSeconds: slice.endTime,
            playbackRate: getSlicePlaybackRate(slice)
          };
        })
        .filter((clip): clip is NonNullable<typeof clip> => clip !== null);

      const wavBlob = await renderArrangementToWav({
        sourceBuffer: audioBuffer.value,
        clips,
        totalDurationSeconds
      });
      const objectUrl = URL.createObjectURL(wavBlob);
      const anchor = document.createElement('a');
      const fileName = sampleFile.value.name.replace(/\.[^.]+$/, '') || 'almasampler-export';

      anchor.href = objectUrl;
      anchor.download = `${fileName}-arrangement.wav`;
      anchor.click();

      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 1000);
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : 'Failed to export arrangement to WAV.';
      toastStore.show(errorMessage.value);
    } finally {
      isExporting.value = false;
    }
  }

  return {
    activeEditorTab,
    addMarkerAtTime,
    addPianoRollNote,
    autoSlice,
    audioBuffer,
    deleteSelectedSliceMarker,
    deleteAllSliceMarkers,
    deleteSelectedNote,
    detectedSampleBpm,
    errorMessage,
    exportLastRecordingToWav,
    exportSequenceToWav,
    hasLoadedSample,
    isDecoding,
    isExporting,
    isAddingSlice,
    isPreviewPlaying,
    isRestoringRemoteProject,
    isReadOnlySharedProject,
    activePadPlayback,
    beginMarkerDrag,
    canEditProject,
    canReplayLastRecording,
    canUndoFlagChange,
    lastRecording,
    recordedHitCount,
    recordingCountdown,
    isRecording,
    isSequencePlaying,
    createShareLink,
    deleteProject,
    loadAudioFile,
    loadRemoteProject,
    loadSharedProject,
    moveMarker,
    movePianoRollNote,
    pads,
    pianoRollState,
    playSequence,
    playbackCursorBeat,
    previewNote,
    previewSlice,
    projectName,
    projectBpm,
    shareId,
    replayLastRecording,
    redetectSampleBpm,
    resizePianoRollNote,
    resetLocalProject,
    saveLocalProjectToBackend,
    sampleFile,
    selectedNote,
    selectedNoteId,
    selectedSlice,
    selectedSliceId,
    selectNote,
    selectSlice,
    setHoveredPad,
    setActiveEditorTab,
    setZoom,
    sliceMarkers,
    slices,
    smartSlice,
    sharedProjectId,
    syncAuthenticatedProject,
    endMarkerDrag,
    startRecording,
    stopActivePlayback,
    stopPlayback,
    stopRecording,
    stopSequence,
    toggleAddSliceMode,
    toggleMetronome,
    triggerPad,
    undoFlagChange,
    updateProjectBpm,
    waveformPeaks,
    hoveredPadId,
    zoom,
    metronomeEnabled
  };
});
