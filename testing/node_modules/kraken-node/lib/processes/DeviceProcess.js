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
exports.DeviceProcess = void 0;
var child_process_1 = require("child_process");
var FileHelper_1 = require("../utils/FileHelper");
var Constants = __importStar(require("../utils/Constants"));
var DeviceProcess = /** @class */ (function () {
    function DeviceProcess(id, device, testScenario) {
        this.id = id;
        this.device = device;
        this.testScenario = testScenario;
    }
    DeviceProcess.prototype.runWithArgs = function (args) {
        return __awaiter(this, void 0, void 0, function () {
            var cucumberProcess;
            return __generator(this, function (_a) {
                cucumberProcess = child_process_1.spawn('node', args, {
                    stdio: 'inherit'
                });
                cucumberProcess.on('exit', function (err) {
                    if (err) {
                        console.log('Could not execute test');
                        process.exit(1);
                    }
                });
                return [2 /*return*/];
            });
        });
    };
    DeviceProcess.prototype.baseArgs = function () {
        return [
            __dirname + "/../../bin/cucumber",
            '-f', 'pretty',
            '-f',
            "json:" + Constants.REPORT_PATH + "/" + this.testScenario.executionId + "/" + this.device.id + "/" + Constants.FILE_REPORT_NAME,
            "" + this.testScenario.featureFile.filePath,
            '--tags',
            "@user" + this.id,
            '--world-parameters', this.worldParams(),
            '--require',
            FileHelper_1.FileHelper.instance().pathToAbsolutePath(__dirname + "/../steps/both.js")
        ];
    };
    DeviceProcess.prototype.worldParams = function () {
        return JSON.stringify({
            id: this.id,
            testScenarioId: this.testScenario.executionId,
            device: {
                id: this.device.id,
                model: this.device.model,
                _type: this.device.constructor.name
            },
            mobile_info: this.mobileInfoForProcess()
        });
    };
    DeviceProcess.prototype.apkInfo = function () {
        var jsonMobileInfo = this.mobileInfoAsJSON();
        if (jsonMobileInfo.type && jsonMobileInfo.type.toLowerCase() == 'multiple') {
            jsonMobileInfo = jsonMobileInfo["@user" + this.id];
        }
        return jsonMobileInfo;
    };
    DeviceProcess.prototype.apkPath = function () {
        var info = this.apkInfo();
        return info.apk_path;
    };
    DeviceProcess.prototype.mobileInfoAsJSON = function () {
        var mobileInfo = FileHelper_1.FileHelper.instance().contentOfFile(Constants.MOBILE_INFO_PATH);
        return JSON.parse(mobileInfo);
    };
    DeviceProcess.prototype.mobileInfoForProcess = function () {
        if (!FileHelper_1.FileHelper.instance().pathExists(Constants.MOBILE_INFO_PATH)) {
            return;
        }
        var info = this.apkInfo();
        return {
            apk_path: this.apkPath(),
            apk_package: info.apk_package,
            apk_launch_activity: info.apk_launch_activity
        };
    };
    DeviceProcess.prototype.handleCucumberResult = function (succeeded) {
        if (!succeeded) {
            process.exit(1);
        }
        if (process.stdout.write('')) {
            process.exit();
        }
        else {
            process.stdout.on('drain', function () {
                process.exit();
            });
        }
    };
    DeviceProcess.directory = function () {
        if (!FileHelper_1.FileHelper.instance().pathExists(Constants.DIRECTORY_PATH)) {
            return [];
        }
        var directoryContent = FileHelper_1.FileHelper.instance().contentOfFile(Constants.DIRECTORY_PATH);
        if (!directoryContent) {
            return [];
        }
        return directoryContent.trim().split('\n');
    };
    DeviceProcess.registeredProcessIds = function () {
        var directory = DeviceProcess.directory();
        return directory.map(function (entry) {
            var entryParts = entry.split(Constants.SEPARATOR);
            return Number(entryParts[0]);
        }).filter(function (id) {
            return id != undefined && id != null && id != NaN;
        });
    };
    DeviceProcess.processesInState = function (state) {
        var filePath = Constants.PROCESS_STATE_FILE_PATH["" + state];
        if (!FileHelper_1.FileHelper.instance().pathExists(filePath)) {
            return [];
        }
        var stateContent = FileHelper_1.FileHelper.instance().contentOfFile(filePath);
        if (!stateContent) {
            return [];
        }
        return stateContent.trim().split('\n').map(function (entry) {
            return Number(entry);
        }).filter(function (id) {
            return id != undefined && id != null && id != NaN;
        });
    };
    DeviceProcess.findProcessWithUserId = function (userId) {
        var directory = this.directory();
        var foundProcess = directory.find(function (entry) {
            var entryParts = entry.split(Constants.SEPARATOR);
            var entryUserId = entryParts[0];
            return entryUserId.trim() == userId;
        });
        if (!foundProcess) {
            return;
        }
        var processParts = foundProcess.split(Constants.SEPARATOR);
        return processParts[1].trim();
    };
    DeviceProcess.prototype.registerProcessToDirectory = function () {
        FileHelper_1.FileHelper.instance().createKrakenSupportFileIfDoesNotExist(Constants.DIRECTORY_PATH);
        FileHelper_1.FileHelper.instance().appendTextToFile("" + this.id + Constants.SEPARATOR + this.device, Constants.DIRECTORY_PATH);
    };
    return DeviceProcess;
}());
exports.DeviceProcess = DeviceProcess;
//# sourceMappingURL=DeviceProcess.js.map