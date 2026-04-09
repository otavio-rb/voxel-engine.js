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

  private chatTimeout: any;

  constructor() {
    this.statsEl  = document.querySelector<HTMLElement>('#stats')!;
    this.chatEl   = document.querySelector<HTMLElement>('.chat')!;
    this.inputEl  = document.querySelector<HTMLInputElement>('.chat-input')!;

    this.initChat();
    this.resetChatTimeout();
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
        const menu = document.getElementById('world-menu')!;
        menu.classList.toggle('hidden');
        if (!menu.classList.contains('hidden')) {
            document.exitPointerLock();
        }
        return;
    }

    if (cmd === '/help') {
        this.addChatMessage('Available: /tp, /time, /shaders, /wireframe, /survival, /creative, /spawn, /menu, /regen, /set chunk height');
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
