import { PerspectiveCamera, Scene, WebGLRenderer, Color } from "three";
import { PointerLockControls } from "three/examples/jsm/Addons.js";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import Stats from "three/examples/jsm/libs/stats.module.js";

const getCamera = () => {
    const camera = new PerspectiveCamera(
        90, window.innerWidth / window.innerHeight, 1, 2000
    );

    return camera;
};

const getScene = () => {
    const scene = new Scene();
    scene.background = new Color(0xfafafa);

    return scene;
};

const getRenderer = () => {
    const renderer = new WebGLRenderer({ canvas: document.querySelector("#scene"), alpha: true });
    renderer.info.autoReset = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(1);
    document.body.appendChild(renderer.domElement);

    return renderer;
};

const getStats = () => {
    const stats = new Stats();

    document.body.appendChild(stats.dom);

    return stats;
};

const getDebugControls = (camera, renderer) => {
    const orbit = new OrbitControls(camera, renderer);
    orbit.update();

    return orbit;
};

export { getScene, getCamera, getRenderer, getStats, getDebugControls };