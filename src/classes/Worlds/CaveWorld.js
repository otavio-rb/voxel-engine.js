import World from "./World-Sample";
import Chunk from "../Chunk";

class CaveWorld extends World {
    constructor({ chunkSize, chunkHeight, renderDistance }) {
        super();

        this.renderDistance = renderDistance;
        this.chunkHeight = chunkHeight;
        this.chunkSize = chunkSize;

        this.world_params = {
            seed: 0,
            terrain: {
                scale: 16,
                magnitude: 0.5,
                offset: 0.2,
                scarcity: 0,
            }
        };

        this._init();
    }

    _init() {
        this.genereteData();
        this.generateMeshes();

        console.log(this.chunks);
    }

    genereteData() {
        for (let x = 0; x < this.renderDistance; x++) {
            for (let z = 0; z < this.renderDistance; z++) {
                const startX = x * this.chunkSize
                const startZ = z * this.chunkSize;
                const endX = x * this.chunkSize + this.chunkSize;
                const endZ = z * this.chunkSize + this.chunkSize;

                const color = ((x + z) % 2 === 0) ? 0x00FF00 : 0xFF0000;

                const chunkData = {
                    startX, endX,
                    startZ, endZ,
                    color
                }

                const key = this.createChunkKey(startX, endX, startZ, endZ);

                this.chunks[key] = chunkData;
            }
        }
    }

    generateMeshes() {
        const start = Date.now();

        for (let idx in this.chunks) {
            const data = this.chunks[idx];

            const neighboursChunks = this.getChunkNeighbours(data.startX, data.endX, data.startZ, data.endZ)

            const chunk = new Chunk({
                size: this.chunkSize,
                height: this.chunkHeight,
                startX: data.startX,
                endX: data.endX,
                startZ: data.startZ,
                endZ: data.endZ,
                color: data.color,
                worldParams: this.world_params,
                neighbours: neighboursChunks
            });

            this.add(chunk.mesh);
        }

        const end = Date.now();
        console.log("Tempo para gerar o terreno: ", end - start + "ms")
    }
};

export default CaveWorld;