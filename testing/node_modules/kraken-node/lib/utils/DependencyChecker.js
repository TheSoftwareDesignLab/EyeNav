"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DependencyChecker = void 0;
var child_process_1 = require("child_process");
var DependencyChecker = /** @class */ (function () {
    function DependencyChecker() {
    }
    DependencyChecker.instance = function () {
        if (!DependencyChecker.singletonInstance) {
            DependencyChecker.singletonInstance = new DependencyChecker();
        }
        return DependencyChecker.singletonInstance;
    };
    DependencyChecker.prototype.checkDependencies = function () {
        var installedText = 'Installed';
        var notInstalledText = 'Not installed';
        console.log('Checking dependencies...');
        console.log("Android SDK [" + (this.isAndroidSdkInstalled() ? installedText : notInstalledText) + "] (Required only for mobile testing - ANDROID_HOME)");
        console.log("Android ADB [" + (this.isAdbInstalled() ? installedText : notInstalledText) + "] (Required only for mobile testing - ANDROID_HOME/tools and ANDROID_HOME/platform-tools)");
        console.log("Android AAPT [" + (this.isAaptInstalled() ? installedText : notInstalledText) + "] (Required only for Kraken's info command - ANDROID_HOME/build-tools/:version)");
        console.log("Appium [" + (this.isAppiumInstalled() ? installedText : notInstalledText) + "] (Required only for mobile testing)");
        console.log("Java [" + (this.isJavaInstalled() ? installedText : notInstalledText) + "] (JAVA_HOME)");
        console.log('Done.');
    };
    DependencyChecker.prototype.isAndroidSdkInstalled = function () {
        var adb_path = process.env.ANDROID_HOME;
        return adb_path != undefined && adb_path != null;
    };
    DependencyChecker.prototype.isAaptInstalled = function () {
        try {
            var aaptVersion = child_process_1.execSync('aapt version');
            return aaptVersion != undefined && aaptVersion != null;
        }
        catch (error) {
            return false;
        }
    };
    DependencyChecker.prototype.isAdbInstalled = function () {
        try {
            var adbVersion = child_process_1.execSync('adb version');
            return adbVersion != undefined && adbVersion != null;
        }
        catch (error) {
            return false;
        }
    };
    DependencyChecker.prototype.isJavaInstalled = function () {
        var java_path = process.env.JAVA_HOME;
        return java_path != undefined && java_path != null;
    };
    DependencyChecker.prototype.isAppiumInstalled = function () {
        try {
            var appiumVersion = child_process_1.execSync('appium -v');
            return appiumVersion != undefined && appiumVersion != null;
        }
        catch (error) {
            return false;
        }
    };
    return DependencyChecker;
}());
exports.DependencyChecker = DependencyChecker;
//# sourceMappingURL=DependencyChecker.js.map