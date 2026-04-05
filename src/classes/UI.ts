import { PerspectiveCamera, WebGLRenderer } from 'three';
import Player from './Player';

interface UIContext {
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
}

export default class UI {
  private readonly renderer: WebGLRenderer;
  private readonly camera: PerspectiveCamera;
  private readonly statsEl: HTMLElement;
  private readonly chatEl: HTMLElement;
  private readonly inputEl: HTMLInputElement;

  public player?: Player;
  public onToggle?: (isOpen: boolean) => void;

  private chatTimeout: any;

  constructor({ renderer, camera }: UIContext) {
    this.renderer = renderer;
    this.camera   = camera;
    this.statsEl  = document.querySelector<HTMLElement>('#stats')!;
    this.chatEl   = document.querySelector<HTMLElement>('.chat')!;
    this.inputEl  = document.querySelector<HTMLInputElement>('.chat-input')!;

    this.initChat();
    this.resetChatTimeout();
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

    switch (cmd) {
      case '/help':
        this.addChatMessage('Available: /tp, /time, /shaders, /wireframe, /survival, /creative, /spawn, /clear, /locate');
        break;
      case '/clear':
        this.chatEl.innerHTML = '';
        break;
      case '/time':
        const phase = args[0]?.toLowerCase() || 'noon';
        this.player?.world.setTime(phase);
        this.addChatMessage(`Time set to ${phase}`);
        break;
      case '/creative':
        this.player?.setMode('debug');
        this.addChatMessage('Gamemode set to Creative (Fly mode)');
        break;
      case '/survival':
        this.player?.setMode('normal');
        this.addChatMessage('Gamemode set to Survival (Physics mode)');
        break;
      case '/shaders':
        const state = args[0]?.toLowerCase();
        if (state === 'off') {
            this.player?.world.toggleShaders(false);
            this.addChatMessage('Shaders disabled.');
        } else if (state === 'on') {
            this.player?.world.toggleShaders(true);
            this.addChatMessage('Shaders enabled.');
        } else {
            this.addChatMessage('Usage: /shaders [on/off]');
        }
        break;
      case '/wireframe': {
        const wfArg  = args[0]?.toLowerCase();
        const wfForce = wfArg === 'on' ? true : wfArg === 'off' ? false : undefined;
        const wfOn   = this.player?.world.toggleWireframe(wfForce);
        this.addChatMessage(`Wireframe ${wfOn ? 'on' : 'off'}`);
        break;
      }
      case '/tp':
        if (args.length === 3) {
          const x = parseFloat(args[0]);
          const y = parseFloat(args[1]);
          const z = parseFloat(args[2]);
          this.player?.teleport(x, y, z);
          this.addChatMessage(`Teleported to ${x}, ${y}, ${z}`);
        } else if (args.length === 1) {
             // Teleport to a biome? No, let's keep it simple for now.
             this.addChatMessage('Usage: /tp <x> <y> <z>');
        }
        break;
      case '/locate':
        const biome = args[0]?.toLowerCase();
        if (biome) {
            const pos = this.player?.world.locateBiome(biome);
            if (pos) {
                this.addChatMessage(`Found ${biome} at ${Math.round(pos.x)}, ${Math.round(pos.z)}`);
                this.addChatMessage(`Use /tp ${Math.round(pos.x)} 100 ${Math.round(pos.z)}`);
            } else {
                this.addChatMessage(`Biome ${biome} not found nearby.`);
            }
        } else {
            this.addChatMessage('Usage: /locate <desert|snow|plains>');
        }
        break;
      case '/spawn':
        this.camera.position.set(0, 40, 0);
        this.addChatMessage('Spawned player!');
        break;
      default:
        // Regular chat message, just don't handle as command
        break;
    }
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

  update(): void {
    if (!this.statsEl) return;

    const { x, y, z } = this.camera.position;
    const { memory, render } = this.renderer.info;

    this.statsEl.innerText = [
      '[Player]',
      `X: ${x.toFixed(2)}  Y: ${y.toFixed(2)}  Z: ${z.toFixed(2)}`,
      '',
      '[Memory]',
      `Geometries: ${memory.geometries}`,
      `Textures:   ${memory.textures}`,
      '',
      '[Render]',
      `Frame:     ${render.frame}`,
      `Draw calls: ${render.calls}`,
      `Triangles:  ${render.triangles}`,
    ].join('\n');
  }
}
