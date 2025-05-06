import { SimplexNoise } from "three/examples/jsm/Addons.js";
import RNG from "../../utils/rng";

class ChunkData {
    constructor({ size, height, startX, endX, startZ, endZ, worldParams, neighbours = [] }) {
        this.neighbours = [...neighbours];
        this.blocks = {};

        this.worldParams = worldParams;
        this.rng = new RNG(worldParams.seed);

        this.simplex = new SimplexNoise(this.rng);

        this.size = size;
        this.height = height;
        this.startX = startX;
        this.endX = endX;
        this.startZ = startZ;
        this.endZ = endZ;
        this.isFlat = false;

        this._init();
    }

    _init() {
        this.createData();
    }

    createObjectKey(x, y, z) {
        return `${x}.${y}.${z}`;
    }

    createData() {
        for (let x = this.startX; x < this.endX; x++) {
            for (let z = this.startZ; z < this.endZ; z++) {
                let height = this.height;

                if (!this.isFlat) {
                    const value = this.simplex.noise(
                        x / this.worldParams.terrain.scale,
                        z / this.worldParams.terrain.scale
                    );

                    const scaledNoise = this.worldParams.terrain.offset + this.worldParams.terrain.magnitude * value;
                    height = this.height * scaledNoise;
                    height = Math.floor(Math.max(0, Math.min(height, this.height)));
                }

                for (let y = 0; y <= height; y++) {
                    let blockType;

                    if (y < height) {
                        blockType = 0;
                    } else if (y === height) {
                        blockType = 1;
                    } else {
                        blockType = 3
                    }

                    this.blocks[this.createObjectKey(x, y, z)] = {
                        type: blockType,
                        position: {
                            x, y, z
                        }
                    };
                }
            }
        }
    }

    getData() {
        return {
            startX: this.startX,
            endX: this.endX,
            startZ: this.startZ,
            endZ: this.endZ,
            blocks: this.blocks
        }
    }
}
export default ChunkData;