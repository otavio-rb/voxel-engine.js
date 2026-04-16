import { Vector3 } from "three";
import type ProceduralWorld from "../Worlds/ProceduralWorld";
import { NetworkPlayer } from "./NetworkPlayer";
import type Player from "../Player";

export default class NetworkClient {
    private ws: WebSocket | null = null;
    public id: string | null = null;
    public players: Map<string, NetworkPlayer> = new Map();
    
    // Config
    private readonly sendIntervalMs = 50; // 20 times per second
    private lastSendTime = 0;
    private world: ProceduralWorld;
    private localPlayer: Player;

    // Callbacks for UI/Game logic synchronization
    public onWorldInit?: (config: { type: string }) => void;
    public onWorldRegen?: (config: { type: string }) => void;

    constructor(world: ProceduralWorld, localPlayer: Player) {
        this.world = world;
        this.localPlayer = localPlayer;
    }

    public connect(url: string) {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            console.log("[Network] Connected to server!");
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (e) {
                console.error("[Network] Failed to parse message:", e);
            }
        };

        this.ws.onclose = () => {
            console.warn("[Network] Disconnected from server.");
            this.ws = null;
            // Cleanup remote players
            this.players.forEach(p => this.world.remove(p));
            this.players.clear();
        };

        this.ws.onerror = (error) => {
            console.error("[Network] WebSocket Error:", error);
        };
    }

    private handleMessage(data: any) {
        switch (data.type) {
            case 'init':
                this.id = data.id;
                console.log(`[Network] Assigned ID: ${this.id}`);
                if (data.worldConfig && this.onWorldInit) {
                    this.onWorldInit(data.worldConfig);
                }
                break;
            case 'move':
                if (data.id === this.id) return;
                
                let player = this.players.get(data.id);
                if (!player) {
                    // Create a random color for the new player based on their ID
                    const color = Math.floor(Math.random() * 0xffffff);
                    player = new NetworkPlayer(data.id, color);
                    this.players.set(data.id, player);
                    this.world.add(player);
                }
                
                player.syncPosition(data.x, data.y, data.z, data.ry);
                break;
            case 'block_break':
                if (data.id === this.id) return;
                // Since this was already validated by the remote client, just break it
                this.world.destroyBlock(new Vector3(data.x, data.y, data.z), new Vector3(0, 0, 0)); // No normal needed for explicit coordinate breaking in our engine
                break;
            case 'block_place':
                if (data.id === this.id) return;
                // Place block at specified location
                this.world.addBlock(new Vector3(data.x, data.y, data.z), new Vector3(0, 0, 0), data.blockType);
                break;
            case 'world_config':
                if (this.onWorldRegen) {
                    this.onWorldRegen(data.worldConfig);
                }
                break;
            case 'leave':
                const leavingPlayer = this.players.get(data.id);
                if (leavingPlayer) {
                    this.world.remove(leavingPlayer);
                    this.players.delete(data.id);
                }
                break;
        }
    }

    public update(time: number, delta: number) {
        // 1. Send our position
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.id) {
            if (time - this.lastSendTime > this.sendIntervalMs) {
                const p = this.localPlayer.camera.position;
                const r = this.localPlayer.camera.rotation;
                
                this.ws.send(JSON.stringify({
                    type: 'move',
                    x: p.x,
                    y: p.y - 1.6, // Send feet position, not eye position
                    z: p.z,
                    ry: r.y
                }));
                this.lastSendTime = time;
            }
        }

        // 2. Interpolate other players
        this.players.forEach(p => p.update(delta));
    }

    public broadcastBlockBreak(x: number, y: number, z: number) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'block_break',
                x, y, z
            }));
        }
    }

    public broadcastBlockPlace(x: number, y: number, z: number, blockType: number) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'block_place',
                x, y, z, blockType
            }));
        }
    }

    public broadcastWorldConfig(config: { type: string }) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'world_config',
                worldConfig: config
            }));
        }
    }
}
