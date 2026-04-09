import Stats from 'three/examples/jsm/libs/stats.module.js';
import UI, { UIStats } from './src/classes/UI';
import { WorldType } from './src/types';

class Game {
  private readonly ui: UI;
  private readonly stats: Stats;
  private readonly worker: Worker;
  private readonly canvas: HTMLCanvasElement;

  private isLocked = false;
  private isGenerating = false;

  constructor() {
    this.ui = new UI();
    this.stats = new Stats();
    this.stats.dom.id = 'stats-overlay';
    document.body.appendChild(this.stats.dom);

    this.canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
    const offscreen = this.canvas.transferControlToOffscreen();

    // Initialize the Render Worker
    this.worker = new Worker(new URL('./src/Workers/RenderWorker.ts', import.meta.url), { type: 'module' });
    
    this.worker.postMessage({
      type: 'init',
      payload: {
        canvas: offscreen,
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: Math.min(window.devicePixelRatio, 2)
      }
    }, [offscreen]);

    this.initEvents();
    this.initMenu();
  }

  private initEvents(): void {
    // Resize
    window.addEventListener('resize', () => {
      this.worker.postMessage({
        type: 'resize',
        payload: { width: window.innerWidth, height: window.innerHeight }
      });
    });

    // Keyboard
    document.addEventListener('keydown', e => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key.toLowerCase() === ';') { e.preventDefault(); this.ui.toggleChat(); }
      this.worker.postMessage({ type: 'keydown', payload: { key: e.key } });
    });

    document.addEventListener('keyup', e => {
      if (document.activeElement?.tagName === 'INPUT') return;
      this.worker.postMessage({ type: 'keyup', payload: { key: e.key } });
    });

    // Mouse Movement
    document.addEventListener('mousemove', e => {
      if (!this.isLocked) return;
      this.worker.postMessage({ 
        type: 'mousemove', 
        payload: { movementX: e.movementX, movementY: e.movementY } 
      });
    });

    // Mouse Click (Raycast)
    document.addEventListener('mousedown', e => {
      // Only trigger block interactions on left click (button 0)
      if (e.button !== 0) return;

      const isChatInputFocused = document.activeElement?.classList.contains('chat-input');
      if (!isChatInputFocused && !this.isLocked) {
        this.canvas.requestPointerLock();
      } else if (this.isLocked) {
        this.worker.postMessage({ type: 'mousedown' });
      }
    });

    // Pointer Lock changes
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.canvas;
      this.worker.postMessage({ type: 'lock_state', payload: { isLocked: this.isLocked } });
      
      if (!this.isLocked) {
          const menu = document.getElementById('world-menu')!;
          if (!this.ui.isChatOpen && !this.isGenerating) {
             menu.classList.remove('hidden');
          }
      } else {
        this.isGenerating = false;
      }
    });

    // UI callbacks
    this.ui.onToggle = (isOpen) => {
      if (isOpen) {
        document.exitPointerLock();
      } else {
        this.canvas.requestPointerLock();
      }
    };

    this.ui.onCommand = (cmd, args) => {
      this.worker.postMessage({ type: 'command', payload: { command: cmd, args } });
    };

    // Receive stats from worker
    this.worker.onmessage = (e) => {
      if (e.data.type === 'stats') {
        this.stats.update();
        const stats = e.data.stats as UIStats & { isUnderwater: boolean };
        this.ui.update(stats);
        
        // Handle underwater overlay
        const overlay = document.getElementById('underwater-overlay');
        if (overlay) {
            overlay.style.display = stats.isUnderwater ? 'block' : 'none';
        }
      }
    };
  }

  private initMenu(): void {
    const menuEl = document.getElementById('world-menu')!;
    const generateBtn = document.getElementById('btn-generate')!;
    const resumeBtn = document.getElementById('btn-resume')!;
    const worldBtns = document.querySelectorAll('.world-btn');
    
    let selectedType = WorldType.Standard;

    worldBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        worldBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedType = btn.getAttribute('data-type') as WorldType;
      });
    });

    generateBtn.addEventListener('click', () => {
      this.isGenerating = true;
      menuEl.classList.add('hidden');
      resumeBtn.style.display = 'block';
      
      // Delaying messages slightly to ensure the worker is ready and UI has settled
      this.worker.postMessage({ type: 'command', payload: { command: '/start', args: [] } });
      this.worker.postMessage({ type: 'command', payload: { command: '/spawn', args: [] } });
      this.worker.postMessage({ type: 'command', payload: { command: '/regen', args: [selectedType] } });

      this.canvas.requestPointerLock();
      
      // Fallback to reset isGenerating if pointer lock is denied
      setTimeout(() => { if (!this.isLocked) this.isGenerating = false; }, 1000);
    });

    resumeBtn.addEventListener('click', () => {
      menuEl.classList.add('hidden');
      this.canvas.requestPointerLock();
    });
  }
}

new Game();
