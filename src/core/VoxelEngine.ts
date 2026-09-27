import { EventEmitter } from './EventEmitter';
import { WorldType } from '../types';
import { BlockRegistry, blockRegistry, BlockConfig } from './BlockRegistry';
import { WorldGenerator } from './world/WorldGenerator';
import { WorldGeneratorRegistry, worldGeneratorRegistry } from './world/WorldGeneratorRegistry';
import { EntityRegistry, entityRegistry, EntityFactory } from './entities/EntityRegistry';

export interface VoxelEngineOptions {
  canvas: HTMLCanvasElement;
  workerUrl?: URL | string;
}

export interface EngineStats {
  x: number;
  y: number;
  z: number;
  geometries: number;
  textures: number;
  frame: number;
  calls: number;
  triangles: number;
  isUnderwater: boolean;
}

export interface BlockBreakEvent {
  position: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  blockType?: number;
}

export interface BlockPlaceEvent {
  position: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  blockType: number;
}

export class VoxelEngine extends EventEmitter {
  public readonly blocks: BlockRegistry = blockRegistry;
  public readonly generators: WorldGeneratorRegistry = worldGeneratorRegistry;
  public readonly entities: EntityRegistry = entityRegistry;
  private readonly canvas: HTMLCanvasElement;
  private readonly worker: Worker;

  private isLocked = false;
  private isLocking = false;
  private isStarted = false;
  private isInputBlocked = false;

  private cleanupListeners: Array<() => void> = [];

  constructor(options: VoxelEngineOptions) {
    super();
    this.canvas = options.canvas;

    const offscreen = this.canvas.transferControlToOffscreen();
    const workerUrl = options.workerUrl || new URL('../Workers/RenderWorker.ts', import.meta.url);
    this.worker = new Worker(workerUrl, { type: 'module' });

    this.worker.postMessage(
      {
        type: 'init',
        payload: {
          canvas: offscreen,
          width: window.innerWidth,
          height: window.innerHeight,
          pixelRatio: Math.min(window.devicePixelRatio, 2)
        }
      },
      [offscreen]
    );

    this.setupWorkerMessaging();
    this.setupInputListeners();
  }

  public start(config?: {
    worldType?: WorldType;
    mode?: 'creative' | 'survival';
    shaders?: boolean;
  }): void {
    this.isStarted = true;

    this.sendCommand('/start');
    this.sendCommand('/spawn');

    if (config?.worldType) {
      this.sendCommand('/regen', [config.worldType]);
    }

    if (config?.mode) {
      this.sendCommand(config.mode === 'creative' ? '/creative' : '/survival');
    }

    if (typeof config?.shaders === 'boolean') {
      this.sendCommand('/shaders', [config.shaders ? 'on' : 'off']);
    }

    this.lockPointer();
  }

  public async lockPointer(): Promise<void> {
    if (this.isLocked || this.isLocking || this.isInputBlocked) {
      return;
    }

    this.isLocking = true;
    try {
      const lockPromise = this.canvas.requestPointerLock() as any;
      if (lockPromise && typeof lockPromise.catch === 'function') {
        await lockPromise.catch((err: any) => {
          console.warn('Pointer lock request notice:', err);
        });
      }
    } catch (err) {
      console.warn('Pointer lock request notice:', err);
    } finally {
      setTimeout(() => {
        this.isLocking = false;
      }, 300);
    }
  }

  public unlockPointer(): void {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  public isLockedPointer(): boolean {
    return this.isLocked;
  }

  public hasStarted(): boolean {
    return this.isStarted;
  }

  public setInputBlocked(blocked: boolean): void {
    this.isInputBlocked = blocked;
  }

  public registerBlock(config: BlockConfig): void {
    this.blocks.register(config);
    this.worker.postMessage({ type: 'register_block', payload: config });
  }

  public registerGenerator(generator: WorldGenerator): void {
    this.generators.register(generator);
  }

  public registerEntity(type: string, factory: EntityFactory): void {
    this.entities.register(type, factory);
  }

  public selectBlock(type: number): void {
    this.worker.postMessage({ type: 'select_block', payload: { type } });
  }

  public selectSlot(index: number): void {
    this.worker.postMessage({ type: 'select_slot', payload: { index } });
  }

  public sendCommand(command: string, args: string[] = []): void {
    this.worker.postMessage({ type: 'command', payload: { command, args } });
  }

  public setGameMode(mode: 'creative' | 'survival'): void {
    this.sendCommand(mode === 'creative' ? '/creative' : '/survival');
  }

  public toggleShaders(enabled: boolean): void {
    this.sendCommand('/shaders', [enabled ? 'on' : 'off']);
  }

  public teleport(x: number, y: number, z: number): void {
    this.sendCommand('/tp', [x.toString(), y.toString(), z.toString()]);
  }

  public regenerateWorld(worldType: WorldType): void {
    this.sendCommand('/regen', [worldType]);
  }

  private setupWorkerMessaging(): void {
    this.worker.onmessage = (e: MessageEvent) => {
      const { type, stats, payload, config } = e.data;

      if (type === 'stats') {
        this.emit('stats', stats as EngineStats);
      } else if (type === 'event') {
        this.emit(e.data.event, payload);
      } else if (type === 'world_init') {
        this.emit('world_init', config);
      } else if (type === 'world_regen') {
        this.emit('world_regen', config);
      } else if (type === 'selection_change') {
        this.emit('selection_change', payload?.type);
      }
    };
  }

  private setupInputListeners(): void {
    // Resize
    const onResize = () => {
      this.worker.postMessage({
        type: 'resize',
        payload: { width: window.innerWidth, height: window.innerHeight }
      });
    };
    window.addEventListener('resize', onResize);
    this.cleanupListeners.push(() => window.removeEventListener('resize', onResize));

    // Keydown
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (this.isInputBlocked) return;

      this.emit('keydown', e);
      this.worker.postMessage({ type: 'keydown', payload: { key: e.key } });
    };
    document.addEventListener('keydown', onKeyDown);
    this.cleanupListeners.push(() => document.removeEventListener('keydown', onKeyDown));

    // Keyup
    const onKeyUp = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (this.isInputBlocked) return;

      this.emit('keyup', e);
      this.worker.postMessage({ type: 'keyup', payload: { key: e.key } });
    };
    document.addEventListener('keyup', onKeyUp);
    this.cleanupListeners.push(() => document.removeEventListener('keyup', onKeyUp));

    // Mouse Move
    const onMouseMove = (e: MouseEvent) => {
      if (!this.isLocked || this.isInputBlocked) return;
      this.worker.postMessage({
        type: 'mousemove',
        payload: { movementX: e.movementX, movementY: e.movementY }
      });
    };
    document.addEventListener('mousemove', onMouseMove);
    this.cleanupListeners.push(() => document.removeEventListener('mousemove', onMouseMove));

    // Mouse Down (quebrar/colocar blocos ou reconectar lock)
    const onMouseDown = (e: MouseEvent) => {
      if (this.isInputBlocked) return;
      if (e.button !== 0 && e.button !== 2) return;

      if (!this.isLocked) {
        if (e.target === this.canvas || (e.target as HTMLElement)?.id === 'scene') {
          this.lockPointer();
        }
        return;
      }

      this.worker.postMessage({ type: 'mousedown', payload: { button: e.button } });
      if (e.button === 2) {
        e.preventDefault();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    this.cleanupListeners.push(() => document.removeEventListener('mousedown', onMouseDown));

    // Previne menu de contexto com clique direito quando travado
    const onContextMenu = (e: MouseEvent) => {
      if (this.isLocked) {
        e.preventDefault();
      }
    };
    document.addEventListener('contextmenu', onContextMenu);
    this.cleanupListeners.push(() => document.removeEventListener('contextmenu', onContextMenu));

    // Pointer Lock change
    const onPointerLockChange = () => {
      const wasLocked = this.isLocked;
      this.isLocked = document.pointerLockElement === this.canvas;
      this.isLocking = false;

      this.worker.postMessage({ type: 'lock_state', payload: { isLocked: this.isLocked } });
      this.emit('lock_change', { isLocked: this.isLocked, wasLocked });
    };
    document.addEventListener('pointerlockchange', onPointerLockChange);
    this.cleanupListeners.push(() => document.removeEventListener('pointerlockchange', onPointerLockChange));

    const onPointerLockError = () => {
      this.isLocking = false;
    };
    document.addEventListener('pointerlockerror', onPointerLockError);
    this.cleanupListeners.push(() => document.removeEventListener('pointerlockerror', onPointerLockError));

    // Mouse Wheel
    const onWheel = (e: WheelEvent) => {
      if (this.isInputBlocked) return;
      const direction = e.deltaY > 0 ? 1 : -1;
      this.worker.postMessage({ type: 'wheel', payload: { direction } });
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    this.cleanupListeners.push(() => window.removeEventListener('wheel', onWheel));
  }

  public destroy(): void {
    this.unlockPointer();
    this.cleanupListeners.forEach((cleanup) => cleanup());
    this.cleanupListeners = [];
    this.worker.terminate();
    this.clear();
  }
}
