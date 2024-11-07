import { FeatureScenario } from './FeatureScenario';
export declare class FeatureFile {
    filePath: string;
    scenarios: FeatureScenario[];
    constructor(filePath: string);
    readContent(): void;
    requiredDevicesInfo(): {
        userId: string;
        systemType: string;
    }[];
    numberOfRequiredMobileDevices(): number;
    numberOfRequiredWebDevices(): number;
    numberOfRequiredDevices(): number;
    hasRightSyntax(): Boolean;
    hasDuplicateTagsForAUser(): Boolean;
    allScenariosHaveAUserTag(): Boolean;
    private allTags;
    private allUserTags;
    private uniqueUserTags;
    private systemTags;
    private gherkinDocument;
}
//# sourceMappingURL=FeatureFile.d.ts.map