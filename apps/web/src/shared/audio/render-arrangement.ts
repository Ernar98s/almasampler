import { encodeWavFromAudioBuffer } from './encode-wav';

export interface OfflineRenderClip {
  startSeconds: number;
  outputDurationSeconds: number;
  sliceStartSeconds: number;
  sliceEndSeconds: number;
  playbackRate: number;
}

export interface OfflineMetronomeClick {
  startSeconds: number;
  isAccent: boolean;
}

export async function renderArrangementToWav(options: {
  sourceBuffer: AudioBuffer;
  clips: OfflineRenderClip[];
  metronomeClicks?: OfflineMetronomeClick[];
  totalDurationSeconds: number;
}) {
  const sampleRate = options.sourceBuffer.sampleRate;
  const channelCount = Math.max(2, options.sourceBuffer.numberOfChannels);
  const frameCount = Math.max(1, Math.ceil(options.totalDurationSeconds * sampleRate));
  const offlineContext = new OfflineAudioContext(channelCount, frameCount, sampleRate);

  for (const clip of options.clips) {
    const source = offlineContext.createBufferSource();
    const gainNode = offlineContext.createGain();
    const sliceDuration = Math.max(0.01, clip.sliceEndSeconds - clip.sliceStartSeconds);
    const sourceDuration = Math.min(
      sliceDuration,
      clip.outputDurationSeconds * Math.max(0.01, clip.playbackRate)
    );

    source.buffer = options.sourceBuffer;
    source.playbackRate.value = clip.playbackRate;
    gainNode.gain.value = 0.95;

    source.connect(gainNode);
    gainNode.connect(offlineContext.destination);
    source.start(clip.startSeconds, clip.sliceStartSeconds, sourceDuration);
  }

  for (const click of options.metronomeClicks ?? []) {
    const oscillator = offlineContext.createOscillator();
    const gainNode = offlineContext.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.value = click.isAccent ? 1480 : 980;
    gainNode.gain.setValueAtTime(0.0001, click.startSeconds);
    gainNode.gain.exponentialRampToValueAtTime(
      click.isAccent ? 0.15 : 0.1,
      click.startSeconds + 0.003
    );
    gainNode.gain.exponentialRampToValueAtTime(0.0001, click.startSeconds + 0.08);

    oscillator.connect(gainNode);
    gainNode.connect(offlineContext.destination);
    oscillator.start(click.startSeconds);
    oscillator.stop(click.startSeconds + 0.085);
  }

  const renderedBuffer = await offlineContext.startRendering();
  return encodeWavFromAudioBuffer(renderedBuffer);
}
