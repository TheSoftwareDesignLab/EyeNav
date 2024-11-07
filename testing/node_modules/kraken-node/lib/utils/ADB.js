"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADB = void 0;
var execSync = require("child_process").execSync;
var AndroidDevice_1 = require("../devices/AndroidDevice");
var ADB = /** @class */ (function () {
    function ADB() {
    }
    ADB.instance = function () {
        if (!ADB.singletonInstance) {
            ADB.singletonInstance = new ADB();
        }
        return ADB.singletonInstance;
    };
    ADB.prototype.connectedDevices = function () {
        var _this = this;
        var devices = [];
        var adbDevices = execSync('adb devices -l').toString();
        adbDevices.split('\n').forEach(function (line) {
            var id = _this.extractDeviceIdFromLine(line);
            var model = _this.extractDeviceModelFromLine(line);
            if (!id || !model) {
                return;
            }
            devices.push(new AndroidDevice_1.AndroidDevice(id, model));
        });
        return devices;
    };
    ADB.prototype.deviceScreenSize = function (deviceId) {
        var adbScreenSize = execSync("adb -s " + deviceId + " shell wm size").toString();
        return this.extractDeviceScreenSizeInfo(adbScreenSize);
    };
    ADB.prototype.deviceOrientation = function (deviceId) {
        return execSync("adb -s " + deviceId + " shell dumpsys input | grep 'SurfaceOrientation' | awk '{ print $2 }'").toString();
    };
    ADB.prototype.startMonkeyWithEvents = function (events, deviceId, apkPackage) {
        execSync("adb -s " + deviceId + " shell monkey -p " + apkPackage + " -v " + events);
    };
    ADB.prototype.deviceSdkVersion = function (deviceId) {
        return execSync("adb -s " + deviceId + " shell getprop ro.build.version.sdk").toString();
    };
    ADB.prototype.saveSnapshotInFilePath = function (deviceId, filePath) {
        return execSync("adb -s " + deviceId + " shell cat /sdcard/window_dump.xml > " + filePath);
    };
    ADB.prototype.extractDeviceIdFromLine = function (line) {
        if (line.match(/device(?!s)/)) {
            return line.split(' ')[0];
        }
    };
    ADB.prototype.extractDeviceModelFromLine = function (line) {
        if (line.match(/device(?!s)/)) {
            var match = line.match(/model:(.*) device/);
            if (match && match.length > 1) {
                return match[1];
            }
        }
    };
    ADB.prototype.extractDeviceScreenSizeInfo = function (line) {
        var parts = line.trim().split(' ');
        var size = parts[parts.length - 1];
        if (!size.includes('x')) {
            return [0, 0];
        }
        return size.split('x').map(function (part) { return Number(part); });
    };
    return ADB;
}());
exports.ADB = ADB;
//# sourceMappingURL=ADB.js.map