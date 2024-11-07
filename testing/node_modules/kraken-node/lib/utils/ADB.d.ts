import { AndroidDevice } from '../devices/AndroidDevice';
export declare class ADB {
    private static singletonInstance;
    private constructor();
    static instance(): ADB;
    connectedDevices(): AndroidDevice[];
    deviceScreenSize(deviceId: string): number[];
    deviceOrientation(deviceId: string): string;
    startMonkeyWithEvents(events: number, deviceId: string, apkPackage: string): void;
    deviceSdkVersion(deviceId: string): string;
    saveSnapshotInFilePath(deviceId: string, filePath: string): any;
    private extractDeviceIdFromLine;
    private extractDeviceModelFromLine;
    private extractDeviceScreenSizeInfo;
}
//# sourceMappingURL=ADB.d.ts.map