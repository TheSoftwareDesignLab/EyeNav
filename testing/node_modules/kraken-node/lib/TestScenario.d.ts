import { FeatureFile } from './cucumber/FeatureFile';
import { AndroidDevice } from './devices/AndroidDevice';
import { WebDevice } from './devices/WebDevice';
import { Device } from './devices/Device';
import { DeviceProcess } from './processes/DeviceProcess';
import { Reporter } from './reports/Reporter';
import { KrakenMobile } from './KrakenMobile';
export declare class TestScenario {
    featureFile: FeatureFile;
    reporter: Reporter;
    processes: DeviceProcess[];
    krakenApp: KrakenMobile;
    executionId: string;
    devices: Device[];
    constructor(featureFile: FeatureFile, krakenApp: KrakenMobile);
    run(): Promise<void>;
    private beforeExecute;
    private execute;
    private afterExecute;
    private notifyScenarioFinished;
    private deleteSupportFilesAndDirectories;
    private deleteAllInboxes;
    processForUserIdInDevice(userId: number, device: Device): any;
    sampleDevices(): Device[];
    sampleMobileDevices(): AndroidDevice[];
    sampleWebDevices(): WebDevice[];
    private allRegiresteredDevicesFinished;
    private allProcessesFinished;
    private waitForAllProcessesToFinishOrTimeout;
    private pause;
}
//# sourceMappingURL=TestScenario.d.ts.map