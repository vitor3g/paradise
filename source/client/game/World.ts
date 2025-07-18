import { Scene } from 'three';
import { BaseEntity } from '../ecs/BaseEntity';
import type {
  EntityId,
  IGameEntity,
  IGameSystem,
  IGameWorld,
} from '../ecs/interfaces';
import { CommonEvents } from '../enums/CommonEventsEnum';

export class World implements IGameWorld {
  readonly name: string;
  readonly scene: Scene;
  readonly entities = new Map<EntityId, IGameEntity>();
  readonly systems: IGameSystem[] = [];

  active = true;

  private initialized = false;
  private paused = false;

  constructor() {
    this.name = 'BaseWorld';
    this.scene = g_core.getGraphics().getRenderer().scene;
  }

  createEntity(name = 'Entity'): IGameEntity {
    const entity = new BaseEntity(this, name);
    this.addEntity(entity);
    return entity;
  }

  addEntity(entity: IGameEntity): void {
    if (this.entities.has(entity.name)) {
      console.warn(
        `Entity with ID ${entity.name} already exists in world ${this.name}`,
      );
      return;
    }

    this.entities.set(entity.name, entity);

    this.scene.add(entity.object3D);

    for (const system of this.systems) {
      if (system.checkEntityCompatibility(entity)) {
        system.addEntity(entity);
      }
    }

    if (this.initialized) {
      entity.initialize();
    }

    console.log(`Entity '${entity.name}' (${entity.name}) added to world`);
  }

  removeEntity(entityOrId: IGameEntity | EntityId): boolean {
    const id = typeof entityOrId === 'string' ? entityOrId : entityOrId.name;
    const entity = this.entities.get(id);

    if (!entity) {
      return false;
    }

    this.scene.remove(entity.object3D);

    for (const system of this.systems) {
      system.removeEntity(entity);
    }

    this.entities.delete(id);

    console.log(`Entity '${entity.name}' (${entity.name}) removed from world`);

    return true;
  }

  getEntity(id: EntityId): IGameEntity | null {
    return this.entities.get(id) ?? null;
  }

  findEntitiesByName(name: string): IGameEntity[] {
    const results: IGameEntity[] = [];

    this.entities.forEach((entity) => {
      if (entity.name === name) {
        results.push(entity);
      }
    });

    return results;
  }

  findEntitiesByTag(tag: string): IGameEntity[] {
    const results: IGameEntity[] = [];

    this.entities.forEach((entity) => {
      if (entity.tags.has(tag)) {
        results.push(entity);
      }
    });

    return results;
  }

  addSystem(system: IGameSystem): void {
    if (this.systems.includes(system)) {
      console.warn(
        `System '${system.name}' already exists in world ${this.name}`,
      );
      return;
    }

    (system as any).world = this;

    this.systems.push(system);

    this.sortSystems();

    if (this.initialized) {
      system.initialize();

      this.entities.forEach((entity) => {
        if (system.checkEntityCompatibility(entity)) {
          system.addEntity(entity);
        }
      });
    }

    console.log(`System '${system.name}' added to world`);
  }

  removeSystem(system: IGameSystem): boolean {
    const index = this.systems.indexOf(system);

    if (index === -1) {
      return false;
    }

    this.systems.splice(index, 1);

    system.destroy();

    console.log(`System '${system.name}' removed from world`);

    return true;
  }

  getSystem<T extends IGameSystem>(
    systemType: new (...args: any[]) => T,
  ): T | null {
    for (const system of this.systems) {
      if (system instanceof systemType) {
        return system;
      }
    }

    return null;
  }

  update(deltaTime: number): void {
    if (!this.active || this.paused) {
      return;
    }

    for (const system of this.systems) {
      if (system.enabled) {
        system.update(deltaTime);
      }
    }

    this.entities.forEach((entity) => {
      if (entity.active) {
        entity.update(deltaTime);
      }
    });
  }

  fixedUpdate(fixedDeltaTime: number): void {
    if (!this.active || this.paused) {
      return;
    }

    for (const system of this.systems) {
      if (system.enabled && system.fixedUpdate) {
        system.fixedUpdate(fixedDeltaTime);
      }
    }
  }

  initialize(): void {
    if (this.initialized) {
      return;
    }

    console.log(`Initializing world '${this.name}'`);

    for (const system of this.systems) {
      system.initialize();
    }

    this.entities.forEach((entity) => {
      entity.initialize();
    });

    this.initialized = true;

    console.log(`World '${this.name}' initialized`);

    g_core
      .getInternalNet()
      .on(CommonEvents.EVENT_UPDATE, this.update.bind(this));
    g_core
      .getInternalNet()
      .emit(CommonEvents.EVENT_WORLD_INIT, this.initialized);
  }

  destroy(): void {
    console.log(`Destroying world '${this.name}'`);

    const entityIds = Array.from(this.entities.keys());
    for (const id of entityIds) {
      const entity = this.entities.get(id);
      if (entity) {
        entity.destroy();
      }
    }

    this.entities.clear();

    for (const system of this.systems.slice()) {
      system.destroy();
    }

    this.systems.length = 0;

    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }

    this.active = false;
    this.initialized = false;

    console.log(`World '${this.name}' destroyed`);
  }

  pause(): void {
    if (!this.paused) {
      this.paused = true;
      console.log(`World '${this.name}' paused`);

      g_core.getInternalNet().emit('world.pause', { world: this.name });
    }
  }

  resume(): void {
    if (this.paused) {
      this.paused = false;
      console.log(`World '${this.name}' resumed`);

      g_core.getInternalNet().emit('world.resume', { world: this.name });
    }
  }

  toJSON(): object {
    const entitiesData: Record<string, object> = {};
    this.entities.forEach((entity, id) => {
      if (!entity.parent) {
        entitiesData[id] = entity.toJSON();
      }
    });

    return {
      name: this.name,
      active: this.active,
      entities: entitiesData,
    };
  }

  fromJSON(json: object): void {
    const data = json as any;

    if (data.name) {
      if (data.name !== this.name) {
        console.warn(
          `World name mismatch: expected '${this.name}', got '${data.name}'`,
        );
      }
    }

    if (data.active !== undefined) {
      this.active = data.active;
    }

    this.entities.forEach((entity) => {
      entity.destroy();
    });

    if (data.entities) {
      const entityMap = new Map<string, IGameEntity>();

      for (const id in data.entities) {
        const entityData = data.entities[id];
        const entity = this.createEntity(entityData.name);
        entityMap.set(id, entity);
      }

      for (const id in data.entities) {
        const entityData = data.entities[id];
        const entity = entityMap.get(id);

        if (entity) {
          entity.fromJSON(entityData);
        }
      }

      for (const id in data.entities) {
        const entityData = data.entities[id];
        const entity = entityMap.get(id);

        if (entity && entityData.children) {
          for (const childId of entityData.children) {
            const childEntity = entityMap.get(childId);
            if (childEntity) {
              entity.addChild(childEntity);
            }
          }
        }
      }
    }
  }

  preRender(): void {
    if (!this.active || this.paused) {
      return;
    }

    for (const system of this.systems) {
      if (system.enabled && system.preRender) {
        system.preRender();
      }
    }
  }

  postRender(): void {
    if (!this.active || this.paused) {
      return;
    }

    for (const system of this.systems) {
      if (system.enabled && system.postRender) {
        system.postRender();
      }
    }
  }

  private sortSystems(): void {
    this.systems.sort((a, b) => a.priority - b.priority);
  }
}
