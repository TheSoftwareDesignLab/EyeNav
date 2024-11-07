export declare class KrakenFaker {
    private static singletonInstance;
    constructor();
    static instance(): KrakenFaker;
    generateValueForKey(key: string): string;
    reuseValueForKey(key: string): string;
    private dictionaryJson;
    private saveKeyValueInDictionary;
    private generateName;
    private generateNumber;
    private generateEmail;
    private generateString;
    private generateDate;
    private generateUrl;
    static stringIsAFaker(string: String): boolean;
    static stringIsAFakerReuse(string: String): boolean;
}
//# sourceMappingURL=KrakenFaker.d.ts.map