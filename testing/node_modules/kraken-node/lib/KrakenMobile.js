"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KrakenMobile = void 0;
var TestScenario_1 = require("./TestScenario");
var FeatureReader_1 = require("./cucumber/FeatureReader");
var FileHelper_1 = require("./utils/FileHelper");
var Constants = __importStar(require("./utils/Constants"));
var KrakenMobile = /** @class */ (function () {
    function KrakenMobile() {
        this.scenariosQueue = [];
        this.buildScenariosQueue();
        if (this.usesMultipleApks()) {
            this.checkIfApksArePresentIfRequired();
        }
        else {
            this.checkIfApkIsPresentIfRequired();
        }
    }
    KrakenMobile.prototype.start = function () {
        this.executeNextScenario();
    };
    KrakenMobile.prototype.buildScenariosQueue = function () {
        var _this = this;
        var features = FeatureReader_1.FeatureReader.instance().getFeatureFiles();
        features.forEach(function (feature) {
            _this.scenariosQueue.push(new TestScenario_1.TestScenario(feature, _this));
        });
    };
    KrakenMobile.prototype.checkIfApkIsPresentIfRequired = function () {
        if (!this.requiresMobileInfo()) {
            return;
        }
        if (!FileHelper_1.FileHelper.instance().pathExists(Constants.MOBILE_INFO_PATH)) {
            throw new Error("ERROR: There is no " + Constants.MOBILE_INFO_PATH + " file.");
        }
        var mobileInfo = FileHelper_1.FileHelper.instance().contentOfFile(Constants.MOBILE_INFO_PATH);
        var mobileInfoJson = JSON.parse(mobileInfo);
        var apkPath = mobileInfoJson['apk_path'];
        this.checkIfApkPathExist(apkPath);
    };
    KrakenMobile.prototype.checkIfApksArePresentIfRequired = function () {
        var _this = this;
        if (!this.requiresMobileInfo()) {
            return;
        }
        if (!FileHelper_1.FileHelper.instance().pathExists(Constants.MOBILE_INFO_PATH)) {
            throw new Error("ERROR: There is no " + Constants.MOBILE_INFO_PATH + " file.");
        }
        var mobileInfo = FileHelper_1.FileHelper.instance().contentOfFile(Constants.MOBILE_INFO_PATH);
        var mobileInfoJson = JSON.parse(mobileInfo);
        var jsonKeys = Object.keys(mobileInfoJson);
        var userKeys = jsonKeys.filter(function (jsonKey) { return jsonKey.startsWith('@user'); });
        var userValue = null;
        userKeys.forEach(function (userKey) {
            userValue = mobileInfoJson[userKey];
            _this.checkIfApkPathExist(userValue['apk_path']);
        });
    };
    KrakenMobile.prototype.checkIfApkPathExist = function (apkPath) {
        if (!apkPath || !FileHelper_1.FileHelper.instance().pathExists(apkPath)) {
            throw new Error("ERROR: The specified APK path does not exist make sure the path is correct. APK path " + apkPath);
        }
        if (!FileHelper_1.FileHelper.instance().isValidApk(apkPath)) {
            throw new Error("ERROR: File " + apkPath + " is not a valid APK.");
        }
    };
    KrakenMobile.prototype.usesMultipleApks = function () {
        if (!FileHelper_1.FileHelper.instance().pathExists(Constants.MOBILE_INFO_PATH)) {
            throw new Error("ERROR: There is no " + Constants.MOBILE_INFO_PATH + " file.");
        }
        var mobileInfo = FileHelper_1.FileHelper.instance().contentOfFile(Constants.MOBILE_INFO_PATH);
        var mobileInfoJson = JSON.parse(mobileInfo);
        return mobileInfoJson['type'] && mobileInfoJson['type'].toLowerCase() == 'multiple';
    };
    KrakenMobile.prototype.requiresMobileInfo = function () {
        return this.scenariosQueue.filter(function (scenario) {
            return scenario.sampleMobileDevices().length > 0;
        }).length > 0;
    };
    KrakenMobile.prototype.onTestScenarioFinished = function () {
        this.executeNextScenario();
    };
    KrakenMobile.prototype.executeNextScenario = function () {
        if (this.scenariosQueue.length <= 0) {
            return null;
        }
        var scenario = this.scenariosQueue.shift();
        if (!scenario) {
            return null;
        }
        scenario.run();
        return scenario;
    };
    return KrakenMobile;
}());
exports.KrakenMobile = KrakenMobile;
//# sourceMappingURL=KrakenMobile.js.map