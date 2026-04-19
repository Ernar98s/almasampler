export function buildWaveformPeaks(audioBuffer: AudioBuffer, totalBins = 512): Float32Array {
  const channelData = audioBuffer.getChannelData(0);
  const peaks = new Float32Array(totalBins);
  const samplesPerBin = Math.max(1, Math.floor(channelData.length / totalBins));

  for (let binIndex = 0; binIndex < totalBins; binIndex += 1) {
    const start = binIndex * samplesPerBin;
    const end = Math.min(channelData.length, start + samplesPerBin);
    let maxAmplitude = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      const amplitude = Math.abs(channelData[sampleIndex] ?? 0);
      if (amplitude > maxAmplitude) {
        maxAmplitude = amplitude;
      }
    }

    peaks[binIndex] = maxAmplitude;
  }

  return peaks;
}
