import { Animal } from './Animal';
import ProceduralWorld from '../Worlds/ProceduralWorld';
import { Mesh } from 'three';

export class Cow extends Animal {
    private legs!: Mesh[];

    constructor(world: ProceduralWorld) {
        super(world, { width: 0.9, height: 1.1 }, 0x4b2d1f);
        this.buildModel(0x4b2d1f);
    }

    protected buildModel(color: number): void {
        this.legs = [];
        // Body
        this.createPart(0.9, 0.9, 1.4, color, 0, 0.6, 0);
        
        // Head with snout
        const head = this.createPart(0.5, 0.5, 0.5, color, 0, 0.9, 0.7);
        this.createPart(0.4, 0.2, 0.2, 0xffcccc, 0, -0.1, 0.3, head); // snout
        
        // Horns
        this.createPart(0.1, 0.2, 0.1, 0xeeeeee, -0.2, 0.3, 0, head);
        this.createPart(0.1, 0.2, 0.1, 0xeeeeee, 0.2, 0.3, 0, head);
        
        // Legs
        this.legs.push(this.createPart(0.2, 0.5, 0.2, color, -0.3, 0.25, 0.5));
        this.legs.push(this.createPart(0.2, 0.5, 0.2, color, 0.3, 0.25, 0.5));
        this.legs.push(this.createPart(0.2, 0.5, 0.2, color, -0.3, 0.25, -0.5));
        this.legs.push(this.createPart(0.2, 0.5, 0.2, color, 0.3, 0.25, -0.5));
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
