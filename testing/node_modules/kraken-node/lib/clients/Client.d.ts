import { SignalingClient } from "./SignalingClient";
import { ClientInterface } from '../interfaces/ClientInterface';
export declare abstract class Client extends SignalingClient implements ClientInterface {
    startKrakenForUserId(userId: Number): Promise<any>;
    stopKrakenForUserId(userId: Number): Promise<void>;
    abstract start(): Promise<any>;
    abstract stop(): Promise<any>;
    notifyReadyToStart(userId: Number): void;
    notifyReadyToFinish(userId: Number): void;
    notifyFinished(userId: Number): void;
    notifyProcessState(userId: Number, state: Number): void;
    allDevicesReadyToStart(): Promise<unknown>;
    waitForAllDevicesReadyToStartOrTimeout(startTime: any, resolve: any): void;
    allDevicesReadyToFinish(): Promise<unknown>;
    waitForAllDevicesReadyToFinishOrTimeout(startTime: any, resolve: any): void;
    private allRegisteredDevicesAreReadyToStart;
    private allRegisteredDevicesAreReadyToFinish;
}
//# sourceMappingURL=Client.d.ts.map