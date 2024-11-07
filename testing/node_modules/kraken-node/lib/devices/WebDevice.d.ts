import { Device } from './Device';
export declare class WebDevice extends Device {
    constructor(id: string, model: string);
    static factoryCreate(): WebDevice;
    screenSize(): {
        height: number;
        width: number;
    };
    sdkVersion(): number;
    orientation(): number;
}
//# sourceMappingURL=WebDevice.d.ts.map