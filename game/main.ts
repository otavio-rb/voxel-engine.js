import Stats from 'three/examples/jsm/libs/stats.module.js';
import { VoxelEngine, EngineStats, BlockBreakEvent, BlockPlaceEvent } from '@voxel/engine';
import UI, { UIStats } from './ui/UI';
import { WorldType } from './types';

const WORLD_DESCRIPTIONS: Record<string, string> = {
  [WorldType.Standard]: 'Mundo padrão: Vastas florestas (carvalho, bétula, pinheiros, cerejeiras, selva), desertos com cactos e tundras com biomas em macro-escala.',
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
  private readonly stats: Stats;

  private isMenuOpen = true;
  private selectedWorldType: WorldType = WorldType.Standard;
  private selectedMode: 'debug' | 'normal' = 'debug';
  private shadersEnabled = true;

  constructor() {
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

    this.bindEngineEvents();
    this.bindUIEvents();
    this.initMenu();
  }

  public openMenu(): void {
    this.isMenuOpen = true;
    this.engine.setInputBlocked(true);
    this.engine.unlockPointer();

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

    this.engine.on<{ type: string; origin: any; target: any; radius: number }>('beam:fired', ({ type, radius }) => {
      if (type === 'lightning') {
        this.playLightningSound();
      } else if (type === 'laser') {
        this.playLaserSound();
      } else if (type === 'orbital') {
        this.playLightningSound();
        this.playExplosionSound(radius ?? 12);
      }
    });

    this.engine.on<BlockBreakEvent>('block:break', ({ position, blockType }) => {
      // Evento de bloco quebrado disparado pela engine
    });

    this.engine.on<BlockPlaceEvent>('block:place', ({ position, blockType }) => {
      // Evento de bloco colocado disparado pela engine
    });

    this.engine.on<{ progress: number; targetDimId: string; colorHex: number }>('portal:absorption', ({ progress, colorHex }) => {
      this.updatePortalAbsorption(progress, colorHex);
    });

    this.engine.on<{ isLocked: boolean; wasLocked: boolean }>('lock_change', ({ isLocked, wasLocked }) => {
      if (wasLocked && !isLocked) {
        if (!this.ui.isChatOpen && this.engine.hasStarted()) {
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

  private portalOsc: OscillatorNode | null = null;
  private portalGain: GainNode | null = null;
  private portalFilter: BiquadFilterNode | null = null;

  private playPortalSuctionSound(progress: number): void {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      if (!this.portalOsc) {
        this.portalOsc = ctx.createOscillator();
        this.portalGain = ctx.createGain();
        this.portalFilter = ctx.createBiquadFilter();

        this.portalOsc.type = 'sawtooth';
        this.portalFilter.type = 'lowpass';
        this.portalFilter.Q.value = 6.0;

        this.portalGain.gain.setValueAtTime(0.001, ctx.currentTime);
        this.portalOsc.connect(this.portalFilter);
        this.portalFilter.connect(this.portalGain);
        this.portalGain.connect(ctx.destination);
        this.portalOsc.start();
      }

      const now = ctx.currentTime;
      const freq = 65 + Math.pow(progress, 2.0) * 380;
      const cutoff = 180 + Math.pow(progress, 1.8) * 2400;
      const vol = Math.min(0.55, progress * 0.55);

      this.portalOsc.frequency.setTargetAtTime(freq, now, 0.05);
      this.portalFilter!.frequency.setTargetAtTime(cutoff, now, 0.05);
      this.portalGain!.gain.setTargetAtTime(vol, now, 0.05);
    } catch {
      // Audio error ignored
    }
  }

  private stopPortalSuctionSound(): void {
    if (this.portalGain && this.audioCtx) {
      this.portalGain.gain.setTargetAtTime(0.0001, this.audioCtx.currentTime, 0.08);
    }
  }

  private updatePortalAbsorption(progress: number, colorHex: number): void {
    const overlay = document.getElementById('portal-absorption-overlay');
    if (!overlay) return;

    if (progress <= 0.01) {
      overlay.style.opacity = '0';
      overlay.style.transform = 'scale(1.0) rotate(0deg)';
      overlay.style.background = 'none';
      overlay.style.backdropFilter = 'none';
      this.stopPortalSuctionSound();
      return;
    }

    const hex = (colorHex || 0x9c27b0).toString(16).padStart(6, '0');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    const opacity = Math.min(1.0, Math.pow(progress, 1.2) * 1.05);
    overlay.style.opacity = String(opacity);

    const rot = (progress * 45).toFixed(1);
    const scale = (1.0 + progress * 0.28).toFixed(2);
    overlay.style.transform = `scale(${scale}) rotate(${rot}deg)`;

    const coreAlpha = Math.min(0.98, progress * 1.3);
    const midAlpha = Math.min(0.85, progress * 1.1);
    const edgeAlpha = Math.min(0.5, progress * 0.8);

    overlay.style.background = `radial-gradient(circle at center, rgba(0, 0, 0, ${coreAlpha}) 0%, rgba(${r}, ${g}, ${b}, ${midAlpha}) ${Math.max(15, 45 - progress * 20)}%, rgba(0, 0, 0, ${midAlpha}) 72%, rgba(${r}, ${g}, ${b}, ${edgeAlpha}) 100%)`;
    overlay.style.backdropFilter = `blur(${progress * 12}px) contrast(${100 + progress * 120}%) saturate(${100 + progress * 180}%)`;

    this.playPortalSuctionSound(progress);
  }

  private bindUIEvents(): void {
    // Teclado global de atalhos do jogo/menu
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.key === 'Escape') {
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
        if (this.isMenuOpen) return;
        e.preventDefault();
        this.ui.toggleChat();
      }
    });

    this.ui.onToggle = (isOpen: boolean) => {
      this.engine.setInputBlocked(isOpen || this.isMenuOpen);
      if (isOpen) {
        this.engine.unlockPointer();
      } else {
        if (!this.isMenuOpen && this.engine.hasStarted()) {
          this.engine.lockPointer();
        }
      }
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
