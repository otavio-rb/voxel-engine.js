import { MeshLambertMaterial, Mesh, BufferGeometry, BufferAttribute, DoubleSide, Float32BufferAttribute } from "three";
import { SimplexNoise } from "three/examples/jsm/Addons.js";
import World from "./World-Sample";
import RNG from "../../utils/rng";
import ChunkLOD from "../ChunkLOD.js";

class SimpleWorld extends World {
    constructor({ chunkSize, chunkHeight, renderDistance, camera }) {
        super();

        this.renderDistance = renderDistance;
        this.chunkHeight = chunkHeight;
        this.chunkSize = chunkSize;
        this.camera = camera;
        this.allBlocks = {};
        this.lodChunks = new Map(); // Armazenar chunks com LOD

        this.params = {
            seed: 0,
            terrain: {
                scale: 16,
                magnitude: 0.7,
                offset: 0.2
            }
        };

        this.taskIndex = 0;

        this.rng = new RNG(this.params.seed);
        this.simplex = new SimplexNoise(this.rng);

        this._init();
    }

    _init() {
        for (let worker of this.workers) {
            worker.onmessage = (e) => this.handleWorkerMessage(e);
        }

        this.generete();
    }

    handleWorkerMessage(e) {
        const chunkGeometry = e.data.chunkGeometry;
        const chunkData = e.data.chunkDataInstance;

        const key = this.createChunkKey(chunkData.startX, chunkData.endZ, chunkData.startX, chunkData.endX);

        this.chunks[key] = chunkData;

        // Criar chunk com LOD
        const chunkLOD = new ChunkLOD(chunkGeometry);
        this.lodChunks.set(key, chunkLOD);

        this.generateMeshe(chunkGeometry);
    }

    generete() {
        for (let i = 0; i < this.renderDistance; i++) {
            for (let j = 0; j < this.renderDistance; j++) {
                const startX = i * this.chunkSize;
                const startZ = j * this.chunkSize;
                const endX = i * this.chunkSize + this.chunkSize;
                const endZ = j * this.chunkSize + this.chunkSize;

                const selectedWorkerIndex = this.taskIndex % this.workers.length;

                this.workers[selectedWorkerIndex].postMessage({
                    size: this.chunkSize,
                    height: this.chunkHeight,
                    startX, endX,
                    startZ, endZ,
                    worldParams: this.params
                });

                this.taskIndex++;
            }
        }
    }

    generateMeshe(data) {
        console.log(data);

        const geometry = new BufferGeometry();

        geometry.setAttribute('position', new Float32BufferAttribute(data.positions, 3));
    
        geometry.setIndex(data.vertices);
    
        geometry.setAttribute('normal', new Float32BufferAttribute(data.normals, 3));
        geometry.setAttribute('uv', new Float32BufferAttribute(data.uvs, 2));
    
        const material = new MeshLambertMaterial({ color: 0x00ff00, wireframe: false });
    
        const mesh = new Mesh(geometry, material);
    
        this.add(mesh);
    }

    selectLODGeometry(originalData) {
        // Verificar se originalData é válido
        if (!originalData || typeof originalData !== 'object') {
            console.warn('Dados de chunk inválidos', originalData);
            return null;
        }

        // Verificar se há dados de posição válidos
        const startX = originalData.startX || 0;
        const endX = originalData.endX || 0;
        const startZ = originalData.startZ || 0;
        const endZ = originalData.endZ || 0;

        // Calcular posição central do chunk
        const chunkPosition = {
            x: (startX + endX) / 2,
            y: this.chunkHeight / 2,
            z: (startZ + endZ) / 2
        };

        // Obter posição da câmera com fallback
        const cameraPosition = this.getCamera()?.position || { x: 0, y: 0, z: 0 };

        // Calcular distância com tratamento de erro
        const distance = ChunkLOD.calculateDistance(cameraPosition, chunkPosition);
        
        const key = this.createChunkKey(startX, endZ, startX, endX);

        const chunkLOD = this.lodChunks.get(key);
        return chunkLOD ? chunkLOD.selectLODGeometry(distance) : originalData;
    }

    getCamera() {
        // Método auxiliar para obter a câmera com tratamento de erro
        try {
            return this.camera || window.game?.camera;
        } catch (error) {
            console.warn('Não foi possível obter a câmera', error);
            return null;
        }
    }
}

export default SimpleWorld;