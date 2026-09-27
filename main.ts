import Stats from 'three/examples/jsm/libs/stats.module.js';
import UI, { UIStats } from './src/classes/UI';
import { WorldType } from './src/types';
import { VoxelEngine, EngineStats } from './src/index';

const WORLD_DESCRIPTIONS: Record<string, string> = {
  [WorldType.Standard]: 'Mundo padrão: Colinas, florestas, praias e cavernas procedurais.',
  [WorldType.Flat]: 'Mundo plano: Superfície lisa contínua para testes e construções.',
  [WorldType.Cavern]: 'Mundo cavernoso: Estruturas 3D colossais e cavernas profundas no vazio.',
  [WorldType.Lunar]: 'Mundo lunar: Solo cinzento com crateras de impacto e baixa gravidade.',
  [WorldType.Mercury]: 'Mundo de Mercúrio: Solo vulcânico extremo sob forte calor solar.'
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
    this.engine = new VoxelEngine({ canvas });
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

    this.engine.on<{ isLocked: boolean; wasLocked: boolean }>('lock_change', ({ isLocked, wasLocked }) => {
      if (wasLocked && !isLocked) {
        if (!this.ui.isChatOpen && this.engine.hasStarted()) {
          this.openMenu();
        }
      }
    });
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
