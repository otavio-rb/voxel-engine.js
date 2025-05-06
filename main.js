import { getRenderer, getCamera, getScene, getStats, getDebugControls } from "./src/components";
import SimpleWorld from "./src/classes/Worlds/SimpleWorld";
import FlatWorld from "./src/classes/Worlds/FlatWorld";
import CaveWorld from "./src/classes/Worlds/CaveWorld";
import Player from "./src/classes/Player";
import UI from "./src/classes/UI"

class Game {
  constructor() {
    this.scene = getScene();
    this.camera = getCamera();
    this.renderer = getRenderer();
    this.stats = getStats();

    this.camera.position.set(40, 20, 30);
    this.camera.lookAt(0, 0, 0);

    this.player = new Player({ camera: this.camera, currentMode: "debug" });

    this.chunkHeight = this?.getFromLocalStorageAndParse("chunkHeight") || 6;
    this.renderDistance = this?.getFromLocalStorageAndParse("renderDistance") || 6;
    this.chunkSize = this?.getFromLocalStorageAndParse("chunkSize") || 16;

    this._init();

    this.renderer.setAnimationLoop(() => this._update());
  }

  _init() {
    this.ui = new UI(this);

    this.world = new SimpleWorld({
      renderDistance: this.renderDistance,
      chunkSize: this.chunkSize,
      chunkHeight: this.chunkHeight, camera: this.camera
    });

    this.scene.add(this.world);
  }

  getFromLocalStorageAndParse(key) {
    const data = localStorage.getItem(key);

    return JSON.parse(data);
  }

  _update() {

    this.stats.begin();

    this.ui.updateDebug();

    this.renderer.render(this.scene, this.camera);

    this.player.update();

    this.stats.end();
  }
}

const game = new Game();