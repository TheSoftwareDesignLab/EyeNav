import { DeviceProcess } from './DeviceProcess';
import { Device } from '../devices/Device';
import { TestScenario } from '../TestScenario';
export declare class WebProcess extends DeviceProcess {
    constructor(id: number, device: Device, testScenario: TestScenario);
    run(): Promise<void>;
}
//# sourceMappingURL=WebProcess.d.ts.map