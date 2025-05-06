import { Group, Mesh, BufferAttribute, BufferGeometry, MeshLambertMaterial, DoubleSide } from "three";
import Block from "../Block";
import blockSides from "../../constants/block-sides";

class ChunkMesh {
    constructor({ startX, endX, startZ, endZ, blocks, neighboursBordersBlocks = [] }) {
        this.blocks = blocks;

        this.positions = [];
        this.normals = [];
        this.uvs = [];
        this.colors = [];
        this.vertices = [];
        this.neighboursBordersBlocks = neighboursBordersBlocks;

        this._init();
    }

    _init() {
        this.createGeometry();
    }

    createGeometry() {
        for (let idx in this.blocks) {
            const block = this.blocks[idx];

            const ndx = this.positions.length / 3;

            const chunkOutboundsToRemove = {
                bottom: this.isChunkYEnd(block.position.y)
            };

            const allBlocks = {
                ...this.blocks, ...this.neighboursBordersBlocks
            }

            const blockData = new Block({ position: block.position, blockID: block.type })
            blockData.createFacesDataForChunk(ndx, allBlocks, chunkOutboundsToRemove);

            const { positions, normals, vertices, uvs, colors } = blockData.getFacesData();

            this.positions = this.positions.concat(positions);
            this.vertices = this.vertices.concat(vertices);
            this.normals = this.normals.concat(normals);
            this.colors = this.colors.concat(colors);
            this.uvs = this.uvs.concat(uvs);
        }
    }

    getData() {
        return {
            positions: this.positions,
            vertices: this.vertices,
            normals: this.normals,
            colors: this.colors,
            uvs: this.uvs
        }
    }

    isChunkYEnd(y) {
        return y === 0;
    }
};

export default ChunkMesh;