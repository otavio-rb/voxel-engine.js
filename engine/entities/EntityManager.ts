import { Object3D } from 'three';
import { Entity } from './Entity';

export class EntityManager {
    private entities: Set<Entity> = new Set();
    private readonly container: Object3D;

    constructor(container: Object3D) {
        this.container = container;
    }

    public add(entity: Entity): void {
        this.entities.add(entity);
        this.container.add(entity.mesh);
    }

    public remove(entity: Entity): void {
        if (this.entities.delete(entity)) {
            try {
                this.container.remove(entity.mesh);
            } catch (e) {
                console.warn('Erro ao remover mesh da entidade:', e);
            }
            try {
                entity.dispose();
            } catch (e) {
                console.warn('Erro ao dispor entidade:', e);
            }
        }
    }

    public update(deltaTime: number): void {
        for (const entity of this.entities) {
            entity.update(deltaTime);
        }
    }

    public clear(): void {
        for (const entity of this.entities) {
            this.remove(entity);
        }
    }

    public get count(): number {
        return this.entities.size;
    }

    public getEntities(): Entity[] {
        return Array.from(this.entities);
    }
}
