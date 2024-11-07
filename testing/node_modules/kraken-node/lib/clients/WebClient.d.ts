import { Client } from './Client';
export declare class WebClient extends Client {
    browserName: string;
    otherParams: any;
    private browser;
    constructor(browserName: string, otherParams?: any, id?: string);
    start(): Promise<any>;
    private capabilities;
    stop(): Promise<any>;
}
//# sourceMappingURL=WebClient.d.ts.map