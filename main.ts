import { getCamera, getScene, getRenderer, getStats } from './src/components';
import ProceduralWorld from './src/classes/Worlds/ProceduralWorld';
import Player from './src/classes/Player';
import PlayerInteraction from './src/classes/PlayerInteraction';
import UI from './src/classes/UI';
import { WorldType } from './src/types';

class Game {
  private readonly scene    = getScene();
  private readonly camera   = getCamera();
  private readonly renderer = getRenderer();
  private readonly stats    = getStats();

  private readonly player:      Player;
  private readonly world:       ProceduralWorld;
  private readonly interaction: PlayerInteraction;
  private readonly ui:          UI;

  constructor() {
    const chunkSize     = this.loadSetting('chunkSize',     16);
    const chunkHeight   = this.loadSetting('chunkHeight',   1);
    const renderDistance = this.loadSetting('renderDistance', 12);

    this.world = new ProceduralWorld({ chunkSize, chunkHeight, renderDistance, camera: this.camera });
    this.scene.add(this.world);
    
    this.ui = new UI({ renderer: this.renderer, camera: this.camera });
    this.player = new Player({ camera: this.camera, ui: this.ui, world: this.world, mode: 'debug' });
    this.ui.player = this.player;

    this.initMenu();

    // Pre-compile the chunk shader before chunks arrive so the first render
    // doesn't stall the main thread with GLSL compilation.
    this.world.warmUp(this.renderer, this.scene);

    this.interaction = new PlayerInteraction(this.camera, this.world);

    this.renderer.setAnimationLoop(() => this.loop());
  }

  private loop(): void {
    this.stats.begin();

    this.player.update();
    this.world.tick();

    this.renderer.render(this.scene, this.camera);
    this.ui.update();

    this.stats.end();
  }

  private loadSetting(key: string, fallback: number): number {
    const raw = localStorage.getItem(key);
    return raw !== null ? (JSON.parse(raw) as number) : fallback;
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
      menuEl.classList.add('hidden');
      resumeBtn.style.display = 'block';
      
      // Reset world with new type
      this.world.reset({ worldType: selectedType, seed: Math.floor(Math.random() * 1000000) });
      
      // Reset player position
      this.player.teleport(0, 40, 0);
      
      // Lock pointer
      this.renderer.domElement.requestPointerLock();
    });

    resumeBtn.addEventListener('click', () => {
      menuEl.classList.add('hidden');
      this.renderer.domElement.requestPointerLock();
    });

    // Toggle menu with Escape if not typing in chat
    window.addEventListener('keydown', (e) => {
      if (e.key === 'm' || e.key === 'M') {
         if (document.pointerLockElement !== this.renderer.domElement) {
             menuEl.classList.toggle('hidden');
         }
      }
    });
  }
}

new Game();
