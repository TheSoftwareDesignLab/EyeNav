import { Client } from './Client';
export declare class AndroidClient extends Client {
    port: any;
    proc: any;
    app: string;
    deviceId: string;
    appPackage: string;
    appActivity: string;
    otherParams: any;
    private client;
    private defaultClientTimout;
    private clientStartingTime;
    constructor(deviceId: string, app: string, appPackage: string, appActivity: string, otherParams?: any, id?: string);
    start(): Promise<any>;
    stop(): Promise<any>;
    generaOpts(): {
        path: string;
        port: any;
        capabilities: any;
    };
    private capabilities;
    availablePort(): Promise<any>;
    private startProcess;
    private waitForClientToStart;
    private onStdout;
    private onStderr;
}
//# sourceMappingURL=AndroidClient.d.ts.map