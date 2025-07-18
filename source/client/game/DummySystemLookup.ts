import type { Object3D } from 'three';
import { BaseSystem } from '../ecs/BaseSystem';
import {
  SystemPriority,
  type IGameEntity,
  type IGameWorld,
} from '../ecs/interfaces';

export class DummyLookupSystem extends BaseSystem {
  constructor(world: IGameWorld) {
    super(world, 'DummyLookupSystem', SystemPriority.HIGH);
  }

  checkEntityCompatibility(entity: IGameEntity): boolean {
    return !!entity && !!entity.object3D;
  }

  getDummies(entity: IGameEntity): Object3D[] {
    const dummies: Object3D[] = [];

    if (!this.checkEntityCompatibility(entity)) {
      return dummies;
    }

    const object = entity.object3D;

    object.traverse((child) => {
      if (child.name?.toLowerCase().includes('dummy')) {
        dummies.push(child);
      }
    });

    if (dummies.length > 0) {
      console.log(
        `Encontrados ${dummies.length} dummies no modelo "${entity.name}"`,
      );
    }

    return dummies;
  }

  getDummy(entity: IGameEntity, dummyName: string): Object3D | null {
    const dummies = this.getDummies(entity);
    return dummies.find((dummy) => dummy.name === dummyName) ?? null;
  }
}