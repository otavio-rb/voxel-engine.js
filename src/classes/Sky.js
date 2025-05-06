import { DirectionalLight, AmbientLight, Group } from "three";

class Sky extends Group {
    constructor() {
        super();

        this._init();
    }

    _init() {
        this._createIllumination();
    }

    _createIllumination() {
        this.directionalLight = new DirectionalLight(0xffffff, 1);
        this.directionalLight.position.set(10, 10, 1).normalize();

        this.ambientLight = new AmbientLight(0xffffff, 0.5);


        this.add(this.ambientLight);
        this.add(this.directionalLight);
    }
};

export default Sky;