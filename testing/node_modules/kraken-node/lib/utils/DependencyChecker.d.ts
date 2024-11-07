export declare class DependencyChecker {
    private static singletonInstance;
    constructor();
    static instance(): DependencyChecker;
    checkDependencies(): void;
    isAndroidSdkInstalled(): Boolean;
    isAaptInstalled(): Boolean;
    isAdbInstalled(): Boolean;
    isJavaInstalled(): Boolean;
    isAppiumInstalled(): Boolean;
}
//# sourceMappingURL=DependencyChecker.d.ts.map