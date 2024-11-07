export declare class PropertyManager {
    private static singletonInstance;
    constructor();
    static instance(): PropertyManager;
    static stringIsAProperty(string: String): boolean;
    getProperty(property: string): any;
    private allUserProperties;
}
//# sourceMappingURL=PropertyManager.d.ts.map