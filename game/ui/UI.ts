export interface UIStats {
  x: number; y: number; z: number;
  geometries: number; textures: number;
  frame: number; calls: number; triangles: number;
}

export default class UI {
  private readonly statsEl: HTMLElement;
  private readonly chatEl: HTMLElement;
  private readonly inputEl: HTMLInputElement;

  public onCommand?: (command: string, args: string[]) => void;
  public onToggle?: (isOpen: boolean) => void;
  public onOpenMenu?: () => void;
  public onSelectBlock?: (type: number) => void;

  private chatTimeout: any;

  constructor() {
    this.statsEl  = document.querySelector<HTMLElement>('#stats')!;
    this.chatEl   = document.querySelector<HTMLElement>('.chat')!;
    this.inputEl  = document.querySelector<HTMLInputElement>('.chat-input')!;

    this.initChat();
    this.initHotbar();
    this.resetChatTimeout();
  }

  private initHotbar(): void {
    const slots = document.querySelectorAll<HTMLElement>('.hotbar-slot');
    slots.forEach((slot) => {
      slot.addEventListener('click', (e) => {
        e.stopPropagation();
        const blockType = parseInt(slot.getAttribute('data-block') || '2');
        this.updateSelectedBlock(blockType);
        this.onSelectBlock?.(blockType);
      });
    });
  }

  public updateSelectedBlock(type: number): void {
    const slots = document.querySelectorAll('.hotbar-slot');
    slots.forEach(slot => {
      if (parseInt(slot.getAttribute('data-block') || '-2') === type) {
        slot.classList.add('selected');
      } else {
        slot.classList.remove('selected');
      }
    });
  }

  public get isChatOpen(): boolean {
    return this.inputEl.style.display === 'block';
  }

  private initChat(): void {
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const command = this.inputEl.value.trim();
        if (command !== '') {
          this.addChatMessage(command);
          this.handleCommand(command);
        }
        this.inputEl.value = '';
        this.toggleChat(false);
      }
      if (e.key === 'Escape') {
        this.toggleChat(false);
      }
    });

    // Prevent key propagation to player when typing
    this.inputEl.addEventListener('keydown', (e) => e.stopPropagation());
    this.inputEl.addEventListener('keyup', (e) => e.stopPropagation());
  }

  private resetChatTimeout(): void {
    clearTimeout(this.chatTimeout);
    this.chatEl.classList.remove('hidden');
    this.chatTimeout = setTimeout(() => {
      if (this.inputEl.style.display !== 'block') {
        this.chatEl.classList.add('hidden');
      }
    }, 5000);
  }

  private handleCommand(command: string): void {
    const parts = command.trim().split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    // Commands that stay local to main thread
    if (cmd === '/menu') {
        this.onOpenMenu?.();
        return;
    }

    if (cmd === '/help') {
        this.addChatMessage('Comandos: /dim [overworld|nether|lunar|mercury|volcanic|astral_void|cavern], /dim list, /rift [dim], /fenda, /volcano, /star, /planet, /celestial clear, /blackhole, /nuke, /raio, /laser, /orbital, /tp, /time | Tecla [R]: Raio');
        return;
    }

    // Forward parsing to RenderWorker via callback
    this.onCommand?.(cmd, args);
  }

  addChatMessage(text: string): void {
    const msg = document.createElement('div');
    msg.className = 'chat-message';
    msg.innerText = `- ${text}`;
    this.chatEl.appendChild(msg);
    this.chatEl.scrollTop = this.chatEl.scrollHeight;

    this.resetChatTimeout();
  }

  toggleChat(force?: boolean): boolean {
    const isCurrentlyVisible = this.inputEl.style.display === 'block';
    const shouldShow = force !== undefined ? force : !isCurrentlyVisible;
    
    if (shouldShow) {
      this.inputEl.style.display = 'block';
      this.inputEl.focus();
      this.onToggle?.(true);
      this.resetChatTimeout();
      return true;
    } else {
      this.inputEl.style.display = 'none';
      this.inputEl.blur();
      this.onToggle?.(false);
      this.resetChatTimeout();
      return false;
    }
  }

  update(stats: UIStats): void {
    if (!this.statsEl || !stats) return;

    this.statsEl.innerText = [
      '[Player]',
      `X: ${stats.x.toFixed(2)}  Y: ${stats.y.toFixed(2)}  Z: ${stats.z.toFixed(2)}`,
      '',
      '[Memory]',
      `Geometries: ${stats.geometries}`,
      `Textures:   ${stats.textures}`,
      '',
      '[Render]',
      `Frame:     ${stats.frame}`,
      `Draw calls: ${stats.calls}`,
      `Triangles:  ${stats.triangles}`,
    ].join('\n');
  }
}
