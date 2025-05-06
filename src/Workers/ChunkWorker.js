import ChunkData from "../classes/Chunk/ChunkData.js";
import ChunkGeometry from "../classes/Chunk/ChunkGeometry.js";

self.onmessage = (e) => {
    const chunkData = e.data;

    const chunkDataInstance = new ChunkData(chunkData);
    const chunkGeometry = new ChunkGeometry(chunkDataInstance.getData());

    self.postMessage({ chunkDataInstance, chunkGeometry: chunkGeometry.getData() });
}