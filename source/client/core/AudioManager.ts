import * as THREE from 'three';
import { Audio, AudioListener, AudioLoader, PositionalAudio } from 'three';

export enum SoundType {
  MUSIC = 'music',
  SFX = 'sfx',
  UI = 'ui',
  AMBIENT = 'ambient',
  VEHICLE = 'vehicle',
}

export interface SoundConfig {
  key: string;
  type: SoundType;
  loop?: boolean;
  volume?: number;
  autoplay?: boolean;
  spatial?: boolean;
  radius?: number;
  rolloffFactor?: number;
}

class Sound {
  public key: string;
  public type: SoundType;
  public audio: Audio | PositionalAudio;
  public config: SoundConfig;
  public isPlaying = false;

  constructor(
    key: string,
    audio: Audio | PositionalAudio,
    config: SoundConfig,
  ) {
    this.key = key;
    this.audio = audio;
    this.config = config;
    this.type = config.type;

    if (config.loop !== undefined) audio.setLoop(config.loop);
    if (config.volume !== undefined) audio.setVolume(config.volume);

    if (config.spatial && audio instanceof PositionalAudio) {
      if (config.radius !== undefined) audio.setRefDistance(config.radius);
      if (config.rolloffFactor !== undefined)
        audio.setRolloffFactor(config.rolloffFactor);
    }

    if (config.autoplay) {
      this.play();
    }
  }

  public play(restart = true): void {
    if (restart && this.isPlaying) {
      this.audio.stop();
    }

    if (restart || !this.isPlaying) {
      this.audio.play();
      this.isPlaying = true;
    }
  }

  public pause(): void {
    if (this.isPlaying) {
      this.audio.pause();
      this.isPlaying = false;
    }
  }

  public stop(): void {
    if (this.audio.isPlaying) {
      this.audio.stop();
      this.isPlaying = false;
    }
  }

  public setVolume(volume: number): void {
    this.audio.setVolume(Math.max(0, Math.min(1, volume)));
  }

  public setPlaybackRate(rate: number): void {
    this.audio.setPlaybackRate(rate);
  }

  public fadeIn(duration = 1.0): void {
    const originalVolume = this.audio.getVolume();
    this.audio.setVolume(0);
    this.play();

    const startTime = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const t = Math.min(1, elapsed / duration);
      this.audio.setVolume(originalVolume * t);

      if (t < 1) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  }

  public fadeOut(duration = 1.0): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isPlaying) {
        resolve();
        return;
      }

      const originalVolume = this.audio.getVolume();
      const startTime = performance.now();

      const tick = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        const t = Math.min(1, elapsed / duration);
        this.audio.setVolume(originalVolume * (1 - t));

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          this.stop();
          this.audio.setVolume(originalVolume);
          resolve();
        }
      };

      requestAnimationFrame(tick);
    });
  }
}

export class AudioManager {
  private readonly listener: AudioListener;
  private readonly loader: AudioLoader;

  private sounds = new Map<string, Sound>();
  private volumeLevels = new Map<SoundType, number>();
  private globalVolume = 1.0;
  private muted = false;

  private currentMusic: Sound | null = null;
  private currentAmbient: Sound | null = null;

  private crossfadeDuration = 1.5;

  constructor() {
    this.listener = new AudioListener();
    this.loader = new AudioLoader();

    this.volumeLevels.set(SoundType.MUSIC, 0.5);
    this.volumeLevels.set(SoundType.SFX, 0.8);
    this.volumeLevels.set(SoundType.UI, 0.7);
    this.volumeLevels.set(SoundType.AMBIENT, 0.4);
    this.volumeLevels.set(SoundType.VEHICLE, 0.9);

    this.setupEventListeners();

    console.log('Audio Manager initialized');
  }

  private setupEventListeners(): void {
    window.addEventListener('blur', () => {
      this.pauseAll();
    });

    window.addEventListener('focus', () => {
      this.resumeAll();
    });

    g_core.getInternalNet().on('game.pause', () => {
      this.pauseAll(SoundType.MUSIC);
    });

    g_core.getInternalNet().on('game.resume', () => {
      this.resumeAll(SoundType.MUSIC);
    });
  }

  public getListener(): AudioListener {
    return this.listener;
  }

  public create(buffer: AudioBuffer, config: SoundConfig): Sound | null {
    try {
      let audioObj;

      if (config.spatial) {
        audioObj = new PositionalAudio(this.listener);
      } else {
        audioObj = new Audio(this.listener);
      }

      audioObj.setBuffer(buffer);

      const sound = new Sound(config.key, audioObj, config);

      this.sounds.set(config.key, sound);

      const typeVolume = this.volumeLevels.get(config.type) ?? 1.0;
      sound.setVolume(typeVolume * (config.volume ?? 1.0) * this.globalVolume);

      if (config.type === SoundType.MUSIC && config.autoplay) {
        this.currentMusic = sound;
      } else if (config.type === SoundType.AMBIENT && config.autoplay) {
        this.currentAmbient = sound;
      }

      return sound;
    } catch (error) {
      console.error(`Failed to create audio: ${config.key}`, error);
      return null;
    }
  }

  public async load(url: string, config: SoundConfig): Promise<Sound | null> {
    try {
      const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
        this.loader.load(url, resolve, undefined, reject);
      });

      return this.create(buffer, config);
    } catch (error) {
      console.error(`Failed to load audio: ${url}`, error);
      return null;
    }
  }

  public get(key: string): Sound | null {
    return this.sounds.get(key) ?? null;
  }

  public play(key: string): Sound | null {
    const sound = this.get(key);
    if (sound) {
      sound.play();
      return sound;
    }
    return null;
  }

  public pause(key: string): void {
    const sound = this.get(key);
    if (sound) {
      sound.pause();
    }
  }

  public stop(key: string): void {
    const sound = this.get(key);
    if (sound) {
      sound.stop();
    }
  }

  public setVolumeForType(type: SoundType, volume: number): void {
    const normalizedVolume = Math.max(0, Math.min(1, volume));
    this.volumeLevels.set(type, normalizedVolume);

    this.sounds.forEach((sound) => {
      if (sound.type === type) {
        sound.setVolume(normalizedVolume * this.globalVolume);
      }
    });

    console.log(`Volume for ${type} set to ${normalizedVolume}`);
  }

  public setGlobalVolume(volume: number): void {
    this.globalVolume = Math.max(0, Math.min(1, volume));

    this.sounds.forEach((sound) => {
      const typeVolume = this.volumeLevels.get(sound.type) ?? 1.0;
      sound.setVolume(typeVolume * this.globalVolume);
    });

    console.log(`Global volume set to ${this.globalVolume}`);
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;

    if (this.muted) {
      this.sounds.forEach((sound) => {
        if (sound.isPlaying) {
          sound.audio.setVolume(0);
        }
      });
    } else {
      this.sounds.forEach((sound) => {
        if (sound.isPlaying) {
          const typeVolume = this.volumeLevels.get(sound.type) ?? 1.0;
          sound.audio.setVolume(typeVolume * this.globalVolume);
        }
      });
    }

    console.log(`Sound ${this.muted ? 'muted' : 'unmuted'}`);
    return this.muted;
  }

  public pauseAll(exceptType?: SoundType): void {
    this.sounds.forEach((sound) => {
      if (!exceptType || sound.type !== exceptType) {
        if (sound.isPlaying) {
          sound.pause();
        }
      }
    });
  }

  public resumeAll(exceptType?: SoundType): void {
    if (this.muted) return;

    this.sounds.forEach((sound) => {
      if (!exceptType || sound.type !== exceptType) {
        if (sound.config.autoplay || sound.isPlaying) {
          sound.play();
        }
      }
    });
  }

  public async crossfadeMusic(
    newMusicKey: string,
    duration: number = this.crossfadeDuration,
  ): Promise<void> {
    const newMusic = this.get(newMusicKey);

    if (!newMusic) {
      console.error(`Music not found: ${newMusicKey}`);
      return;
    }

    if (this.currentMusic === newMusic) {
      return;
    }

    if (this.currentMusic) {
      const oldMusic = this.currentMusic;
      await oldMusic.fadeOut(duration);
    }

    this.currentMusic = newMusic;

    newMusic.fadeIn(duration);
  }

  public setupEngineSound(vehicleObj: any, soundKey: string): void {
    const sound = this.get(soundKey);
    if (!sound || !(sound.audio instanceof PositionalAudio)) {
      console.error(`Cannot setup engine sound: ${soundKey}`);
      return;
    }

    vehicleObj.add(sound.audio);

    const posAudio = sound.audio;
    posAudio.setRolloffFactor(0.5);
    posAudio.setDistanceModel('linear');

    sound.play();

    g_core.getInternalNet().emit('audio.engine.setup', {
      vehicle: vehicleObj,
      sound: sound,
    });
  }

  public updateEngineSound(soundKey: string, rpm: number, speed: number): void {
    const sound = this.get(soundKey);
    if (!sound) return;

    const minPitch = 0.6;
    const maxPitch = 2.0;
    const normalizedRPM = Math.min(1.0, rpm / 7000);
    const pitch = minPitch + normalizedRPM * (maxPitch - minPitch);

    sound.setPlaybackRate(pitch);

    const baseVolume = this.volumeLevels.get(SoundType.VEHICLE) ?? 0.8;
    const volumeBoost = Math.min(0.3, (speed / 150) * 0.3);

    sound.setVolume((baseVolume + volumeBoost) * this.globalVolume);
  }

  public playSoundAt(
    key: string,
    position: THREE.Vector3,
    volume = 1.0,
  ): Sound | null {
    const sound = this.get(key);

    if (!sound || !(sound.audio instanceof PositionalAudio)) {
      console.error(`Sound ${key} doesn't exist or is not positional`);
      return null;
    }

    sound.audio.position.copy(position);

    sound.setVolume(volume);

    sound.play();

    return sound;
  }

  public playOneShot(key: string, volume = 1.0): void {
    const sound = this.get(key);

    if (!sound) {
      console.log(`Sound not found for one-shot: ${key}`);
      return;
    }

    const typeVolume = this.volumeLevels.get(sound.type) ?? 1.0;
    sound.setVolume(typeVolume * volume * this.globalVolume);

    if (sound.audio.isPlaying) {
      sound.audio.stop();
    }
    sound.play();
  }

  public createSoundPool(
    baseKey: string,
    count: number,
    url: string,
    config: SoundConfig,
  ): string[] {
    const soundKeys: string[] = [];

    for (let i = 0; i < count; i++) {
      const pooledKey = `${baseKey}_${i}`;
      soundKeys.push(pooledKey);

      const poolConfig = {
        ...config,
        key: pooledKey,
        autoplay: false,
      };

      this.load(url, poolConfig);
    }

    return soundKeys;
  }

  public playFromPool(baseKey: string, count: number): Sound | null {
    for (let i = 0; i < count; i++) {
      const pooledKey = `${baseKey}_${i}`;
      const sound = this.get(pooledKey);

      if (sound && !sound.isPlaying) {
        sound.play();
        return sound;
      }
    }

    const firstKey = `${baseKey}_0`;
    const firstSound = this.get(firstKey);

    if (firstSound) {
      if (firstSound.isPlaying) {
        firstSound.stop();
      }
      firstSound.play();
      return firstSound;
    }

    return null;
  }

  public async crossfadeAmbient(
    newAmbientKey: string,
    duration: number = this.crossfadeDuration,
  ): Promise<void> {
    const newAmbient = this.get(newAmbientKey);

    if (!newAmbient) {
      console.error(`Ambient sound not found: ${newAmbientKey}`);
      return;
    }

    if (this.currentAmbient === newAmbient) {
      return;
    }

    if (this.currentAmbient) {
      const oldAmbient = this.currentAmbient;
      await oldAmbient.fadeOut(duration);
    }

    this.currentAmbient = newAmbient;

    newAmbient.fadeIn(duration);
  }

  public createAmbientMixer(
    keys: string[],
    initialWeights: number[] = [],
  ): void {
    if (keys.length === 0) {
      console.error('No ambient sounds provided for mixer');
      return;
    }

    const sounds: Sound[] = [];
    for (const key of keys) {
      const sound = this.get(key);
      if (!sound) {
        console.error(`Ambient sound not found for mixer: ${key}`);
        return;
      }
      sounds.push(sound);
    }

    sounds.forEach((sound) => {
      sound.setVolume(0);
      if (!sound.isPlaying) {
        sound.play();
      }
    });

    if (initialWeights.length > 0) {
      this.updateAmbientMixer(keys, initialWeights);
    }
  }

  public updateAmbientMixer(keys: string[], weights: number[]): void {
    if (keys.length !== weights.length) {
      console.error('Mismatch between ambient keys and weights');
      return;
    }

    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0) {
      console.log('All ambient weights are zero or negative');
      return;
    }

    const normalizedWeights = weights.map((w) => Math.max(0, w) / sum);

    for (let i = 0; i < keys.length; i++) {
      const sound = this.get(keys[i]);
      if (sound) {
        const typeVolume = this.volumeLevels.get(SoundType.AMBIENT) ?? 0.5;
        sound.setVolume(normalizedWeights[i] * typeVolume * this.globalVolume);
      }
    }
  }

  public dispose(): void {
    this.sounds.forEach((sound) => {
      if (sound.isPlaying) {
        sound.stop();
      }
    });

    this.sounds.clear();
    this.currentMusic = null;
    this.currentAmbient = null;

    console.log('Audio Manager disposed');
  }
}
