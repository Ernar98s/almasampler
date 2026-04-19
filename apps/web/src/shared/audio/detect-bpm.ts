function clampTempo(candidateTempo: number) {
  let tempo = candidateTempo;

  while (tempo < 70) {
    tempo *= 2;
  }

  while (tempo > 180) {
    tempo /= 2;
  }

  return tempo;
}

export function detectApproximateBpm(audioBuffer: AudioBuffer) {
  const channelData = audioBuffer.getChannelData(0);
  const windowSize = 1024;
  const envelopeLength = Math.floor(channelData.length / windowSize);

  if (envelopeLength < 32) {
    return 120;
  }

  const envelope = new Float32Array(envelopeLength);

  for (let envelopeIndex = 0; envelopeIndex < envelopeLength; envelopeIndex += 1) {
    const start = envelopeIndex * windowSize;
    const end = Math.min(channelData.length, start + windowSize);
    let energy = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      const sample = channelData[sampleIndex] ?? 0;
      energy += sample * sample;
    }

    envelope[envelopeIndex] = Math.sqrt(energy / Math.max(1, end - start));
  }

  const onset = new Float32Array(envelope.length);

  for (let index = 1; index < envelope.length; index += 1) {
    onset[index] = Math.max(0, envelope[index] - envelope[index - 1]);
  }

  const framesPerSecond = audioBuffer.sampleRate / windowSize;
  const minLag = Math.floor((framesPerSecond * 60) / 180);
  const maxLag = Math.ceil((framesPerSecond * 60) / 70);
  let bestLag = Math.floor((framesPerSecond * 60) / 120);
  let bestScore = -1;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let score = 0;

    for (let index = lag; index < onset.length; index += 1) {
      score += onset[index] * onset[index - lag];
    }

    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  const bpm = (framesPerSecond * 60) / Math.max(1, bestLag);
  return Math.round(clampTempo(bpm));
}
