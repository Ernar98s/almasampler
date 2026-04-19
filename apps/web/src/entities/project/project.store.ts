import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { NoteEvent, Pad, PianoRollState, SampleFile, Slice } from '@almasampler/shared';
import { decodeAudioFile } from '@/shared/audio/decode-audio-file';
import { detectApproximateBpm } from '@/shared/audio/detect-bpm';
import { playMetronomeSample } from '@/shared/audio/metronome-sample';
import { renderMonophonicPerformanceToWav } from '@/shared/audio/render-monophonic-performance';
import { renderArrangementToWav } from '@/shared/audio/render-arrangement';
import { buildWaveformPeaks } from '@/shared/audio/waveform-peaks';
import { playBufferSlice, stopPlayback } from '@/shared/audio/sample-playback';

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
function createDefaultPads(): Pad[] {
  return Array.from({ length: PAD_COUNT }, (_, index) => ({
    id: `pad-${index + 1}`,
    index,
    keyBinding: PAD_KEYS[index] ?? '',
    rootNote: 60
  }));
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
  const sampleFile = ref<SampleFile | null>(null);
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
  const metronomeEnabled = ref(false);
  const isExporting = ref(false);
  let sequenceTimeouts: number[] = [];
  let sequenceCursorInterval: number | null = null;
  let recordingStartedAt = 0;
  let passiveMetronomeTimeout: number | null = null;
  let recordingMetronomeInterval: number | null = null;
  const recordedHits = ref<Array<{ padId: string; startMs: number; endMs: number | null }>>([]);
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

  function getPadSliceOffset() {
    return slices.value.length > pads.value.length ? LEAD_IN_SLICE_COUNT : 0;
  }

  function getFirstMappedSliceId() {
    return padMappedSlices.value[0]?.id ?? slices.value[0]?.id ?? null;
  }

  async function loadAudioFile(file: File) {
    errorMessage.value = '';
    isDecoding.value = true;

    try {
      const decoded = await decodeAudioFile(file);

      if (decoded.metadata.durationSeconds > MAX_DURATION_SECONDS) {
        throw new Error('Audio file must be 6 minutes or shorter.');
      }

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
    } catch (error) {
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
    } finally {
      isDecoding.value = false;
    }
  }

  function setZoom(nextZoom: number) {
    zoom.value = Math.min(6, Math.max(1, nextZoom));
  }

  function selectSlice(sliceId: string | null) {
    selectedSliceId.value = sliceId;
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

  function updateProjectBpm(nextBpm: number) {
    projectBpm.value = Math.min(220, Math.max(40, Math.round(nextBpm || 120)));

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

    const markers = [...sliceMarkers.value, time]
      .filter((value) => value > 0.02 && value < sampleFile.value!.durationSeconds - 0.02);
    slices.value = rebuildSlicesFromMarkers(markers, sampleFile.value.durationSeconds, pads.value);
    assignSlicesToPads();
    const targetSlice = padMappedSlices.value.find((slice) => time >= slice.startTime && time < slice.endTime);
    selectedSliceId.value = targetSlice?.id ?? getFirstMappedSliceId();
    isAddingSlice.value = false;
  }

  function moveMarker(markerIndex: number, nextTime: number) {
    if (!sampleFile.value) {
      return;
    }

    const markers = [...sliceMarkers.value];

    if (markerIndex < 0 || markerIndex >= markers.length) {
      return;
    }

    const previous = markers[markerIndex - 1] ?? 0;
    const next = markers[markerIndex + 1] ?? sampleFile.value.durationSeconds;
    markers[markerIndex] = Math.min(next - 0.02, Math.max(previous + 0.02, nextTime));
    slices.value = rebuildSlicesFromMarkers(markers, sampleFile.value.durationSeconds, pads.value);
    assignSlicesToPads();
  }

  function deleteSelectedSliceMarker() {
    if (!sampleFile.value || !selectedSlice.value) {
      return;
    }

    const markers = sliceMarkers.value.filter(
      (markerTime) => Math.abs(markerTime - selectedSlice.value!.startTime) > 0.001
    );

    slices.value = rebuildSlicesFromMarkers(markers, sampleFile.value.durationSeconds, pads.value);
    assignSlicesToPads();
    selectedSliceId.value = getFirstMappedSliceId();
  }

  function deleteAllSliceMarkers() {
    if (!sampleFile.value) {
      return;
    }

    slices.value = rebuildSlicesFromMarkers([], sampleFile.value.durationSeconds, pads.value);
    assignSlicesToPads();
    selectedSliceId.value = getFirstMappedSliceId();
    isAddingSlice.value = false;
  }

  function autoSlice(parts: 9 | 18 | 27) {
    if (!sampleFile.value) {
      return;
    }

    slices.value = createEqualSlices(
      sampleFile.value.durationSeconds,
      parts + LEAD_IN_SLICE_COUNT,
      pads.value
    );
    assignSlicesToPads();
    selectedSliceId.value = getFirstMappedSliceId();
  }

  function smartSlice(parts: 9 | 18 | 27 = 9) {
    if (!sampleFile.value) {
      return;
    }

    slices.value = createAutoSlicesFromWaveform(
      waveformPeaks.value,
      sampleFile.value.durationSeconds,
      parts + LEAD_IN_SLICE_COUNT,
      pads.value
    );
    assignSlicesToPads();
    selectedSliceId.value = getFirstMappedSliceId();
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
        isPreviewPlaying.value = false;
      }
    });
  }

  function startRecording() {
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

  async function stopRecording() {
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
      return;
    }

    isExporting.value = true;

    try {
      const oneSampleSeconds = audioBuffer.value ? 1 / audioBuffer.value.sampleRate : 0;
      const clips = recordedHits.value
        .map((hit) => {
          const slice = getPadSlice(hit.padId);

          if (!slice) {
            return null;
          }

          const startSeconds = hit.startMs / 1000;
          const endSeconds = (hit.endMs ?? hit.startMs) / 1000;
          const naturalDurationSeconds = getSliceNaturalDurationSeconds(slice);
          const gapUntilNextHitSeconds = endSeconds - startSeconds;
          const clipDurationSeconds = Math.max(
            0,
            Math.min(naturalDurationSeconds, gapUntilNextHitSeconds - oneSampleSeconds)
          );

          return {
            startSeconds,
            outputDurationSeconds: clipDurationSeconds,
            sliceStartSeconds: slice.startTime,
            sliceEndSeconds: slice.endTime,
            playbackRate: getSlicePlaybackRate(slice)
          };
        })
        .filter(
          (clip): clip is NonNullable<typeof clip> =>
            clip !== null && clip.outputDurationSeconds > 0
        );

      if (!clips.length || !audioBuffer.value) {
        errorMessage.value = 'No playable pad hits were recorded.';
        return;
      }

      const totalDurationSeconds =
        clips.reduce(
          (maxDuration, clip) =>
            Math.max(maxDuration, clip.startSeconds + clip.outputDurationSeconds),
          0
        ) + 0.25;

      const wavBlob = await renderMonophonicPerformanceToWav({
        sourceBuffer: audioBuffer.value,
        clips,
        totalDurationSeconds
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
        error instanceof Error ? error.message : 'Failed to export recorded performance.';
    } finally {
      isExporting.value = false;
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
    exportSequenceToWav,
    hasLoadedSample,
    isDecoding,
    isExporting,
    isAddingSlice,
    isPreviewPlaying,
    recordedHitCount,
    isRecording,
    isSequencePlaying,
    loadAudioFile,
    moveMarker,
    movePianoRollNote,
    pads,
    pianoRollState,
    playSequence,
    playbackCursorBeat,
    previewNote,
    previewSlice,
    projectBpm,
    redetectSampleBpm,
    resizePianoRollNote,
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
    startRecording,
    stopPlayback,
    stopRecording,
    stopSequence,
    toggleAddSliceMode,
    toggleMetronome,
    triggerPad,
    updateProjectBpm,
    waveformPeaks,
    hoveredPadId,
    zoom,
    metronomeEnabled
  };
});
