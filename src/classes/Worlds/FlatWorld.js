import World from "./World-Sample";
import Chunk from "../Chunk";
import Sky from "../Sky";

class FlatWorld extends World {
    constructor({ chunkSize, chunkHeight, renderDistance }) {
        super();

        this.renderDistance = renderDistance;
        this.chunkHeight = chunkHeight;
        this.chunkSize = chunkSize;

        this._init();
    }

    _init() {
        this._createFirstChunks();
    }

    _createFirstChunks() {
        const start = Date.now();
        for (let x = 0; x < this.renderDistance; x++) {
            for (let z = 0; z < this.renderDistance; z++) {

                const startX = x * this.chunkSize;
                const startZ = z * this.chunkSize;
                const endX = x * this.chunkSize + this.chunkSize;
                const endZ = z * this.chunkSize + this.chunkSize;

                const color = ((x + z) % 2 === 0) ? 0x00FF00 : 0xFF0000;

                const chunk = new Chunk({
                    size: this.chunkSize,
                    height: this.chunkHeight,
                    startX,
                    startZ,
                    endX,
                    endZ,
                    color,
                    worldParams: {},
                    neighbours: [],
                    isFlat: true,
                });

                this.add(chunk.mesh);
            }
        }
        const end = Date.now();

        console.log("Tempo para gerar o terreno: ", end - start + "ms")
    }
};

export default FlatWorld;