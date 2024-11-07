export declare abstract class Device {
    id: string;
    model: string;
    constructor(id: string, model: string);
    static generateRandomId(): string;
    toString(): string;
    abstract screenSize(): {
        height: number;
        width: number;
    };
    abstract sdkVersion(): number;
    abstract orientation(): number;
}
//# sourceMappingURL=Device.d.ts.map