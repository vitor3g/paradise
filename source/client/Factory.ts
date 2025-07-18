import { PhysicsLoader } from '@enable3d/ammo-physics';
import { CoreModule } from './core/Core';

export class dzFactoryStatic {
  constructor() {}

  public async create() {
    PhysicsLoader('/data/libs/ammojs', async () => {
      const module = CoreModule();
      await module.initialize();
    });

    window.DRIFTZONE_DEBUG = true;

    return 0;
  }
}

export const DriftZone = new dzFactoryStatic();
