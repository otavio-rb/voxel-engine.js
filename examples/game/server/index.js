import { WebSocketServer } from 'ws';

const port = process.env.PORT || 3001;
const wss = new WebSocketServer({ port });

console.log(`Voxel Multiplayer Server running on ws://localhost:${port}`);

const clients = new Map();
let worldConfig = { type: 'standard' }; // Persist world type

wss.on('connection', (ws) => {
  // Generate a simple unique ID
  const id = Math.random().toString(36).substring(2, 9);
  clients.set(id, ws);

  console.log(`Client connected: ${id}. Total players: ${clients.size}`);

  // Tell the new client their ID and the current world state
  ws.send(JSON.stringify({ 
    type: 'init', 
    id, 
    worldConfig 
  }));

  // When a player moves
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Relay movements to ALL OTHER clients
      if (data.type === 'move') {
        const payload = JSON.stringify({
          type: 'move',
          id: id,
          x: data.x,
          y: data.y,
          z: data.z,
          ry: data.ry // Rotation Y
        });

        // Broadcast to others
        for (const [clientId, clientWs] of clients) {
          if (clientId !== id && clientWs.readyState === 1 /* OPEN */) {
            clientWs.send(payload);
          }
        }
      } 
      // Broadcast block changes
      else if (data.type === 'block_break') {
        const payload = JSON.stringify({
          type: 'block_break',
          id: id,
          x: data.x,
          y: data.y,
          z: data.z
        });
        for (const [clientId, clientWs] of clients) {
          if (clientId !== id && clientWs.readyState === 1) {
            clientWs.send(payload);
          }
        }
      } 
      // Synchronize world type changes
      else if (data.type === 'world_config') {
        worldConfig = data.worldConfig;
        const payload = JSON.stringify({ type: 'world_config', worldConfig });
        for (const [clientId, clientWs] of clients) {
          if (clientId !== id && clientWs.readyState === 1) {
            clientWs.send(payload);
          }
        }
      }
    } catch (e) {
      console.error('Error parsing message', e);
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected: ${id}`);
    clients.delete(id);
    
    // Notify others that this player left
    const payload = JSON.stringify({ type: 'leave', id });
    for (const [clientId, clientWs] of clients) {
      if (clientWs.readyState === 1) {
        clientWs.send(payload);
      }
    }
  });
});
