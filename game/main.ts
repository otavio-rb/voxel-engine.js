import Stats from 'three/examples/jsm/libs/stats.module.js';
import { VoxelEngine, EngineStats, BlockBreakEvent, BlockPlaceEvent } from '@voxel/engine';
import UI, { UIStats } from './ui/UI';
import MobileControls from './ui/MobileControls';
import { WorldType } from './types';
import { registerBlocks } from './content/blocks';

const WORLD_DESCRIPTIONS: Record<string, string> = {
  [WorldType.Standard]: 'Mundo padrão: Vastas florestas (carvalho, bétula, pinheiros, cerejeiras, selva), desertos com cactos e tundras com biomas em macro-escala. Por baixo, cavernas em camadas: rocha nua à superfície e, à medida que se desce, carso calcário, grutas verdejantes, florestas fúngicas, veios de cristal com geodos de ametista e, no fundo, o abismo de lava. Ravinas, poços e salões com lagos ligam tudo.',
  [WorldType.Aether]: 'The Aether (Portal do Céu): Ilhas celestiais flutuantes, nuvens aercloud, minérios de gravidade (Gravitite, Zanite, Ambrosium) e templos dourados.',
  [WorldType.Nether]: 'O Nether (Submundo): Dimensão subterrânea cavernosa com oceanos de lava e teto de rocha.',
  [WorldType.AstralVoid]: 'Vácuo Astral: Ilhas cósmicas flutuando num abismo estelar com microgravidade.',
  [WorldType.Flat]: 'Mundo plano: Superfície lisa contínua para testes e construções.',
  [WorldType.Cavern]: 'Mundo cavernoso: Estruturas 3D colossais e cavernas profundas no vazio.',
  [WorldType.Lunar]: 'Mundo lunar: Solo cinzento com crateras de impacto e baixa gravidade.',
  [WorldType.Mercury]: 'Mundo de Mercúrio: Solo extremo sob forte calor solar.',
  [WorldType.Volcanic]: 'Mundo vulcânico: Oceanos de lava, cinzas, magma incandescente e supervulcões ativos.'
};

class Game {
  private readonly engine: VoxelEngine;
  private readonly ui: UI;
  private readonly mobileControls: MobileControls;
  private readonly stats: Stats;

  private isMenuOpen = true;
  private selectedWorldType: WorldType = WorldType.Standard;
  private selectedMode: 'debug' | 'normal' = 'debug';
  private shadersEnabled = true;

  constructor() {
    registerBlocks();
    this.ui = new UI();
    this.stats = new Stats();
    this.stats.dom.id = 'stats-overlay';
    document.body.appendChild(this.stats.dom);

    const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
    this.engine = new VoxelEngine({
      canvas,
      worker: new Worker(new URL('./workers/engine.worker.ts', import.meta.url), { type: 'module' })
    });
    this.engine.setInputBlocked(true);

    this.mobileControls = new MobileControls({
      engine: this.engine,
      ui: this.ui,
      onOpenMenu: () => this.openMenu()
    });

    this.bindEngineEvents();
    this.bindUIEvents();
    this.initMenu();
  }

  public openMenu(): void {
    if (this.isMenuOpen) return;
    if (this.ui.isInventoryOpen) {
      this.ui.toggleInventory(false);
    }
    this.isMenuOpen = true;
    this.engine.setInputBlocked(true);
    this.engine.unlockPointer();
    this.mobileControls.setVisible(false);

    const menuEl = document.getElementById('world-menu');
    if (!menuEl) return;
    menuEl.classList.remove('hidden');

    const titleEl = document.getElementById('menu-title');
    const resumeBtn = document.getElementById('btn-resume');
    const generateBtnText = document.getElementById('btn-generate-text');

    if (this.engine.hasStarted()) {
      if (titleEl) titleEl.innerText = 'Jogo Pausado';
      if (resumeBtn) resumeBtn.style.display = 'block';
      if (generateBtnText) generateBtnText.innerText = 'Recriar Mundo';
    } else {
      if (titleEl) titleEl.innerText = 'Criar Novo Mundo';
      if (resumeBtn) resumeBtn.style.display = 'none';
      if (generateBtnText) generateBtnText.innerText = 'Criar Novo Mundo';
    }
  }

  public closeMenu(): void {
    this.isMenuOpen = false;
    this.engine.setInputBlocked(this.ui.isChatOpen);
    if (!this.ui.isChatOpen) {
      this.mobileControls.setVisible(true);
    }
    const menuEl = document.getElementById('world-menu');
    if (menuEl) {
      menuEl.classList.add('hidden');
    }
  }

  public startGame(): void {
    this.closeMenu();

    const resumeBtn = document.getElementById('btn-resume');
    if (resumeBtn) resumeBtn.style.display = 'block';

    this.engine.start({
      worldType: this.selectedWorldType,
      mode: this.selectedMode === 'debug' ? 'creative' : 'survival',
      shaders: this.shadersEnabled
    });

    this.mobileControls.setVisible(true);
  }

  public resumeGame(): void {
    if (!this.engine.hasStarted()) return;
    this.closeMenu();
    this.engine.lockPointer();
  }

  private bindEngineEvents(): void {
    this.engine.on<EngineStats>('stats', (stats) => {
      this.stats.update();
      this.ui.update(stats as unknown as UIStats);

      const overlay = document.getElementById('underwater-overlay');
      if (overlay) {
        overlay.style.display = stats.isUnderwater ? 'block' : 'none';
      }
    });

    this.engine.on('world_init', (config) => {
      const type = (config?.type as WorldType) || WorldType.Standard;
      this.selectedWorldType = type;
      this.startGame();
    });

    this.engine.on('world_regen', (config) => {
      if (config?.type) {
        this.engine.regenerateWorld(config.type);
      }
    });

    this.engine.on<number>('selection_change', (type) => {
      if (typeof type === 'number') {
        this.ui.updateSelectedBlock(type);
      }
    });

    this.engine.on<{ text: string }>('chat:message', ({ text }) => {
      this.ui.addChatMessage(text);
      if (text.includes('Singularidade')) {
        this.playSingularitySound();
      } else if (text.includes('espaguetificado')) {
        this.playSpaghettifySound();
      } else if (text.includes('Colapso') || text.includes('implodiu')) {
        this.playImplosionSound();
      } else if (text.includes('FUSÃO GRAVITACIONAL')) {
        this.playGravitationalWaveSound();
      }
    });

    this.engine.on<{ x: number; y: number; z: number; radius: number }>('blackhole:merger', () => {
      this.playGravitationalWaveSound();
    });

    this.engine.on<{ position: any; radius: number; soundType?: string }>('explosion:occurred', ({ radius, soundType }) => {
      if (soundType === 'nuke') {
        this.triggerNuclearFlash();
        this.playNuclearSound();
      } else {
        this.playExplosionSound(radius);
      }
    });

    this.engine.on('beam:charging_start', () => {
      this.playKamehamehaChargeSound();
    });

    this.engine.on('beam:charging_stop', () => {
      this.stopKamehamehaChargeSound();
    });

    this.engine.on<{ type: string; origin: any; target: any; radius: number; charge?: number }>('beam:fired', ({ type, radius, charge }) => {
      if (type === 'lightning') {
        this.playLightningSound();
      } else if (type === 'laser') {
        this.playLaserSound();
      } else if (type === 'orbital') {
        this.playLightningSound();
        this.playExplosionSound(radius ?? 12);
      } else if (type === 'kamehameha') {
        this.playKamehamehaSound(charge ?? 1.0);
      }
    });

    this.engine.on<BlockBreakEvent>('block:break', ({ position, blockType }) => {
      // Evento de bloco quebrado disparado pela engine
    });

    this.engine.on<BlockPlaceEvent>('block:place', ({ position, blockType }) => {
      // Evento de bloco colocado disparado pela engine
    });

    this.engine.on<{ isLocked: boolean; wasLocked: boolean }>('lock_change', ({ isLocked, wasLocked }) => {
      if (wasLocked && !isLocked) {
        if (!this.ui.isChatOpen && !this.ui.isInventoryOpen && this.engine.hasStarted() && !this.isMenuOpen) {
          this.openMenu();
        }
      }
    });
  }

  private audioCtx: AudioContext | null = null;

  private getAudioContext(): AudioContext | null {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  private lastSoundTime = 0;

  private playSingularitySound(): void {
    try {
      if (performance.now() - this.lastSoundTime < 500) return;
      this.lastSoundTime = performance.now();

      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 2.2);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.exponentialRampToValueAtTime(80, now + 2.2);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 2.6);
    } catch {
      // Audio autoplay policy or hardware limitation
    }
  }

  private playSpaghettifySound(): void {
    try {
      if (performance.now() - this.lastSoundTime < 500) return;
      this.lastSoundTime = performance.now();

      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.9);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 1.2);
    } catch {
      // Ignore audio error
    }
  }

  private playImplosionSound(): void {
    try {
      if (performance.now() - this.lastSoundTime < 500) return;
      this.lastSoundTime = performance.now();

      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(50, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.3);
      osc.frequency.exponentialRampToValueAtTime(20, now + 1.8);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 2.1);
    } catch {
      // Ignore audio error
    }
  }

  private playGravitationalWaveSound(): void {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // 1. Chirp de ondas gravitacionais (frequência sobe exponencialmente até a coalescência)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(45, now);
      osc.frequency.exponentialRampToValueAtTime(340, now + 1.25);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.linearRampToValueAtTime(0.38, now + 1.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 1.5);

      // 2. Ringdown grave sub-bass do horizonte de eventos coalescido
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();

      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(75, now + 1.2);
      subOsc.frequency.exponentialRampToValueAtTime(28, now + 2.5);

      subGain.gain.setValueAtTime(0.001, now);
      subGain.gain.setValueAtTime(0.42, now + 1.2);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 2.6);

      subOsc.connect(subGain);
      subGain.connect(ctx.destination);

      subOsc.start(now + 1.2);
      subOsc.stop(now + 2.7);
    } catch {
      // Ignore audio error
    }
  }

  private playLightningSound(): void {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // 1. Estalo elétrico inicial (alta frequência instantânea)
      const crackOsc = ctx.createOscillator();
      const crackGain = ctx.createGain();

      crackOsc.type = 'sawtooth';
      crackOsc.frequency.setValueAtTime(2400, now);
      crackOsc.frequency.exponentialRampToValueAtTime(120, now + 0.12);

      crackGain.gain.setValueAtTime(0.4, now);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      crackOsc.connect(crackGain);
      crackGain.connect(ctx.destination);

      crackOsc.start(now);
      crackOsc.stop(now + 0.2);

      // 2. Trovão retumbante no peito (sub-bass rumble)
      const thunderOsc = ctx.createOscillator();
      const thunderGain = ctx.createGain();

      thunderOsc.type = 'triangle';
      thunderOsc.frequency.setValueAtTime(85, now + 0.04);
      thunderOsc.frequency.exponentialRampToValueAtTime(22, now + 1.8);

      thunderGain.gain.setValueAtTime(0.001, now);
      thunderGain.gain.setValueAtTime(0.45, now + 0.05);
      thunderGain.gain.exponentialRampToValueAtTime(0.001, now + 1.9);

      thunderOsc.connect(thunderGain);
      thunderGain.connect(ctx.destination);

      thunderOsc.start(now + 0.04);
      thunderOsc.stop(now + 2.0);
    } catch {
      // Ignore audio error
    }
  }

  private playLaserSound(): void {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.35);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch {
      // Ignore audio error
    }
  }

  private playExplosionSound(radius: number = 5.0): void {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const scale = Math.min(2.5, Math.max(0.6, radius / 5.0));

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110 * scale, now);
      osc.frequency.exponentialRampToValueAtTime(20, now + 0.6 * scale);

      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8 * scale);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.85 * scale);
    } catch {
      // Ignore audio error
    }
  }

  private chargeAudioNodes: {
    osc: OscillatorNode;
    gain: GainNode;
    lfo: OscillatorNode;
    lfoGain: GainNode;
  } | null = null;

  private playKamehamehaChargeSound(): void {
    try {
      this.stopKamehamehaChargeSound();
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      // Drone e subida contínua de pitch de Ki
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(580, now + 3.0);

      // LFO para modulação trêmula de energia (14 Hz aumentando para 26 Hz)
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(14, now);
      lfo.frequency.linearRampToValueAtTime(26, now + 3.0);
      lfoGain.gain.setValueAtTime(0.12, now);

      lfo.connect(gain.gain);
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.4);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(350, now);
      filter.frequency.exponentialRampToValueAtTime(1200, now + 3.0);
      filter.Q.value = 3.5;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      lfo.start(now);

      this.chargeAudioNodes = { osc, gain, lfo, lfoGain };
    } catch {
      // Audio error ignored
    }
  }

  private stopKamehamehaChargeSound(): void {
    if (!this.chargeAudioNodes) return;
    try {
      const ctx = this.getAudioContext();
      if (ctx) {
        const now = ctx.currentTime;
        this.chargeAudioNodes.gain.gain.linearRampToValueAtTime(0.001, now + 0.05);
        this.chargeAudioNodes.osc.stop(now + 0.06);
        this.chargeAudioNodes.lfo.stop(now + 0.06);
      }
    } catch {
      // Audio error ignored
    }
    this.chargeAudioNodes = null;
  }

  private playKamehamehaSound(charge = 1.0): void {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const power = Math.max(0.3, Math.min(2.0, charge));

      // 1. Rugido do Feixe de Plasma Ki (Sawtooth + Filtro Bandpass)
      const beamDuration = 1.0 + power * 1.0;
      const beamOsc = ctx.createOscillator();
      const beamFilter = ctx.createBiquadFilter();
      const beamGain = ctx.createGain();

      beamOsc.type = 'sawtooth';
      beamOsc.frequency.setValueAtTime(110 + power * 35, now);
      beamOsc.frequency.exponentialRampToValueAtTime(50, now + beamDuration);

      beamFilter.type = 'bandpass';
      beamFilter.frequency.setValueAtTime(800 + power * 350, now);
      beamFilter.frequency.exponentialRampToValueAtTime(280, now + beamDuration * 0.9);
      beamFilter.Q.value = 4.0;

      beamGain.gain.setValueAtTime(0.001, now);
      beamGain.gain.linearRampToValueAtTime(Math.min(0.65, 0.35 * power + 0.15), now + 0.06);
      beamGain.gain.setValueAtTime(0.35 * power, now + beamDuration * 0.5);
      beamGain.gain.exponentialRampToValueAtTime(0.001, now + beamDuration);

      beamOsc.connect(beamFilter);
      beamFilter.connect(beamGain);
      beamGain.connect(ctx.destination);

      beamOsc.start(now);
      beamOsc.stop(now + beamDuration + 0.05);

      // 2. Sub-bass estrondoso proporcional à carga
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(65 + power * 20, now);
      subOsc.frequency.exponentialRampToValueAtTime(24, now + beamDuration * 1.1);

      subGain.gain.setValueAtTime(0.001, now);
      subGain.gain.linearRampToValueAtTime(Math.min(0.7, 0.4 * power + 0.1), now + 0.05);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + beamDuration * 1.1);

      subOsc.connect(subGain);
      subGain.connect(ctx.destination);

      subOsc.start(now);
      subOsc.stop(now + beamDuration * 1.15);

      // 3. Ruído branco filtrado (varredura sônica de pressão de ar)
      const bufferSize = Math.floor(ctx.sampleRate * Math.min(2.0, beamDuration));
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(1600 * power, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(180, now + beamDuration * 0.9);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.001, now);
      noiseGain.gain.linearRampToValueAtTime(0.25 * power, now + 0.08);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + beamDuration);

      whiteNoise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      whiteNoise.start(now);
      whiteNoise.stop(now + beamDuration + 0.05);
    } catch {
      // Audio error ignored
    }
  }

  private playNuclearSound(): void {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // 1. Estalo e onda de choque de pressão do ar
      const flashOsc = ctx.createOscillator();
      const flashGain = ctx.createGain();
      flashOsc.type = 'sawtooth';
      flashOsc.frequency.setValueAtTime(3200, now);
      flashOsc.frequency.exponentialRampToValueAtTime(80, now + 0.18);
      flashGain.gain.setValueAtTime(0.5, now);
      flashGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      flashOsc.connect(flashGain);
      flashGain.connect(ctx.destination);
      flashOsc.start(now);
      flashOsc.stop(now + 0.25);

      // 2. Detonação atômica com grave profundo e reverberação sísmica de 4 segundos
      const nukeOsc = ctx.createOscillator();
      const nukeGain = ctx.createGain();
      nukeOsc.type = 'triangle';
      nukeOsc.frequency.setValueAtTime(75, now + 0.08);
      nukeOsc.frequency.exponentialRampToValueAtTime(14, now + 3.8);

      nukeGain.gain.setValueAtTime(0.001, now);
      nukeGain.gain.setValueAtTime(0.7, now + 0.12);
      nukeGain.gain.exponentialRampToValueAtTime(0.001, now + 4.2);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(380, now + 0.1);
      filter.frequency.exponentialRampToValueAtTime(45, now + 4.0);

      nukeOsc.connect(filter);
      filter.connect(nukeGain);
      nukeGain.connect(ctx.destination);

      nukeOsc.start(now + 0.08);
      nukeOsc.stop(now + 4.3);
    } catch {
      // Audio error ignored
    }
  }

  private triggerNuclearFlash(): void {
    const flashEl = document.getElementById('nuclear-flash-overlay');
    if (!flashEl) return;

    // Clarão ofuscante instantâneo branco puro
    flashEl.style.transition = 'none';
    flashEl.style.opacity = '0.98';

    // Fade out cinematográfico suave de 2.4 segundos
    setTimeout(() => {
      flashEl.style.transition = 'opacity 2.4s cubic-bezier(0.1, 0.8, 0.2, 1.0)';
      flashEl.style.opacity = '0';
    }, 70);
  }

  private bindUIEvents(): void {
    // Teclado global de atalhos do jogo/menu
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.key.toLowerCase() === 'e') {
        if (this.isMenuOpen || this.ui.isChatOpen) return;
        e.preventDefault();
        this.ui.toggleInventory();
        return;
      }

      if (e.key === 'Escape') {
        if (this.ui.isInventoryOpen) {
          e.preventDefault();
          this.ui.toggleInventory(false);
          return;
        }
        if (this.isMenuOpen) {
          if (this.engine.hasStarted()) {
            e.preventDefault();
            this.resumeGame();
          }
        } else if (!this.ui.isChatOpen && this.engine.hasStarted()) {
          e.preventDefault();
          this.openMenu();
        }
        return;
      }

      if (e.key.toLowerCase() === ';') {
        if (this.isMenuOpen || this.ui.isInventoryOpen) return;
        e.preventDefault();
        this.ui.toggleChat();
      }
    });

    this.ui.onToggle = (isOpen: boolean) => {
      this.engine.setInputBlocked(isOpen || this.isMenuOpen || this.ui.isInventoryOpen);
      this.mobileControls.setVisible(!isOpen && !this.isMenuOpen && !this.ui.isInventoryOpen);
      if (isOpen) {
        this.engine.unlockPointer();
      } else {
        if (!this.isMenuOpen && !this.ui.isInventoryOpen && this.engine.hasStarted()) {
          this.engine.lockPointer();
        }
      }
    };

    this.ui.onToggleInventory = (isOpen: boolean) => {
      this.engine.setInputBlocked(isOpen || this.isMenuOpen || this.ui.isChatOpen);
      this.mobileControls.setVisible(!isOpen && !this.isMenuOpen && !this.ui.isChatOpen);
      if (isOpen) {
        this.engine.unlockPointer();
      } else {
        if (!this.isMenuOpen && !this.ui.isChatOpen && this.engine.hasStarted()) {
          this.engine.lockPointer();
        }
      }
    };

    this.ui.onUpdateHotbar = (types: number[]) => {
      this.engine.setHotbar(types);
    };

    this.ui.onOpenMenu = () => {
      this.openMenu();
    };

    this.ui.onSelectBlock = (type: number) => {
      this.engine.selectBlock(type);
    };

    this.ui.onCommand = (cmd: string, args: string[]) => {
      this.engine.sendCommand(cmd, args);
    };
  }

  private initMenu(): void {
    const menuEl = document.getElementById('world-menu')!;
    const generateBtn = document.getElementById('btn-generate')!;
    const resumeBtn = document.getElementById('btn-resume')!;
    const worldBtns = document.querySelectorAll<HTMLButtonElement>('.world-btn');
    const descBox = document.getElementById('world-desc');
    const modeBtn = document.getElementById('btn-mode-toggle');
    const modeText = document.getElementById('mode-text');
    const modeDesc = document.getElementById('mode-desc');
    const shadersBtn = document.getElementById('shaders-toggle');
    const shadersText = document.getElementById('shaders-text');

    menuEl.addEventListener('mousedown', (e: MouseEvent) => e.stopPropagation());
    menuEl.addEventListener('click', (e: MouseEvent) => e.stopPropagation());

    worldBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        worldBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const type = (btn.getAttribute('data-type') as WorldType) || WorldType.Standard;
        this.selectedWorldType = type;
        if (descBox && WORLD_DESCRIPTIONS[type]) {
          descBox.innerText = WORLD_DESCRIPTIONS[type];
        }
      });
    });

    if (modeBtn && modeText && modeDesc) {
      modeBtn.addEventListener('click', () => {
        if (this.selectedMode === 'debug') {
          this.selectedMode = 'normal';
          modeText.innerText = 'Sobrevivência';
          modeDesc.innerText = 'Física e gravidade ativadas.';
        } else {
          this.selectedMode = 'debug';
          modeText.innerText = 'Criativo';
          modeDesc.innerText = 'Voo livre e sem restrições.';
        }

        if (this.engine.hasStarted()) {
          this.engine.setGameMode(this.selectedMode === 'debug' ? 'creative' : 'survival');
        }
      });
    }

    if (shadersBtn && shadersText) {
      shadersBtn.addEventListener('click', () => {
        this.shadersEnabled = !this.shadersEnabled;
        shadersText.innerText = this.shadersEnabled ? 'Ativado' : 'Desativado';

        if (this.engine.hasStarted()) {
          this.engine.toggleShaders(this.shadersEnabled);
        }
      });
    }

    generateBtn.addEventListener('click', () => {
      this.startGame();
    });

    resumeBtn.addEventListener('click', () => {
      this.resumeGame();
    });
  }
}

new Game();
