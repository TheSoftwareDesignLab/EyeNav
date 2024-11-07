export declare class FileHelper {
    private static singletonInstance;
    private constructor();
    static instance(): FileHelper;
    pathExists(path: string): boolean;
    deleteFilesWithGlobPattern(globPattern: string): void;
    deleteFileInPath(path: string): void;
    deleteFileInPathIfExists(path: string): void;
    filesInPath(path: string): string[];
    featureFilesInPath(path: string): string[];
    copyFolderToPath(folderPath: string, destinationPath: string): void;
    createFolderIfDoesNotExist(path: string): void;
    createFileIfDoesNotExist(path: string): void;
    contentOfFile(path: string): any;
    appendTextToFile(text: string, path: string): void;
    writeTextToFile(text: string, path: string): void;
    isValidApk(apkPath: string): Boolean;
    pathToAbsolutePath(filePath: string): string;
    createKrakenSupportFileIfDoesNotExist(path: string): void;
}
//# sourceMappingURL=FileHelper.d.ts.map