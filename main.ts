import Stats from 'three/examples/jsm/libs/stats.module.js';
import UI, { UIStats } from './src/classes/UI';
import { WorldType } from './src/types';

const WORLD_DESCRIPTIONS: Record<string, string> = {
  [WorldType.Standard]: 'Mundo padrão: Colinas, florestas, praias e cavernas procedurais.',
  [WorldType.Flat]: 'Mundo plano: Superfície lisa contínua para testes e construções.',
  [WorldType.Cavern]: 'Mundo cavernoso: Estruturas 3D colossais e cavernas profundas no vazio.',
  [WorldType.Lunar]: 'Mundo lunar: Solo cinzento com crateras de impacto e baixa gravidade.',
  [WorldType.Mercury]: 'Mundo de Mercúrio: Solo vulcânico extremo sob forte calor solar.'
};

class Game {
  private readonly ui: UI;
  private readonly stats: Stats;
  private readonly worker: Worker;
  private readonly canvas: HTMLCanvasElement;

  private isLocked = false;
  private isLocking = false;
  private isMenuOpen = true;
  private isGameStarted = false;

  private selectedWorldType: WorldType = WorldType.Standard;
  private selectedMode: 'debug' | 'normal' = 'debug';
  private shadersEnabled = true;

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

  public openMenu(): void {
    this.isMenuOpen = true;

    // Se estiver com pointer lock ativo, libera o cursor
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    const menuEl = document.getElementById('world-menu');
    if (!menuEl) return;
    menuEl.classList.remove('hidden');

    const titleEl = document.getElementById('menu-title');
    const resumeBtn = document.getElementById('btn-resume');
    const generateBtnText = document.getElementById('btn-generate-text');

    if (this.isGameStarted) {
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
    const menuEl = document.getElementById('world-menu');
    if (menuEl) {
      menuEl.classList.add('hidden');
    }
  }

  public async requestGameLock(): Promise<void> {
    if (this.isLocked || this.isLocking || this.isMenuOpen || this.ui.isChatOpen) {
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

  public startGame(): void {
    this.isGameStarted = true;
    this.closeMenu();

    const resumeBtn = document.getElementById('btn-resume');
    if (resumeBtn) resumeBtn.style.display = 'block';

    // Comandos de inicialização
    this.worker.postMessage({ type: 'command', payload: { command: '/start', args: [] } });
    this.worker.postMessage({ type: 'command', payload: { command: '/spawn', args: [] } });
    this.worker.postMessage({ type: 'command', payload: { command: '/regen', args: [this.selectedWorldType] } });
    this.worker.postMessage({
      type: 'command',
      payload: { command: this.selectedMode === 'debug' ? '/creative' : '/survival', args: [] }
    });
    this.worker.postMessage({
      type: 'command',
      payload: { command: '/shaders', args: [this.shadersEnabled ? 'on' : 'off'] }
    });

    this.requestGameLock();
  }

  public resumeGame(): void {
    if (!this.isGameStarted) return;
    this.closeMenu();
    this.requestGameLock();
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
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      // Tecla ESC para alternar Menu de Pausa / Retorno
      if (e.key === 'Escape') {
        if (this.isMenuOpen) {
          if (this.isGameStarted) {
            e.preventDefault();
            this.resumeGame();
          }
        } else if (!this.ui.isChatOpen && this.isGameStarted) {
          e.preventDefault();
          this.openMenu();
        }
        return;
      }

      // Tecla ; para Chat
      if (e.key.toLowerCase() === ';') {
        if (this.isMenuOpen) return;
        e.preventDefault();
        this.ui.toggleChat();
        return;
      }

      // Se o menu está aberto, NÃO envia movimentos ao jogo
      if (this.isMenuOpen) return;

      this.worker.postMessage({ type: 'keydown', payload: { key: e.key } });
    });

    document.addEventListener('keyup', (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (this.isMenuOpen) return;
      this.worker.postMessage({ type: 'keyup', payload: { key: e.key } });
    });

    // Mouse Movement
    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isLocked || this.isMenuOpen) return;
      this.worker.postMessage({ 
        type: 'mousemove', 
        payload: { movementX: e.movementX, movementY: e.movementY } 
      });
    });

    // Mouse Click (Raycast & Interação de Blocos)
    document.addEventListener('mousedown', (e: MouseEvent) => {
      // Se o menu está aberto ou o chat está ativo, IGNORA totalmente!
      if (this.isMenuOpen || this.ui.isChatOpen) return;

      if (e.button !== 0 && e.button !== 2) return;

      // Se o jogo já começou e o mouse não está travado, clicar no canvas recupera o pointer lock
      if (!this.isLocked) {
        if (e.target === this.canvas || (e.target as HTMLElement)?.id === 'scene') {
          this.requestGameLock();
        }
        return;
      }

      // Se o mouse está travado no jogo, envia a ação de quebrar/colocar bloco
      this.worker.postMessage({ type: 'mousedown', payload: { button: e.button } });

      if (e.button === 2) {
        e.preventDefault();
      }
    });

    document.addEventListener('contextmenu', (e: MouseEvent) => {
      if (this.isLocked) {
        e.preventDefault();
      }
    });

    // Pointer Lock changes
    document.addEventListener('pointerlockchange', () => {
      const wasLocked = this.isLocked;
      this.isLocked = document.pointerLockElement === this.canvas;
      this.isLocking = false;

      this.worker.postMessage({ type: 'lock_state', payload: { isLocked: this.isLocked } });

      // Se o usuário liberou o cursor (ex: pressionou ESC nativo do navegador)
      if (wasLocked && !this.isLocked) {
        if (!this.ui.isChatOpen && this.isGameStarted) {
          this.openMenu();
        }
      }
    });

    document.addEventListener('pointerlockerror', () => {
      this.isLocking = false;
    });

    // Mouse Wheel (troca de bloco na hotbar)
    window.addEventListener('wheel', (e: WheelEvent) => {
      if (this.isMenuOpen || this.ui.isChatOpen) return;
      const direction = e.deltaY > 0 ? 1 : -1;
      this.worker.postMessage({ type: 'wheel', payload: { direction } });
    }, { passive: true });

    // UI Callbacks
    this.ui.onToggle = (isOpen: boolean) => {
      if (isOpen) {
        if (this.isLocked) document.exitPointerLock();
      } else {
        if (!this.isMenuOpen && this.isGameStarted) {
          this.requestGameLock();
        }
      }
    };

    this.ui.onOpenMenu = () => {
      this.openMenu();
    };

    this.ui.onSelectBlock = (type: number) => {
      this.worker.postMessage({ type: 'select_block', payload: { type } });
    };

    this.ui.onCommand = (cmd: string, args: string[]) => {
      this.worker.postMessage({ type: 'command', payload: { command: cmd, args } });
    };

    // Receive messages from worker
    this.worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'stats') {
        this.stats.update();
        const stats = e.data.stats as UIStats & { isUnderwater: boolean };
        this.ui.update(stats);
        
        const overlay = document.getElementById('underwater-overlay');
        if (overlay) {
          overlay.style.display = stats.isUnderwater ? 'block' : 'none';
        }
      } else if (e.data.type === 'world_init') {
        const type = (e.data.config?.type as WorldType) || WorldType.Standard;
        this.selectedWorldType = type;
        this.startGame();
      } else if (e.data.type === 'world_regen') {
        const type = e.data.config.type;
        this.worker.postMessage({ type: 'command', payload: { command: '/regen', args: [type] } });
      } else if (e.data.type === 'selection_change') {
        this.ui.updateSelectedBlock(e.data.payload.type);
      }
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

    // Isola cliques dentro do menu
    menuEl.addEventListener('mousedown', (e: MouseEvent) => e.stopPropagation());
    menuEl.addEventListener('click', (e: MouseEvent) => e.stopPropagation());

    // Seleção de Biomas
    worldBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        worldBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const type = (btn.getAttribute('data-type') as WorldType) || WorldType.Standard;
        this.selectedWorldType = type;
        if (descBox && WORLD_DESCRIPTIONS[type]) {
          descBox.innerText = WORLD_DESCRIPTIONS[type];
        }
      });
    });

    // Botão Modo de Jogo (Toggle Criativo / Sobrevivência)
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

        if (this.isGameStarted) {
          this.worker.postMessage({
            type: 'command',
            payload: { command: this.selectedMode === 'debug' ? '/creative' : '/survival', args: [] }
          });
        }
      });
    }

    // Botão Shaders (Toggle Ativado / Desativado)
    if (shadersBtn && shadersText) {
      shadersBtn.addEventListener('click', () => {
        this.shadersEnabled = !this.shadersEnabled;
        shadersText.innerText = this.shadersEnabled ? 'Ativado' : 'Desativado';

        if (this.isGameStarted) {
          this.worker.postMessage({
            type: 'command',
            payload: { command: '/shaders', args: [this.shadersEnabled ? 'on' : 'off'] }
          });
        }
      });
    }

    // Botão Criar / Recriar Mundo
    generateBtn.addEventListener('click', () => {
      this.startGame();
    });

    // Botão Retomar Jogo
    resumeBtn.addEventListener('click', () => {
      this.resumeGame();
    });
  }
}

new Game();
