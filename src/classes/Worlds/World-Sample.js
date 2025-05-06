import { Group } from "three";
import Sky from "../Sky";

class World extends Group {
    constructor() {
        super();

        this.chunks = {};
        this.workers = [];

        this.getWorkers();

        this.sky = new Sky();
        this.add(this.sky);

    }

    getWorkers() {
        console.log(navigator.hardwareConcurrency);
        for (let i = 0; i < Math.floor((navigator.hardwareConcurrency / 2)); i++) {
            const worker = new Worker(new URL('../../Workers/ChunkWorker.js', import.meta.url), { type: 'module' });
            this.workers.push(worker);
        }
    }

    createChunkKey(startX, startZ) {
        return `${startX}.${startZ}`;
    }

    createBlockKey(x, y, z) {
        return `${x}.${y}.${z}`;
    }

    getChunkNeighbours(startX, startZ) {
        const first_x_neighbour = this.createChunkKey(startX + this.chunkSize, startZ);
        const second_x_neighbour = this.createChunkKey(startX - this.chunkSize, startZ);

        const first_z_neighbour = this.createChunkKey(startX, startZ + this.chunkSize);
        const second_z_neighbour = this.createChunkKey(startX, startZ - this.chunkSize);

        const neighbours = [];

        if (this.chunks[first_x_neighbour]) {
            neighbours.push(this.chunks[first_x_neighbour]);
        }

        if (this.chunks[second_x_neighbour]) {
            neighbours.push(this.chunks[second_x_neighbour]);
        }

        if (this.chunks[first_z_neighbour]) {
            neighbours.push(this.chunks[first_z_neighbour]);
        }

        if (this.chunks[second_z_neighbour]) {
            neighbours.push(this.chunks[second_z_neighbour]);
        }

        return neighbours;
    }

    getBorderBlocks(chunks) {
        const borderBlocks = {};

        for (let idx in chunks) {
            const chunk = chunks[idx];
            for (let blockIdx in chunk.blocks) {
                const block = chunk.blocks[blockIdx];
                const isBorderBlock = this.isBorderBlock(
                    block,
                    chunk.startX, chunk.endX,
                    chunk.startZ, chunk.endZ
                );

                if (isBorderBlock) {
                    const key = this.createBlockKey(block.position.x, block.position.y, block.position.z);
                    borderBlocks[key] = block;
                }
            }
        }

        return borderBlocks;
    }

    isBorderBlock(block, startX, endX, startZ, endZ) {
        return (
            (block.position.x === startX || block.position.x === endX) &&
            (block.position.z >= startZ && block.position.z <= endZ) ||
            (block.position.z === startZ || block.position.z === endZ) &&
            (block.position.x >= startX && block.position.x <= endX)
        );
    }
};

export default World;