import * as THREE from 'three';

class AudioEngine {
  constructor(camera) {
    if (!camera) {
      console.warn('AudioEngine requires a camera to be initialized.');
      return;
    }
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
  }

  _createOscillator(type, from, to, time) {
    if (!this.listener) return null;
    const audioContext = this.listener.context;
    const oscillator = audioContext.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      to,
      audioContext.currentTime + time
    );
    return oscillator;
  }

  _createGain(from, to, time) {
    if (!this.listener) return null;
    const audioContext = this.listener.context;
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(from, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(to, audioContext.currentTime + time);
    return gain;
  }

  play(sound, volume = 1.0) {
    if (!this.listener) return;
    const audioContext = this.listener.context;
    if (sound === 'pop') {
      const oscillator = this._createOscillator('triangle', 400, 100, 0.1);
      const gain = this._createGain(volume, 0.01, 0.1);
      if (!oscillator || !gain) return;
      oscillator.connect(gain);
      gain.connect(this.listener.gain);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } else if (sound === 'throw') {
      const noise = audioContext.createBufferSource();
      const bufferSize = audioContext.sampleRate * 0.2; // 0.2 seconds
      const buffer = audioContext.createBuffer(
        1,
        bufferSize,
        audioContext.sampleRate
      );
      const output = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      noise.buffer = buffer;

      const bandpass = audioContext.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(800, audioContext.currentTime);
      bandpass.frequency.linearRampToValueAtTime(
        1500,
        audioContext.currentTime + 0.2
      );

      const gain = this._createGain(0.01, volume, 0.05);
      if (!gain) return;
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.2
      );

      noise.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(this.listener.gain);

      noise.start(audioContext.currentTime);
      noise.stop(audioContext.currentTime + 0.2);
    }
  }
}

let instance = null;

export const setCameraForAudio = (camera) => {
  instance = new AudioEngine(camera);
};

export const audio = {
  play: (sound) => {
    if (instance) {
      instance.play(sound);
    } else {
      console.warn(
        'Audio engine not initialized. Call setCameraForAudio first.'
      );
    }
  },
};
