import { Animal } from './Animal';
import ProceduralWorld from '../Worlds/ProceduralWorld';
import { Mesh, Group } from 'three';

export class Sheep extends Animal {
    private legs!: Mesh[];

    constructor(world: ProceduralWorld) {
        super(world, { width: 0.8, height: 0.9 }, 0xffffff);
        this.buildModel(0xffffff);
    }

    protected buildModel(color: number): void {
        this.legs = [];
        // Body (Fluffy wool)
        this.createPart(0.8, 0.7, 1.2, color, 0, 0.45, 0);
        
        // Head
        this.createPart(0.4, 0.4, 0.4, 0xf5ead3, 0, 0.7, 0.6);
        
        // Legs
        this.legs.push(this.createPart(0.15, 0.4, 0.15, 0x999999, -0.25, 0.2, 0.4));
        this.legs.push(this.createPart(0.15, 0.4, 0.15, 0x999999, 0.25, 0.2, 0.4));
        this.legs.push(this.createPart(0.15, 0.4, 0.15, 0x999999, -0.25, 0.2, -0.4));
        this.legs.push(this.createPart(0.15, 0.4, 0.15, 0x999999, 0.25, 0.2, -0.4));
    }

    protected animateLegs(): void {
        if (!this.legs || this.legs.length < 4) return;
        const angle = Math.sin(this.animationTime) * 0.4;
        this.legs[0].rotation.x = angle;
        this.legs[1].rotation.x = -angle;
        this.legs[2].rotation.x = -angle;
        this.legs[3].rotation.x = angle;
    }

    protected resetLegs(): void {
        if (!this.legs) return;
        this.legs.forEach(l => l.rotation.x = 0);
    }
}
