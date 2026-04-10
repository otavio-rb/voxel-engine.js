import { Entity, EntityDimensions } from './Entity';
import ProceduralWorld from '../Worlds/ProceduralWorld';
import { Vector3, Group, BoxGeometry, MeshStandardMaterial, Mesh } from 'three';

type AnimalState = 'IDLE' | 'WANDER';

export abstract class Animal extends Entity {
    private state: AnimalState = 'IDLE';
    private stateTimer: number = 0;
    private wanderDirection: Vector3 = new Vector3();
    private walkSpeed: number = 0.06;
    private jumpPower: number = 0.18;
    
    // Animation state
    protected animationTime: number = 0;
    protected legGroup: Group = new Group();

    constructor(world: ProceduralWorld, dimensions: EntityDimensions, color: number) {
        super(world, dimensions, color);
        
        // Replace the single mesh from Entity constructor with a group
        const group = new Group();
        this.mesh = group as any; // Cast for compatibility with Entity.ts
        
        this.resetState();
    }

    /** Subclasses must implement this to build their specific voxel model */
    protected abstract buildModel(color: number): void;

    /** Helper to create a part of the animal */
    protected createPart(w: number, h: number, d: number, color: number, x: number, y: number, z: number, parent: Group | Mesh = this.mesh): Mesh {
        const geo = new BoxGeometry(w, h, d);
        const mat = new MeshStandardMaterial({ color });
        const part = new Mesh(geo, mat);
        part.position.set(x, y, z);
        part.castShadow = true;
        part.receiveShadow = true;
        parent.add(part);
        return part;
    }

    public update(deltaTime: number): void {
        this.stateTimer -= deltaTime;
        
        if (this.state === 'WANDER') {
            this.animationTime += deltaTime * 0.01 * this.walkSpeed * 100;
            this.animateLegs();
        } else {
            this.resetLegs();
        }

        if (this.stateTimer <= 0) {
            this.switchState();
        }

        if (this.state === 'WANDER') {
            this.applyWander();
        }

        this.applyPhysics();
    }

    protected abstract animateLegs(): void;
    protected abstract resetLegs(): void;

    private switchState(): void {
        this.state = Math.random() > 0.4 ? 'WANDER' : 'IDLE';
        this.resetState();
    }

    private resetState(): void {
        if (this.state === 'IDLE') {
            this.stateTimer = 1000 + Math.random() * 3000;
            this.velocity.x = 0;
            this.velocity.z = 0;
        } else {
            this.stateTimer = 2000 + Math.random() * 4000;
            const angle = Math.random() * Math.PI * 2;
            this.wanderDirection.set(Math.cos(angle), 0, Math.sin(angle));
        }
    }

    private applyWander(): void {
        this.velocity.x = this.wanderDirection.x * this.walkSpeed;
        this.velocity.z = this.wanderDirection.z * this.walkSpeed;
        
        // Face the movement direction
        const targetRot = Math.atan2(this.wanderDirection.x, this.wanderDirection.z);
        this.mesh.rotation.y = targetRot;
    }

    protected onCollision(axis: 'x' | 'y' | 'z'): void {
        // If we hit a wall while wandering, try to jump
        if ((axis === 'x' || axis === 'z') && this.isGrounded && this.state === 'WANDER') {
            this.velocity.y = this.jumpPower;
        }
    }
}
