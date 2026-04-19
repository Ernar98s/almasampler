import { getAudioContext, getMasterGainNode } from './decode-audio-file';

const activeSources = new Set<AudioBufferSourceNode>();
let activeExclusiveVoice:
  | {
      source: AudioBufferSourceNode;
      gainNode: GainNode;
    }
  | null = null;

async function chokeExclusiveVoice(audioContext: AudioContext) {
  if (!activeExclusiveVoice) {
    return;
  }

  const { source, gainNode } = activeExclusiveVoice;
  const now = audioContext.currentTime;

  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(Math.max(0.0001, gainNode.gain.value), now);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);

  try {
    source.stop(now + 0.013);
  } catch {
    source.stop();
  }

  activeExclusiveVoice = null;
}

function hardStopSource(
  source: AudioBufferSourceNode,
  gainNode?: GainNode | null
) {
  try {
    source.onended = null;
    source.stop();
  } catch {
    // Ignore invalid state when a source has already ended.
  }

  try {
    source.disconnect();
  } catch {
    // Ignore duplicate disconnects.
  }

  try {
    gainNode?.disconnect();
  } catch {
    // Ignore duplicate disconnects.
  }
}

export async function stopPlayback() {
  await getAudioContext();

  if (activeExclusiveVoice) {
    hardStopSource(activeExclusiveVoice.source, activeExclusiveVoice.gainNode);
    activeSources.delete(activeExclusiveVoice.source);
    activeExclusiveVoice = null;
  }

  for (const source of activeSources) {
    hardStopSource(source);
  }

  activeSources.clear();
}

export async function playBufferSlice(options: {
  audioBuffer: AudioBuffer;
  startTime: number;
  endTime: number;
  playbackRate?: number;
  outputDurationSeconds?: number;
  exclusive?: boolean;
  onEnded?: () => void;
}) {
  const audioContext = await getAudioContext();

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  if (options.exclusive ?? true) {
    await chokeExclusiveVoice(audioContext);
  }

  const duration = Math.max(0.01, options.endTime - options.startTime);
  const source = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();
  const masterGainNode = await getMasterGainNode();

  source.buffer = options.audioBuffer;
  source.playbackRate.value = options.playbackRate ?? 1;
  gainNode.gain.value = 0.95;

  source.connect(gainNode);
  gainNode.connect(masterGainNode);

  const requestedOutputDuration = options.outputDurationSeconds ?? duration / Math.max(0.01, source.playbackRate.value);
  const sourceDuration = Math.min(
    duration,
    requestedOutputDuration * Math.max(0.01, source.playbackRate.value)
  );

  source.start(
    audioContext.currentTime,
    options.startTime,
    sourceDuration
  );
  source.onended = () => {
    if (activeExclusiveVoice?.source === source) {
      activeExclusiveVoice = null;
    }
    activeSources.delete(source);
    source.disconnect();
    options.onEnded?.();
  };

  activeSources.add(source);

  if (options.exclusive ?? true) {
    activeExclusiveVoice = {
      source,
      gainNode
    };
  }
}
