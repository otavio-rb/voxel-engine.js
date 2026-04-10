import { Animal } from './Animal';
import ProceduralWorld from '../Worlds/ProceduralWorld';
import { Mesh } from 'three';

export class Chicken extends Animal {
    private legs!: Mesh[];

    constructor(world: ProceduralWorld) {
        // Chicken is much smaller!
        super(world, { width: 0.4, height: 0.5 }, 0xffffff);
        this.buildModel(0xffffff);
    }

    protected buildModel(color: number): void {
        this.legs = [];
        // Body
        this.createPart(0.4, 0.4, 0.4, color, 0, 0.3, 0);
        
        // Head
        const head = this.createPart(0.2, 0.3, 0.2, color, 0, 0.55, 0.2);
        
        // Beak (Yellow)
        this.createPart(0.15, 0.1, 0.1, 0xffcc00, 0, 0, 0.1, head);
        // Comb (Red)
        this.createPart(0.05, 0.1, 0.1, 0xff0000, 0, 0.2, 0, head);
        
        // Wings
        this.createPart(0.1, 0.3, 0.3, color, -0.25, 0.3, 0);
        this.createPart(0.1, 0.3, 0.3, color, 0.25, 0.3, 0);
        
        // Legs (represented as simple sticks)
        this.legs.push(this.createPart(0.05, 0.2, 0.05, 0xffcc00, -0.1, 0.1, 0));
        this.legs.push(this.createPart(0.05, 0.2, 0.05, 0xffcc00, 0.1, 0.1, 0));
    }

    protected animateLegs(): void {
        if (!this.legs || this.legs.length < 2) return;
        const angle = Math.sin(this.animationTime * 1.5) * 0.6; // Chickens move legs faster
        this.legs[0].rotation.x = angle;
        this.legs[1].rotation.x = -angle;
    }

    protected resetLegs(): void {
        if (!this.legs) return;
        this.legs.forEach(l => l.rotation.x = 0);
    }
}
