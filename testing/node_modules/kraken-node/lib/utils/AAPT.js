"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AAPT = void 0;
var FileHelper_1 = require("./FileHelper");
var execSync = require("child_process").execSync;
var AAPT = /** @class */ (function () {
    function AAPT() {
    }
    AAPT.instance = function () {
        if (!AAPT.singletonInstance) {
            AAPT.singletonInstance = new AAPT();
        }
        return AAPT.singletonInstance;
    };
    AAPT.prototype.apkInfo = function (apkPath) {
        if (!FileHelper_1.FileHelper.instance().pathExists(apkPath)) {
            throw new Error("ERROR: File or directory " + apkPath + " does not exist");
        }
        var aaptResult = execSync("aapt dump badging " + apkPath).toString();
        return {
            apkLaunchActivity: this.extractApkLaunchActivityFromDumpBadging(aaptResult) || 'Not found',
            apkPackage: this.extractApkPackageFromDumpBadging(aaptResult) || 'Not found'
        };
    };
    AAPT.prototype.extractApkLaunchActivityFromDumpBadging = function (aapt) {
        var activity = aapt.trim().split('\n').find(function (line) {
            var activityLine = line.match(/launchable-activity/);
            return activityLine;
        });
        if (activity) {
            var match = activity.match(/name=(.*) label/);
            if (match && match.length > 1) {
                activity = match[1].trim().replace(/\'/g, '');
            }
        }
        ;
        return activity;
    };
    AAPT.prototype.extractApkPackageFromDumpBadging = function (aapt) {
        var appPackage = aapt.trim().split('\n').find(function (line) {
            var activityLine = line.match(/package/);
            return activityLine;
        });
        if (appPackage) {
            var match = appPackage.match(/name=(.*) versionCode/);
            if (match && match.length > 1) {
                appPackage = match[1].trim().replace(/\'/g, '');
            }
        }
        ;
        return appPackage;
    };
    return AAPT;
}());
exports.AAPT = AAPT;
//# sourceMappingURL=AAPT.js.map