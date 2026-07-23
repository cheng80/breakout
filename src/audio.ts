import type { IMediaInstance, SoundLibrary } from "@pixi/sound";

export type SoundName =
  | "ui_click"
  | "ui_panel"
  | "launch"
  | "brick_hit"
  | "steel_hit"
  | "item_collect"
  | "stage_clear"
  | "game_over"
  | "bomb"
  | "laser"
  | "blackhole_capture"
  | "trap"
  | "shield_rewind";

const files: Record<SoundName, string> = {
  ui_click: "audio/common/ui_click.mp3",
  ui_panel: "audio/common/ui_panel.mp3",
  launch: "audio/common/launch.mp3",
  brick_hit: "audio/common/brick_hit.mp3",
  steel_hit: "audio/common/steel_hit.mp3",
  item_collect: "audio/common/item_collect.mp3",
  stage_clear: "audio/common/stage_clear.mp3",
  game_over: "audio/common/game_over.mp3",
  bomb: "audio/special/bomb.mp3",
  laser: "audio/special/laser.mp3",
  blackhole_capture: "audio/special/blackhole_capture.mp3",
  trap: "audio/special/trap.mp3",
  shield_rewind: "audio/special/shield_rewind.mp3",
};

const settings: Record<SoundName, { volume: number; cooldown: number; group: string; maxVoices: number }> = {
  ui_click: { volume: 0.28, cooldown: 0.04, group: "ui", maxVoices: 2 },
  ui_panel: { volume: 0.28, cooldown: 0.08, group: "ui", maxVoices: 2 },
  launch: { volume: 0.28, cooldown: 0.2, group: "launch", maxVoices: 1 },
  brick_hit: { volume: 0.28, cooldown: 0.05, group: "impact", maxVoices: 4 },
  steel_hit: { volume: 0.28, cooldown: 0.08, group: "impact", maxVoices: 4 },
  item_collect: { volume: 0.28, cooldown: 0.08, group: "item", maxVoices: 2 },
  stage_clear: { volume: 0.28, cooldown: 0.5, group: "result", maxVoices: 1 },
  game_over: { volume: 0.28, cooldown: 0.5, group: "result", maxVoices: 1 },
  bomb: { volume: 0.28, cooldown: 0.2, group: "special", maxVoices: 2 },
  laser: { volume: 0.28, cooldown: 0.2, group: "special", maxVoices: 2 },
  blackhole_capture: { volume: 0.28, cooldown: 0.25, group: "special", maxVoices: 2 },
  trap: { volume: 0.28, cooldown: 0.15, group: "item", maxVoices: 2 },
  shield_rewind: { volume: 0.28, cooldown: 0.5, group: "special", maxVoices: 1 },
};

const BGM_KEY = "bgm";
const BGM_FILE = "audio/music/gameplay_loop.mp3";
const DEFAULT_BGM_VOLUME = 0.5;
const BGM_FADE_IN_SECONDS = 1.25;
const BGM_STOP_FADE_SECONDS = 0.35;
const BGM_VOLUME_CHANGE_SECONDS = 0.2;
const lastPlayedAt = new Map<SoundName, number>();
const activeVoices = new Map<string, number>();
let loadPromise: Promise<void> | null = null;
let allMuted = readMuted("swipe-breakout-all-muted") || readMuted("swipe-breakout-muted");
let bgmMuted = readMuted("swipe-breakout-bgm-muted");
let sfxMuted = readMuted("swipe-breakout-sfx-muted");
let bgmVolume = DEFAULT_BGM_VOLUME;
let bgmInstance: IMediaInstance | null = null;
let bgmFadeFrame: number | null = null;
let bgmStopTimer: number | null = null;
let pixiSound: SoundLibrary | null = null;

async function getPixiSound(): Promise<SoundLibrary | null> {
  if (typeof document === "undefined") return null;
  if (pixiSound) return pixiSound;
  ({ sound: pixiSound } = await import("@pixi/sound"));
  return pixiSound;
}

function readMuted(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeMuted(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // 저장소를 사용할 수 없어도 현재 게임은 계속 진행합니다.
  }
}

function isBgmSilenced(): boolean {
  return allMuted || bgmMuted;
}

function isSfxSilenced(): boolean {
  return allMuted || sfxMuted;
}

function syncSfxMute(): void {
  const library = pixiSound;
  if (!library) return;
  Object.keys(files).forEach((name) => {
    if (library.exists(name)) library.find(name).muted = isSfxSilenced();
  });
}

function loadSound(library: SoundLibrary, name: string, url: string): Promise<void> {
  if (library.exists(name)) return Promise.resolve();
  return new Promise((resolve) => {
    library.add(name, {
      url,
      preload: true,
      loaded: (error) => {
        if (error) console.warn(`${name} 오디오를 불러오지 못했습니다.`, error);
        resolve();
      },
    });
  });
}

export function canPlaySound(lastPlayed: number | undefined, now: number, cooldown: number): boolean {
  return lastPlayed === undefined || now - lastPlayed >= cooldown;
}

export function preloadAudio(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = getPixiSound().then((library) => {
    if (!library) return;
    return Promise.all([
      ...Object.entries(files).map(([name, url]) => loadSound(library, name, url)),
      loadSound(library, BGM_KEY, BGM_FILE),
    ]).then(syncSfxMute);
  });
  return loadPromise;
}

function fadeBgm(target: number, duration: number): void {
  const instance = bgmInstance;
  if (!instance) return;
  if (bgmFadeFrame !== null) cancelAnimationFrame(bgmFadeFrame);
  const startedAt = performance.now();
  const initial = instance.volume;
  const tick = (now: number) => {
    if (bgmInstance !== instance) return;
    const progress = Math.min(1, (now - startedAt) / (duration * 1000));
    instance.volume = initial + (target - initial) * progress;
    bgmFadeFrame = progress < 1 ? requestAnimationFrame(tick) : null;
  };
  bgmFadeFrame = duration > 0 ? requestAnimationFrame(tick) : null;
  if (duration === 0) instance.volume = target;
}

function clearBgmStopTimer(): void {
  if (bgmStopTimer === null) return;
  window.clearTimeout(bgmStopTimer);
  bgmStopTimer = null;
}

function stopBgm(): void {
  const instance = bgmInstance;
  if (!instance) return;
  fadeBgm(0, BGM_STOP_FADE_SECONDS);
  clearBgmStopTimer();
  bgmStopTimer = window.setTimeout(() => {
    if (bgmInstance === instance) {
      instance.stop();
      bgmInstance = null;
    }
    bgmStopTimer = null;
  }, BGM_STOP_FADE_SECONDS * 1000);
}

function beginBgm(instance: IMediaInstance): void {
  if (isBgmSilenced()) {
    instance.stop();
    return;
  }
  bgmInstance = instance;
  fadeBgm(bgmVolume, BGM_FADE_IN_SECONDS);
}

function startBgm(): void {
  if (isBgmSilenced() || !pixiSound?.exists(BGM_KEY)) return;
  clearBgmStopTimer();
  if (bgmInstance) {
    fadeBgm(bgmVolume, BGM_FADE_IN_SECONDS);
    return;
  }
  const result = pixiSound.play(BGM_KEY, { loop: true, volume: 0, singleInstance: true });
  if (result instanceof Promise) void result.then(beginBgm).catch(() => undefined);
  else beginBgm(result);
}

export async function unlockAudio(): Promise<void> {
  await preloadAudio();
  startBgm();
}

export function playSound(name: SoundName, options: { volume?: number; playbackRate?: number } = {}): void {
  void unlockAudio().then(() => {
    if (isSfxSilenced()) return;
    const config = settings[name];
    const now = performance.now() / 1000;
    if (!canPlaySound(lastPlayedAt.get(name), now, config.cooldown)) return;
    if ((activeVoices.get(config.group) ?? 0) >= config.maxVoices) return;

    const finish = () => activeVoices.set(config.group, Math.max(0, (activeVoices.get(config.group) ?? 1) - 1));
    lastPlayedAt.set(name, now);
    activeVoices.set(config.group, (activeVoices.get(config.group) ?? 0) + 1);
    const result = pixiSound!.play(name, {
      volume: options.volume ?? config.volume,
      speed: options.playbackRate ?? 1,
      complete: finish,
    });
    if (result instanceof Promise) void result.catch(finish);
  });
}

export function isMuted(): boolean {
  return allMuted;
}

export function isBgmMuted(): boolean {
  return bgmMuted;
}

export function isSfxMuted(): boolean {
  return sfxMuted;
}

export function isAllMuted(): boolean {
  return allMuted;
}

export function getBgmVolume(): number {
  return bgmVolume;
}

export function setBgmVolume(value: number): void {
  bgmVolume = Math.min(1, Math.max(0, Number.isFinite(value) ? value : DEFAULT_BGM_VOLUME));
  if (!isBgmSilenced()) fadeBgm(bgmVolume, BGM_VOLUME_CHANGE_SECONDS);
}

export function setMuted(value: boolean): void {
  setAllMuted(value);
}

export function setBgmMuted(value: boolean): void {
  bgmMuted = value;
  writeMuted("swipe-breakout-bgm-muted", bgmMuted);
  if (isBgmSilenced()) stopBgm();
  else startBgm();
}

export function setSfxMuted(value: boolean): void {
  sfxMuted = value;
  writeMuted("swipe-breakout-sfx-muted", sfxMuted);
  syncSfxMute();
}

export function setAllMuted(value: boolean): void {
  allMuted = value;
  writeMuted("swipe-breakout-all-muted", allMuted);
  writeMuted("swipe-breakout-muted", allMuted);
  syncSfxMute();
  if (isBgmSilenced()) stopBgm();
  else void unlockAudio();
}
