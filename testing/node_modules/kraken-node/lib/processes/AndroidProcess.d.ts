import { DeviceProcess } from './DeviceProcess';
import { Device } from '../devices/Device';
import { TestScenario } from '../TestScenario';
export declare class AndroidProcess extends DeviceProcess {
    constructor(id: number, device: Device, testScenario: TestScenario);
    run(): Promise<void>;
}
//# sourceMappingURL=AndroidProcess.d.ts.map