export declare class WebMonkey {
    driver: any;
    constructor(driver: any);
    executeKrakenMonkey(numberOfEvents: number): Promise<void>;
    executeRandomAction(): Promise<void>;
    randomClick(): Promise<any>;
    insertRandomText(): Promise<any>;
    private highlightElement;
    private removeElementHighlight;
}
//# sourceMappingURL=WebMonkey.d.ts.map