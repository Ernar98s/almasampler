import metronomeClickUrl from '@/assets/metronome-click.mp3';
import { getAudioContext, getMasterGainNode } from './decode-audio-file';

let metronomeBufferPromise: Promise<AudioBuffer> | null = null;

async function getMetronomeBuffer() {
  if (!metronomeBufferPromise) {
    metronomeBufferPromise = (async () => {
      const audioContext = await getAudioContext();
      const response = await fetch(metronomeClickUrl);
      const arrayBuffer = await response.arrayBuffer();
      return audioContext.decodeAudioData(arrayBuffer.slice(0));
    })();
  }

  return metronomeBufferPromise;
}

export async function playMetronomeSample(options?: { gain?: number }) {
  const audioContext = await getAudioContext();

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  const audioBuffer = await getMetronomeBuffer();
  const source = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();
  const masterGainNode = await getMasterGainNode();

  source.buffer = audioBuffer;
  gainNode.gain.value = options?.gain ?? 0.5;

  source.connect(gainNode);
  gainNode.connect(masterGainNode);
  source.start();
}
