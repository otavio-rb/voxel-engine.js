import { Group, Mesh, BufferAttribute, BufferGeometry, MeshLambertMaterial, DoubleSide } from "three";
import { SimplexNoise } from "three/examples/jsm/Addons.js";
import RNG from "../utils/rng";
import Block from "./Block";

class Chunk {
    constructor({
        size,
        height,
        startX,
        endX,
        startZ,
        endZ,
        color,
        worldParams,
        neighbours,
        isFlat = false
    }) {
        this.size = size;
        this.height = height;
        this.startX = startX;
        this.endX = endX;
        this.startZ = startZ;
        this.endZ = endZ;
        this.color = color;
        this.neighbours = neighbours;
        this.isFlat = isFlat;
        this.worldParams = worldParams;

        const maxBlocks = this.size * this.size * this.height;

        // this.positions = new Float32Array(maxBlocks * 3);
        // this.normals = new Float32Array(maxBlocks * 3);
        // this.uvs = new Float32Array(maxBlocks * 2);
        this.positions = [];
        this.normals = [];
        this.uvs = [];
        this.colors = [];
        this.vertices = [];

        const neighboursBlocks = [];

        this.neighbours.forEach(n => {
            neighboursBlocks.push(...n.blocks)
        })

        this.blocksCords = [...neighboursBlocks];

        this.mesh = null;

        this._init();
    }

    _init() {
        this.createBlocksData();
        this.createMesh();
    }

    createObjectKey(x, y, z) {
        return `${x}.${y}.${z}`;
    }

    createBlocksData() {
        const rng = new RNG(this.worldParams.seed);
        const simplex = new SimplexNoise(rng);

        for (let x = this.startX; x < this.endX; x++) {
            for (let z = this.startZ; z < this.endZ; z++) {
                let height = this.height;

                if (!this.isFlat) {
                    const value = simplex.noise(
                        x / this.worldParams.terrain.scale,
                        z / this.worldParams.terrain.scale
                    );

                    const scaledNoise = 0.2 + 0.5 * value;
                    height = this.height * scaledNoise;
                    height = Math.max(0, Math.min(height, this.height));
                }

                for (let y = 0; y <= height; y++) {
                    this.blocksCords.push(this.createObjectKey(x * 1, y * 1, z * 1));
                }
            }
        }

        for (let x = this.startX; x < this.endX; x++) {
            for (let z = this.startZ; z < this.endZ; z++) {
                let height = this.height;

                if (!this.isFlat) {
                    const value = simplex.noise(
                        x / this.worldParams.terrain.scale,
                        z / this.worldParams.terrain.scale
                    );

                    const scaledNoise = this.worldParams.terrain.offset + this.worldParams.terrain.magnitude * value;

                    height = this.height * scaledNoise;
                    height = Math.max(0, Math.min(height, this.height));
                    height = Math.floor(height);
                }

                for (let y = 0; y <= height; y++) {
                    const position = {
                        x: x,
                        y: y,
                        z: z
                    }

                    let blockID;

                    if (y < height) {
                        blockID = 0;
                    } else if (y === height) {
                        blockID = 1;
                    } else {
                        blockID = 3
                    }

                    const block = new Block({ position, blockID });

                    const ndx = this.positions.length / 3;

                    const chunkOutboundsToRemove = {
                        bottom: this.isChunkYEnd(y)
                    };

                    block.createFacesDataForChunk(ndx, this.blocksCords, chunkOutboundsToRemove);

                    const { positions, normals, vertices, uvs, colors } = block.getFacesData();

                    this.positions = this.positions.concat(positions);
                    this.vertices = this.vertices.concat(vertices);
                    this.normals = this.normals.concat(normals);
                    this.colors = this.colors.concat(colors);
                    this.uvs = this.uvs.concat(uvs);
                }
            }
        }
    }

    isChunkYEnd(y) {
        return y === 0;
    }

    createMesh() {
        const geometry = new BufferGeometry();

        geometry.setAttribute(
            "position",
            new BufferAttribute(new Float32Array(this.positions), 3)
        );
        geometry.setAttribute(
            "normal",
            new BufferAttribute(new Float32Array(this.normals), 3)
        );
        geometry.setAttribute(
            "color",
            new BufferAttribute(new Float32Array(this.colors), 3)
        );
        geometry.setAttribute(
            "uv",
            new BufferAttribute(new Float32Array(this.uvs), 2)
        );

        geometry.setIndex(this.vertices);

        const material = new MeshLambertMaterial({
            wireframe: false,
            side: DoubleSide,
            vertexColors: true
        });

        geometry.computeBoundingBox();

        const mesh = new Mesh(geometry, material);
        this.mesh = mesh;
    }
};

export default Chunk;