import { TriangleBlurShader } from "three/examples/jsm/Addons.js";

class UI {
    constructor(main) {
        this.main = main;

        this.renderer = this.main.renderer;
        this.camera = this.main.camera;

        this._init();
    }

    _init() {
        this.showInfo();
    }

    showInfo() {
        const stats = document.querySelector("#stats");

        const x = Number(this.camera.position.x).toFixed(2);
        const y = Number(this.camera.position.y).toFixed(2);
        const z = Number(this.camera.position.z).toFixed(2);

        const info = this.renderer.info;
        stats.innerText = `
            [Player Position]
            X: ${x} Y: ${y} Z: ${z}
            [Memory]
            Geometries: ${info.memory.geometries}
            Textures: ${info.memory.textures}
            [Render]
            Frame: ${info.render.frame}
            Calls: ${info.render.calls}
            Triangles: ${info.render.triangles}
            Points: ${info.render.points}
            Lines: ${info.render.lines}
        `;
    }

    updateDebug() {
        this.showInfo();
    }
}

export default UI;