import { Vector3, Mesh, BoxGeometry, MeshStandardMaterial, Scene } from 'three';
import ProceduralWorld from '../Worlds/ProceduralWorld';

export interface EntityDimensions {
    width: number;
    height: number;
}

export abstract class Entity {
    public readonly position: Vector3 = new Vector3();
    public readonly velocity: Vector3 = new Vector3();
    public mesh: Mesh;
    
    protected readonly world: ProceduralWorld;
    protected readonly dimensions: EntityDimensions;
    protected isGrounded: boolean = false;
    protected gravity: number = 0.008;
    protected friction: number = 0.9;

    constructor(world: ProceduralWorld, dimensions: EntityDimensions, color: number = 0xffffff) {
        this.world = world;
        this.dimensions = dimensions;
        
        // Default visual: simple box
        const geo = new BoxGeometry(dimensions.width, dimensions.height, dimensions.width);
        const mat = new MeshStandardMaterial({ color });
        this.mesh = new Mesh(geo, mat);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
    }

    public abstract update(deltaTime: number): void;

    protected applyPhysics(): void {
        // Vertical Physics (Gravity)
        this.velocity.y -= this.gravity;
        
        const nextPos = this.position.clone();

        // Solve X axis
        nextPos.x += this.velocity.x;
        if (this.checkCollision(nextPos)) {
            nextPos.x = this.position.x;
            this.velocity.x = 0;
            this.onCollision('x');
        }
        this.position.x = nextPos.x;

        // Solve Y axis
        nextPos.y += this.velocity.y;
        if (this.checkCollision(nextPos)) {
            if (this.velocity.y < 0) this.isGrounded = true;
            nextPos.y = this.position.y;
            this.velocity.y = 0;
            this.onCollision('y');
        } else {
            this.isGrounded = false;
        }
        this.position.y = nextPos.y;

        // Solve Z axis
        nextPos.z += this.velocity.z;
        if (this.checkCollision(nextPos)) {
            nextPos.z = this.position.z;
            this.velocity.z = 0;
            this.onCollision('z');
        }
        this.position.z = nextPos.z;

        // Apply friction to horizontal movement
        this.velocity.x *= this.friction;
        this.velocity.z *= this.friction;

        // Sync mesh position (adjust for center-origin mesh)
        this.mesh.position.set(
            this.position.x,
            this.position.y + this.dimensions.height / 2,
            this.position.z
        );
    }

    protected checkCollision(pos: Vector3): boolean {
        const w = this.dimensions.width / 2;
        const h = this.dimensions.height;
        
        // Multi-point collision check
        const points = [
            // Bottom corners
            { x: pos.x - w, y: pos.y, z: pos.z - w },
            { x: pos.x + w, y: pos.y, z: pos.z - w },
            { x: pos.x - w, y: pos.y, z: pos.z + w },
            { x: pos.x + w, y: pos.y, z: pos.z + w },
            
            // Mid level
            { x: pos.x - w, y: pos.y + h / 2, z: pos.z - w },
            { x: pos.x + w, y: pos.y + h / 2, z: pos.z - w },
            { x: pos.x - w, y: pos.y + h / 2, z: pos.z + w },
            { x: pos.x + w, y: pos.y + h / 2, z: pos.z + w },

            // Top corners
            { x: pos.x - w, y: pos.y + h, z: pos.z - w },
            { x: pos.x + w, y: pos.y + h, z: pos.z - w },
            { x: pos.x - w, y: pos.y + h, z: pos.z + w },
            { x: pos.x + w, y: pos.y + h, z: pos.z + w },
        ];

        for (const p of points) {
            if (this.world.isBlockSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) {
                return true;
            }
        }
        return false;
    }

    protected onCollision(axis: 'x' | 'y' | 'z'): void {
        // Callback for subclasses to handle collisions (e.g. jump when hitting a wall)
    }

    public addToScene(scene: Scene): void {
        scene.add(this.mesh);
    }

    public removeFromScene(scene: Scene): void {
        scene.remove(this.mesh);
    }

    public dispose(): void {
        this.mesh.geometry.dispose();
        (this.mesh.material as MeshStandardMaterial).dispose();
    }
}
