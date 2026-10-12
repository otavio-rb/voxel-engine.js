import { VoxelEngine } from '@voxel/engine';
import UI from './UI';

export interface MobileControlsOptions {
  engine: VoxelEngine;
  ui: UI;
  onOpenMenu: () => void;
}

export default class MobileControls {
  private readonly engine: VoxelEngine;
  private readonly ui: UI;
  private readonly onOpenMenu: () => void;

  private containerEl: HTMLElement | null = null;
  private isMobileActive = false;

  // D-pad state
  private dpadEl: HTMLElement | null = null;
  private dpadTouchId: number | null = null;
  private activeDirections: Set<'w' | 's' | 'a' | 'd'> = new Set();
  private isSneakToggled = false;

  // Touch-look state (arraste na tela para girar a câmera)
  private lookTouchId: number | null = null;
  private lastLookX = 0;
  private lastLookY = 0;
  private readonly lookSensitivity = 1.6;

  // Action button intervals
  private breakInterval: any = null;
  private placeInterval: any = null;

  constructor(options: MobileControlsOptions) {
    this.engine = options.engine;
    this.ui = options.ui;
    this.onOpenMenu = options.onOpenMenu;

    this.containerEl = document.getElementById('mobile-controls');
    this.dpadEl = document.getElementById('mobile-dpad');

    this.initDetection();
    this.initTopBar();
    this.initDpad();
    this.initActionButtons();
    this.initTouchLook();
  }

  /**
   * Detecta se o dispositivo é touch ou tela mobile/tablet
   */
  private initDetection(): void {
    const hasTouch =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches;

    const isSmallScreen = window.innerWidth <= 1024;

    if (hasTouch || isSmallScreen) {
      this.enableMobileControls();
    }

    // Se o usuário tocar na tela pela primeira vez em qualquer lugar, ativa mobile
    const onFirstTouch = () => {
      this.enableMobileControls();
      window.removeEventListener('touchstart', onFirstTouch);
    };
    window.addEventListener('touchstart', onFirstTouch, { passive: true, once: true });

    // Listener para redimensionamento de janela
    window.addEventListener('resize', () => {
      if (window.innerWidth <= 1024 && !this.isMobileActive) {
        this.enableMobileControls();
      }
    });
  }

  public enableMobileControls(): void {
    if (this.isMobileActive) return;
    this.isMobileActive = true;

    if (this.containerEl) {
      this.containerEl.classList.remove('mobile-controls-hidden');
    }
    document.body.classList.add('mobile-mode');

    this.engine.setMobileMode(true);
  }

  public disableMobileControls(): void {
    this.isMobileActive = false;
    if (this.containerEl) {
      this.containerEl.classList.add('mobile-controls-hidden');
    }
    document.body.classList.remove('mobile-mode');
    this.engine.setMobileMode(false);
  }

  public get isActive(): boolean {
    return this.isMobileActive;
  }

  /**
   * Chamado quando o menu ou chat abre/fecha para pausar controles móveis
   */
  public setVisible(visible: boolean): void {
    if (!this.containerEl) return;
    if (!this.isMobileActive) return;

    if (visible) {
      this.containerEl.classList.remove('mobile-controls-paused');
    } else {
      this.containerEl.classList.add('mobile-controls-paused');
      this.releaseAllMovement();
    }
  }

  private releaseAllMovement(): void {
    // Solta todas as teclas de direção
    for (const key of this.activeDirections) {
      this.engine.sendKeyUp(key);
    }
    this.activeDirections.clear();
    this.updateDpadVisuals();

    // Solta teclas de ação
    this.engine.sendKeyUp(' ');
    if (!this.isSneakToggled) {
      this.engine.sendKeyUp('shift');
    }

    // Cancela quebrar/colocar
    if (this.breakInterval) {
      clearInterval(this.breakInterval);
      this.breakInterval = null;
    }
    if (this.placeInterval) {
      clearInterval(this.placeInterval);
      this.placeInterval = null;
    }

    this.dpadTouchId = null;
    this.lookTouchId = null;
  }

  /**
   * Top bar: Botão de Chat e Botão de Pausa/Menu
   */
  private initTopBar(): void {
    const chatBtn = document.getElementById('mobile-btn-chat');
    const invBtn = document.getElementById('mobile-btn-inventory');
    const pauseBtn = document.getElementById('mobile-btn-pause');

    if (chatBtn) {
      chatBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.ui.toggleChat();
      });
    }

    if (invBtn) {
      invBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.ui.toggleInventory();
      });
    }

    if (pauseBtn) {
      pauseBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onOpenMenu();
      });
    }
  }

  /**
   * D-Pad fluido com suporte a 8 direções e toque central para agachar
   */
  private initDpad(): void {
    if (!this.dpadEl) return;

    const onDpadTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (this.dpadTouchId !== null) return;
      const touch = e.changedTouches[0];
      this.dpadTouchId = touch.identifier;
      this.handleDpadPosition(touch.clientX, touch.clientY);
    };

    const onDpadTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.dpadTouchId) {
          this.handleDpadPosition(touch.clientX, touch.clientY);
          break;
        }
      }
    };

    const onDpadTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.dpadTouchId) {
          e.preventDefault();
          e.stopPropagation();
          this.dpadTouchId = null;

          for (const key of this.activeDirections) {
            this.engine.sendKeyUp(key);
          }
          this.activeDirections.clear();
          this.updateDpadVisuals();
          break;
        }
      }
    };

    this.dpadEl.addEventListener('touchstart', onDpadTouchStart, { passive: false });
    window.addEventListener('touchmove', onDpadTouchMove, { passive: false });
    window.addEventListener('touchend', onDpadTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onDpadTouchEnd, { passive: false });

    // Botão central do D-pad: agachar toggle (Shift)
    const centerBtn = document.getElementById('dpad-center');
    if (centerBtn) {
      centerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.isSneakToggled = !this.isSneakToggled;
        if (this.isSneakToggled) {
          this.engine.sendKeyDown('shift');
          centerBtn.classList.add('active');
        } else {
          this.engine.sendKeyUp('shift');
          centerBtn.classList.remove('active');
        }
      });
    }
  }

  private handleDpadPosition(clientX: number, clientY: number): void {
    if (!this.dpadEl) return;
    const rect = this.dpadEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.hypot(dx, dy);

    // Zona morta no centro do D-pad (~22px)
    const deadzone = 22;
    const newDirections: Set<'w' | 's' | 'a' | 'd'> = new Set();

    if (distance >= deadzone) {
      // Threshold angular para 8 direções
      const angle = Math.atan2(dy, dx); // [-PI, PI], 0 é direita, PI/2 é baixo, -PI/2 é cima
      const deg = (angle * 180) / Math.PI;

      // Cima: [-157.5, -22.5]
      if (deg >= -157.5 && deg <= -22.5) {
        newDirections.add('w');
      }
      // Baixo: [22.5, 157.5]
      if (deg >= 22.5 && deg <= 157.5) {
        newDirections.add('s');
      }
      // Direita: [-67.5, 67.5]
      if (deg >= -67.5 && deg <= 67.5) {
        newDirections.add('d');
      }
      // Esquerda: [112.5, 180] ou [-180, -112.5]
      if (deg >= 112.5 || deg <= -112.5) {
        newDirections.add('a');
      }
    }

    // Teclas que foram desativadas
    for (const key of this.activeDirections) {
      if (!newDirections.has(key)) {
        this.engine.sendKeyUp(key);
      }
    }

    // Teclas que foram recém ativadas
    for (const key of newDirections) {
      if (!this.activeDirections.has(key)) {
        this.engine.sendKeyDown(key);
      }
    }

    this.activeDirections = newDirections;
    this.updateDpadVisuals();
  }

  private updateDpadVisuals(): void {
    const upEl = document.getElementById('dpad-up');
    const downEl = document.getElementById('dpad-down');
    const leftEl = document.getElementById('dpad-left');
    const rightEl = document.getElementById('dpad-right');

    if (upEl) upEl.classList.toggle('active', this.activeDirections.has('w'));
    if (downEl) downEl.classList.toggle('active', this.activeDirections.has('s'));
    if (leftEl) leftEl.classList.toggle('active', this.activeDirections.has('a'));
    if (rightEl) rightEl.classList.toggle('active', this.activeDirections.has('d'));
  }

  /**
   * Botões de ação do lado direito: Pular, Agachar, Quebrar, Colocar
   */
  private initActionButtons(): void {
    const jumpBtn = document.getElementById('btn-mobile-jump');
    const crouchBtn = document.getElementById('btn-mobile-crouch');
    const breakBtn = document.getElementById('btn-mobile-break');
    const placeBtn = document.getElementById('btn-mobile-place');

    // Pular (Espaço)
    if (jumpBtn) {
      this.bindButtonTouch(jumpBtn, () => {
        this.engine.sendKeyDown(' ');
      }, () => {
        this.engine.sendKeyUp(' ');
      });
    }

    // Agachar (Shift)
    if (crouchBtn) {
      this.bindButtonTouch(crouchBtn, () => {
        this.engine.sendKeyDown('shift');
      }, () => {
        if (!this.isSneakToggled) {
          this.engine.sendKeyUp('shift');
        }
      });
    }

    // Quebrar Bloco (Clique esquerdo / mouse 0)
    if (breakBtn) {
      this.bindContinuousAction(breakBtn, 0, 220);
    }

    // Colocar Bloco (Clique direito / mouse 2)
    if (placeBtn) {
      this.bindContinuousAction(placeBtn, 2, 250);
    }
  }

  private bindButtonTouch(
    el: HTMLElement,
    onPress: () => void,
    onRelease: () => void
  ): void {
    const start = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('active');
      onPress();
    };

    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('active');
      onRelease();
    };

    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    el.addEventListener('pointerleave', stop);
  }

  private bindContinuousAction(el: HTMLElement, buttonIndex: number, intervalMs: number): void {
    let timer: any = null;

    const start = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('active');

      this.engine.sendMouseDown(buttonIndex);
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        this.engine.sendMouseDown(buttonIndex);
      }, intervalMs);
    };

    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('active');
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    el.addEventListener('pointerleave', stop);
  }

  /**
   * Arraste na tela para girar a câmera (Touch Look)
   */
  private initTouchLook(): void {
    const onTouchStart = (e: TouchEvent) => {
      if (!this.isMobileActive) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const target = touch.target as HTMLElement | null;

        // Se o toque iniciou em um botão, hotbar, chat ou menu, ignora
        if (
          target?.closest('#mobile-controls') ||
          target?.closest('#hotbar') ||
          target?.closest('.chat-wrapper') ||
          target?.closest('#world-menu') ||
          target?.closest('#debug')
        ) {
          continue;
        }

        // Toque na área livre: torna-se o dedo que controla a mira/câmera
        if (this.lookTouchId === null) {
          this.lookTouchId = touch.identifier;
          this.lastLookX = touch.clientX;
          this.lastLookY = touch.clientY;
          break;
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!this.isMobileActive || this.lookTouchId === null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.lookTouchId) {
          const dx = touch.clientX - this.lastLookX;
          const dy = touch.clientY - this.lastLookY;

          this.lastLookX = touch.clientX;
          this.lastLookY = touch.clientY;

          // Clampa anomalias bruscas
          if (Math.abs(dx) < 200 && Math.abs(dy) < 200) {
            this.engine.sendMouseMove(dx * this.lookSensitivity, dy * this.lookSensitivity);
          }
          break;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.lookTouchId) {
          this.lookTouchId = null;
          break;
        }
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  }
}
