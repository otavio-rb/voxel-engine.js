import { VoxelEngine } from '@voxel/engine';
import { TINY_BLOCK_METAS, TinyBlockMeta, TinyBlockType } from '../content/blocks';
import type { SculptMode } from '../types';
import { BRUSH_RADII_BLOCKS } from '../plugins/sculptor';

export interface TinyUIOptions {
  engine: VoxelEngine;
  /** Voxels por bloco do mundo, para a UI poder mostrar volumes em voxels. */
  voxelsPerBlock: number;
  onOpenHelp?: () => void;
}

function adjustHex(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

function renderVoxelCubeSvg(hexColor: string, size = 32): string {
  const top = adjustHex(hexColor, 28);
  const left = hexColor;
  const right = adjustHex(hexColor, -35);

  return `
    <svg class="voxel-cube-svg" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none">
      <!-- Top Face -->
      <polygon points="16,3 29,10 16,17 3,10" fill="${top}" stroke="#14171d" stroke-width="1.2" stroke-linejoin="round"/>
      <!-- Left Face -->
      <polygon points="3,10 16,17 16,29 3,22" fill="${left}" stroke="#14171d" stroke-width="1.2" stroke-linejoin="round"/>
      <!-- Right Face -->
      <polygon points="16,17 29,10 29,22 16,29" fill="${right}" stroke="#14171d" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>
  `;
}

class VoxelSound {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx && typeof AudioContext !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public playBlip(freq = 440, type: OscillatorType = 'square', duration = 0.04) {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {
      // Audio safe fallback
    }
  }

  public playSelect() {
    this.playBlip(560, 'square', 0.035);
  }

  public playToggle() {
    this.playBlip(380, 'triangle', 0.06);
  }

  public playOpen() {
    this.playBlip(440, 'square', 0.04);
    setTimeout(() => this.playBlip(660, 'square', 0.04), 45);
  }
}

export class TinyUI {
  private readonly engine: VoxelEngine;
  private readonly voxelsPerBlock: number;
  private readonly sound = new VoxelSound();

  private currentMode: SculptMode = 'add';
  private currentBrushRadius: number = BRUSH_RADII_BLOCKS[0];
  private currentSlotIndex = 0;
  private activeCategory: string = 'all';
  private isGravityActive = true;
  /** Enquanto houver aviso ativo, a telemetria nao sobrescreve o campo. */
  private noticeUntil = 0;

  private hotbarTypes: TinyBlockType[] = [
    TinyBlockType.Marble,
    TinyBlockType.DarkSlate,
    TinyBlockType.Terracotta,
    TinyBlockType.LushGrass,
    TinyBlockType.SakuraBlossom,
    TinyBlockType.DeepOak,
    TinyBlockType.WhitePlaster,
    TinyBlockType.AmethystViolet,
    TinyBlockType.NeonCyan
  ];

  constructor(options: TinyUIOptions) {
    this.engine = options.engine;
    this.voxelsPerBlock = options.voxelsPerBlock;
    this.bindDOM();
    this.bindShortcuts();
    this.renderHotbar();
    this.renderMaterialLibrary();
    this.setMode(this.currentMode);
    this.setBrushRadius(this.currentBrushRadius);
  }

  private bindDOM(): void {
    // Mode buttons
    const modeBtns = document.querySelectorAll<HTMLButtonElement>('.mode-btn');
    modeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode as SculptMode;
        if (mode) {
          this.setMode(mode);
          this.sound.playSelect();
        }
      });
    });

    // Brush buttons
    const brushBtns = document.querySelectorAll<HTMLButtonElement>('.brush-btn');
    brushBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const radius = parseFloat(btn.dataset.radius || '0.2');
        this.setBrushRadius(radius);
        this.sound.playSelect();
      });
    });

    // Toggle Gravity button
    const btnToggleGravity = document.getElementById('btn-toggle-gravity');
    btnToggleGravity?.addEventListener('click', () => {
      this.engine.send('tiny:toggle_gravity', {});
      this.sound.playToggle();
    });

    // Reset spawn button
    const btnReset = document.getElementById('btn-reset-view');
    btnReset?.addEventListener('click', () => {
      this.engine.send('tiny:reset_spawn', {});
      this.sound.playSelect();
    });

    // Material library open/close
    const btnAllMats = document.getElementById('btn-open-palette');
    const modalMats = document.getElementById('materials-modal');
    const btnCloseMats = document.getElementById('modal-close-materials');

    btnAllMats?.addEventListener('click', () => {
      modalMats?.classList.add('open');
      this.sound.playOpen();
    });
    btnCloseMats?.addEventListener('click', () => {
      modalMats?.classList.remove('open');
      this.sound.playSelect();
    });

    // Help modal open/close
    const btnHelp = document.getElementById('btn-open-help');
    const modalHelp = document.getElementById('help-modal');
    const btnCloseHelp = document.getElementById('modal-close-help');

    btnHelp?.addEventListener('click', () => {
      modalHelp?.classList.add('open');
      this.sound.playOpen();
    });
    btnCloseHelp?.addEventListener('click', () => {
      modalHelp?.classList.remove('open');
      this.sound.playSelect();
    });

    // Category filter chips in material library
    const catChips = document.querySelectorAll<HTMLButtonElement>('.cat-chip');
    catChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        catChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        this.activeCategory = chip.dataset.cat || 'all';
        this.renderMaterialLibrary();
        this.sound.playSelect();
      });
    });

    // Gravity change notice from worker
    this.engine.on('tiny:gravity_change', (data: any) => {
      this.isGravityActive = !!data.gravity;
      this.updateGravityUI();
    });

    // Telemetry updates from engine
    this.engine.on('tiny:stats_update', (data: any) => {
      this.updateTelemetry(data);
    });

    /**
     * Perfil da thread que RENDERIZA, uma vez por segundo.
     */
    this.engine.on('engine:profile', (p: any) => {
      const el = document.getElementById('perf-readout');
      if (!el) return;
      const phases = Object.entries(p.phases as Record<string, { maxMs: number; totalMs: number; calls: number }>)
        .sort((a, b) => b[1].totalMs - a[1].totalMs)
        .slice(0, 3)
        .map(([name, v]) => `${name}:${v.totalMs.toFixed(0)}ms`)
        .join(' ');
      el.textContent = `FPS:${p.fps} | FRAME:${p.worstFrameMs}ms | ${phases}`;
      el.classList.toggle('bad', p.worstFrameMs > 50);
    });

    // Avisos do motor
    this.engine.on('tiny:notice', (data: any) => {
      const el = document.getElementById('stat-target');
      if (!el) return;
      el.textContent = String(data?.text ?? '');
      this.noticeUntil = Date.now() + 2500;
    });
  }

  private updateGravityUI(): void {
    const label = document.getElementById('gravity-status-label');
    const statGravity = document.getElementById('stat-gravity');
    const btn = document.getElementById('btn-toggle-gravity');

    if (this.isGravityActive) {
      if (label) label.textContent = 'GRAVIDADE: ON [F]';
      if (statGravity) {
        statGravity.textContent = 'Gravidade (1.0G)';
        statGravity.className = 'telemetry-value gravity-tag active';
      }
      btn?.classList.remove('fly-mode');
    } else {
      if (label) label.textContent = 'VOO LIVRE [F]';
      if (statGravity) {
        statGravity.textContent = 'Voo Livre (Criativo)';
        statGravity.className = 'telemetry-value gravity-tag fly';
      }
      btn?.classList.add('fly-mode');
    }
  }

  private bindShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      // Ignore if modal or input is focused
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Numbers 1-9
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        this.selectSlot(idx);
        this.sound.playSelect();
      } else if (e.key.toLowerCase() === 'b') {
        // Cicla o raio do pincel
        const radii = BRUSH_RADII_BLOCKS;
        const nextIdx = (radii.indexOf(this.currentBrushRadius as never) + 1) % radii.length;
        this.setBrushRadius(radii[nextIdx]);
        this.sound.playSelect();
      } else if (e.key.toLowerCase() === 'm') {
        // Cycle mode
        const modes: SculptMode[] = ['add', 'carve', 'paint'];
        const nextIdx = (modes.indexOf(this.currentMode) + 1) % modes.length;
        this.setMode(modes[nextIdx]);
        this.sound.playSelect();
      } else if (e.key.toLowerCase() === 'e') {
        // Toggle material library
        const modal = document.getElementById('materials-modal');
        const isOpen = modal?.classList.toggle('open');
        if (isOpen) this.sound.playOpen();
      } else if (e.key.toLowerCase() === 'h') {
        // Toggle help
        const modal = document.getElementById('help-modal');
        const isOpen = modal?.classList.toggle('open');
        if (isOpen) this.sound.playOpen();
      }
    });
  }

  public setMode(mode: SculptMode): void {
    this.currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.mode === mode);
    });
    this.notifyEngineSculpt();
  }

  public setBrushRadius(radiusBlocks: number): void {
    this.currentBrushRadius = radiusBlocks;
    document.querySelectorAll('.brush-btn').forEach((b) => {
      b.classList.toggle('active', parseFloat((b as HTMLElement).dataset.radius || '0') === radiusBlocks);
    });
    const el = document.getElementById('stat-brush');
    if (el) {
      const r = radiusBlocks * this.voxelsPerBlock;
      const voxels = Math.round((4 / 3) * Math.PI * r * r * r);
      el.textContent = `Esfera r=${r.toFixed(0)}vx (~${voxels} vx)`;
    }
    this.notifyEngineSculpt();
  }

  public selectSlot(idx: number): void {
    if (idx < 0 || idx >= this.hotbarTypes.length) return;
    this.currentSlotIndex = idx;
    const type = this.hotbarTypes[idx];

    // Update UI slots
    document.querySelectorAll('.palette-slot').forEach((slot, i) => {
      slot.classList.toggle('active', i === idx);
    });

    this.engine.send('select_slot', { index: idx });
    this.engine.send('select_block', { type });
    this.notifyEngineSculpt();
  }

  public setSlotBlock(idx: number, type: TinyBlockType): void {
    this.hotbarTypes[idx] = type;
    this.renderHotbar();
    this.selectSlot(idx);
    this.sound.playSelect();
  }

  private notifyEngineSculpt(): void {
    const selectedBlock = this.hotbarTypes[this.currentSlotIndex];
    this.engine.send('tiny:set_sculpt', {
      mode: this.currentMode,
      brushRadiusBlocks: this.currentBrushRadius,
      blockType: selectedBlock
    });
  }

  private renderHotbar(): void {
    const container = document.getElementById('hotbar-slots');
    if (!container) return;
    container.innerHTML = '';

    this.hotbarTypes.forEach((type, idx) => {
      const meta = TINY_BLOCK_METAS.find((m) => m.id === type);
      const slot = document.createElement('div');
      slot.className = `palette-slot ${idx === this.currentSlotIndex ? 'active' : ''}`;
      slot.title = `[${idx + 1}] ${meta ? meta.name : 'Voxel'}`;

      // 3D Isometric Voxel Cube
      const cubeContainer = document.createElement('div');
      cubeContainer.className = 'slot-cube-wrap';
      cubeContainer.innerHTML = renderVoxelCubeSvg(meta ? meta.colorHex : '#888888', 36);
      slot.appendChild(cubeContainer);

      // Slot index badge in pixel font
      const num = document.createElement('span');
      num.className = 'slot-num';
      num.textContent = `${idx + 1}`;
      slot.appendChild(num);

      slot.addEventListener('click', () => {
        this.selectSlot(idx);
        this.sound.playSelect();
      });

      container.appendChild(slot);
    });
  }

  private renderMaterialLibrary(): void {
    const grid = document.getElementById('materials-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const filtered = this.activeCategory === 'all'
      ? TINY_BLOCK_METAS
      : TINY_BLOCK_METAS.filter((m) => m.category === this.activeCategory);

    filtered.forEach((meta) => {
      const card = document.createElement('div');
      card.className = 'material-card';

      const preview = document.createElement('div');
      preview.className = 'material-preview';
      preview.innerHTML = renderVoxelCubeSvg(meta.colorHex, 48);

      const name = document.createElement('div');
      name.className = 'material-name';
      name.textContent = meta.name;

      card.appendChild(preview);
      card.appendChild(name);

      card.addEventListener('click', () => {
        this.setSlotBlock(this.currentSlotIndex, meta.id);
        const modal = document.getElementById('materials-modal');
        modal?.classList.remove('open');
      });

      grid.appendChild(card);
    });
  }

  private updateTelemetry(data: {
    x: number;
    y: number;
    z: number;
    targetBlock: string;
    hitDist: number | null;
    gravity?: boolean;
  }): void {
    const posEl = document.getElementById('stat-pos');
    const targetEl = document.getElementById('stat-target');

    if (posEl) posEl.textContent = `X:${data.x} Y:${data.y} Z:${data.z}`;
    if (targetEl && Date.now() > this.noticeUntil) {
      targetEl.textContent = data.hitDist ? `${data.targetBlock} (${data.hitDist}m)` : data.targetBlock;
    }

    if (data.gravity !== undefined && data.gravity !== this.isGravityActive) {
      this.isGravityActive = data.gravity;
      this.updateGravityUI();
    }
  }
}

