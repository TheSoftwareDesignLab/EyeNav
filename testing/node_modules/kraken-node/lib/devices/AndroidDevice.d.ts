import { Device } from './Device';
export declare class AndroidDevice extends Device {
    constructor(id: string, model: string);
    screenSize(): {
        height: number;
        width: number;
    };
    sdkVersion(): number;
    orientation(): number;
}
//# sourceMappingURL=AndroidDevice.d.ts.map