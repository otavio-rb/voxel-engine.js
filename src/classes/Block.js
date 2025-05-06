import { BoxGeometry, MeshBasicMaterial, Mesh, Vector3, MeshPhongMaterial, DoubleSide } from "three";
import faces from "../constants/block-sides";
import blocks from "../constants/block-types";

class Block {
    constructor({ position, blockID }) {
        this.position = position;
        this.blockID = blockID;
        this.blockType = blocks[blockID];
        this.mesh = null;

        this.positions = [];
        this.vertices = [];
        this.normals = [];
        this.colors = [];
        this.uvs = [];

        this._init();
    }

    _init() {
        // this._createFacesData();
    }

    verifyNeighbours({ x, y, z }, blocks) {
        const key = this.createObjectKey(x, y, z);
        if (Object.keys(blocks).includes(key)) {
            return true;
        }
        return false;
    }

    createObjectKey(x, y, z) {
        return `${x}.${y}.${z}`;
    }

    createFacesDataForChunk(baseIndex, chunkFaces = {}, chunkOutboundsToRemove = {}) {
        const { x, y, z } = this.position;

        for (const { dir, corners, uvRow, label } of faces) {
            const ndx = baseIndex + this.positions.length / 3;

            const hasNeighbour = this.verifyNeighbours({ x: x + dir[0], y: y + dir[1], z: z + dir[2] }, chunkFaces);
            if (!chunkOutboundsToRemove[label]) {
                if (!hasNeighbour) {
                    for (const { pos, uv } of corners) {
                        if (!hasNeighbour) {
                            this.positions.push(pos[0] + x, pos[1] + y, pos[2] + z);
                            this.normals.push(...dir);

                            const color = this.blockType.color;

                            const r = ((color >> 16) & 0xff) / 255;
                            const g = ((color >> 8) & 0xff) / 255;
                            const b = (color & 0xff) / 255;

                            this.colors.push(r, g, b);

                            const [uv1, uv2] = uv;
                            this.uvs.push(uv1, uv2);
                        }
                    }

                    this.vertices.push(
                        ndx,
                        ndx + 1,
                        ndx + 2,
                        ndx + 2,
                        ndx + 1,
                        ndx + 3
                    );
                }
            }
        }
    }

    getFacesData() {
        return {
            positions: this.positions,
            normals: this.normals,
            uvs: this.uvs,
            vertices: this.vertices,
            colors: this.colors
        }
    }
};

export default Block;