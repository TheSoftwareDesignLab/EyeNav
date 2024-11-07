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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestScenario = void 0;
var ADB_1 = require("./utils/ADB");
var AndroidDevice_1 = require("./devices/AndroidDevice");
var WebDevice_1 = require("./devices/WebDevice");
var AndroidProcess_1 = require("./processes/AndroidProcess");
var WebProcess_1 = require("./processes/WebProcess");
var DeviceProcess_1 = require("./processes/DeviceProcess");
var Constants = __importStar(require("./utils/Constants"));
var FileHelper_1 = require("./utils/FileHelper");
var Reporter_1 = require("./reports/Reporter");
var randomBytes = require('crypto').randomBytes;
var TestScenario = /** @class */ (function () {
    function TestScenario(featureFile, krakenApp) {
        this.featureFile = featureFile;
        this.krakenApp = krakenApp;
        this.reporter = new Reporter_1.Reporter(this);
        this.processes = [];
        this.executionId = randomBytes(10).toString('hex');
        this.devices = [];
    }
    TestScenario.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.featureFile.hasRightSyntax()) {
                            throw new Error("ERROR: Verify feature file " + this.featureFile.filePath + " has one unique @user tag for each scenario");
                        }
                        this.beforeExecute();
                        this.execute();
                        return [4 /*yield*/, this.allProcessesFinished()];
                    case 1:
                        _a.sent();
                        this.afterExecute();
                        return [2 /*return*/];
                }
            });
        });
    };
    TestScenario.prototype.beforeExecute = function () {
        var _this = this;
        this.deleteAllInboxes();
        this.deleteSupportFilesAndDirectories();
        this.devices = this.sampleDevices();
        var interval = 1000;
        this.devices.forEach(function (device, index) {
            if (!device) {
                return;
            }
            var process = _this.processForUserIdInDevice(index + 1, device);
            process.registerProcessToDirectory();
            _this.processes.push(process);
        });
        this.reporter.createReportFolderRequirements();
    };
    TestScenario.prototype.execute = function () {
        var _this = this;
        this.processes.forEach(function (process) {
            process.run();
            _this.pause(5000);
        });
    };
    TestScenario.prototype.afterExecute = function () {
        this.deleteSupportFilesAndDirectories();
        this.notifyScenarioFinished();
        this.reporter.saveReport();
    };
    TestScenario.prototype.notifyScenarioFinished = function () {
        this.krakenApp.onTestScenarioFinished();
    };
    TestScenario.prototype.deleteSupportFilesAndDirectories = function () {
        FileHelper_1.FileHelper.instance().deleteFileInPathIfExists(Constants.DIRECTORY_PATH);
        FileHelper_1.FileHelper.instance().deleteFileInPathIfExists(Constants.DICTIONARY_PATH);
        for (var state in Constants.PROCESS_STATE_FILE_PATH) {
            FileHelper_1.FileHelper.instance().deleteFileInPathIfExists(Constants.PROCESS_STATE_FILE_PATH["" + state]);
        }
    };
    TestScenario.prototype.deleteAllInboxes = function () {
        FileHelper_1.FileHelper.instance().deleteFilesWithGlobPattern(process.cwd() + "/" + Constants.KRAKEN_DIRECTORY + "/.*_" + Constants.INBOX_FILE_NAME);
    };
    TestScenario.prototype.processForUserIdInDevice = function (userId, device) {
        var process = null;
        if (device instanceof AndroidDevice_1.AndroidDevice) {
            process = new AndroidProcess_1.AndroidProcess(userId, device, this);
        }
        else if (device instanceof WebDevice_1.WebDevice) {
            process = new WebProcess_1.WebProcess(userId, device, this);
        }
        else {
            throw new Error('ERROR: Platform not supported');
        }
        return process;
    };
    TestScenario.prototype.sampleDevices = function () {
        var sample = [];
        var mobileDevices = this.sampleMobileDevices();
        var webDevices = this.sampleWebDevices();
        this.featureFile.requiredDevicesInfo().forEach(function (deviceInfo) {
            var userId = Number(deviceInfo.userId);
            var device = deviceInfo.systemType === '@web' ? webDevices.shift() : mobileDevices.shift();
            sample[userId - 1] = device;
        });
        return sample;
    };
    TestScenario.prototype.sampleMobileDevices = function () {
        var mobileDevices = ADB_1.ADB.instance().connectedDevices();
        var numberOfRequiredMobileDevices = this.featureFile.numberOfRequiredMobileDevices();
        return mobileDevices.slice(0, numberOfRequiredMobileDevices);
    };
    TestScenario.prototype.sampleWebDevices = function () {
        var numberOfRequiredWebDevices = this.featureFile.numberOfRequiredWebDevices();
        var webDevices = [];
        for (var i = 0; i < numberOfRequiredWebDevices; i++) {
            webDevices.push(WebDevice_1.WebDevice.factoryCreate());
        }
        return webDevices.slice(0, numberOfRequiredWebDevices);
    };
    TestScenario.prototype.allRegiresteredDevicesFinished = function () {
        var registered_ids = DeviceProcess_1.DeviceProcess.registeredProcessIds();
        var finished_ids = DeviceProcess_1.DeviceProcess.processesInState(Constants.PROCESS_STATES.finished);
        return registered_ids.filter(function (registered_id) {
            return !finished_ids.includes(registered_id);
        }).length <= 0;
    };
    TestScenario.prototype.allProcessesFinished = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve) { return _this.waitForAllProcessesToFinishOrTimeout(Date.now(), resolve); })];
            });
        });
    };
    TestScenario.prototype.waitForAllProcessesToFinishOrTimeout = function (startTime, resolve) {
        if (this.allRegiresteredDevicesFinished()) {
            resolve();
        }
        else if ((Date.now() - startTime) >= Constants.DEFAULT_PROCESS_TIMEOUT_SECONDS) {
            throw new Error("ERROR: Timeout, a process took more time than expected.");
        }
        else {
            setTimeout(this.waitForAllProcessesToFinishOrTimeout.bind(this, startTime, resolve), 1000);
        }
    };
    TestScenario.prototype.pause = function (milliseconds) {
        var dt = new Date();
        while (new Date() - dt <= milliseconds) { }
    };
    return TestScenario;
}());
exports.TestScenario = TestScenario;
//# sourceMappingURL=TestScenario.js.map