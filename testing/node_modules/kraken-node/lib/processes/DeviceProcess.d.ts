import { Device } from '../devices/Device';
import { TestScenario } from '../TestScenario';
import { DeviceProcessInterface } from '../interfaces/DeviceProcessInterface';
export declare abstract class DeviceProcess implements DeviceProcessInterface {
    id: Number;
    device: Device;
    testScenario: TestScenario;
    constructor(id: Number, device: Device, testScenario: TestScenario);
    abstract run(): void;
    protected runWithArgs(args: string[]): Promise<void>;
    protected baseArgs(): string[];
    private worldParams;
    apkInfo(): any;
    apkPath(): string;
    private mobileInfoAsJSON;
    private mobileInfoForProcess;
    handleCucumberResult(succeeded: any): void;
    static directory(): string[];
    static registeredProcessIds(): Number[];
    static processesInState(state: Number): Number[];
    static findProcessWithUserId(userId: string): any;
    registerProcessToDirectory(): void;
}
//# sourceMappingURL=DeviceProcess.d.ts.map