import { Vehicle } from '../../vehicle/VehicleEntity';

export class s15 extends Vehicle {
  constructor() {
    super(String(Date.now() + '_s15'), {
      id: 256,
      model: 'vehicles:s15',
    });
  }
}
