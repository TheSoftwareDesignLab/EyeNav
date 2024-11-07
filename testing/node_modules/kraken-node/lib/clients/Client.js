"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.Client = void 0;
var SignalingClient_1 = require("./SignalingClient");
var Constants = __importStar(require("../utils/Constants"));
var FileHelper_1 = require("../utils/FileHelper");
var DeviceProcess_1 = require("../processes/DeviceProcess");
var Client = /** @class */ (function (_super) {
    __extends(Client, _super);
    function Client() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Client.prototype.startKrakenForUserId = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var driver;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.start()];
                    case 1:
                        driver = _a.sent();
                        this.notifyReadyToStart(userId);
                        return [4 /*yield*/, this.allDevicesReadyToStart()];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, driver];
                }
            });
        });
    };
    Client.prototype.stopKrakenForUserId = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.notifyReadyToFinish(userId);
                        return [4 /*yield*/, this.allDevicesReadyToFinish()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.stop()];
                    case 2:
                        _a.sent();
                        this.notifyFinished(userId);
                        return [2 /*return*/];
                }
            });
        });
    };
    Client.prototype.notifyReadyToStart = function (userId) {
        this.notifyProcessState(userId, Constants.PROCESS_STATES.ready_to_start);
    };
    Client.prototype.notifyReadyToFinish = function (userId) {
        this.notifyProcessState(userId, Constants.PROCESS_STATES.ready_to_finish);
    };
    Client.prototype.notifyFinished = function (userId) {
        this.notifyProcessState(userId, Constants.PROCESS_STATES.finished);
    };
    Client.prototype.notifyProcessState = function (userId, state) {
        var filePath = Constants.PROCESS_STATE_FILE_PATH["" + state];
        FileHelper_1.FileHelper.instance().createKrakenSupportFileIfDoesNotExist(filePath);
        FileHelper_1.FileHelper.instance().appendTextToFile("" + userId, filePath);
    };
    Client.prototype.allDevicesReadyToStart = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve) { return _this.waitForAllDevicesReadyToStartOrTimeout(Date.now(), resolve); })];
            });
        });
    };
    Client.prototype.waitForAllDevicesReadyToStartOrTimeout = function (startTime, resolve) {
        if (this.allRegisteredDevicesAreReadyToStart()) {
            resolve();
        }
        else if ((Date.now() - startTime) >= Constants.DEFAULT_PROCESS_START_TIMEOUT_MILLISECONDS) {
            throw new Error("ERROR: Timeout, not all devices were ready to start the scenario.");
        }
        else {
            setTimeout(this.waitForAllDevicesReadyToStartOrTimeout.bind(this, startTime, resolve), 1000);
        }
    };
    Client.prototype.allDevicesReadyToFinish = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve) { return _this.waitForAllDevicesReadyToFinishOrTimeout(Date.now(), resolve); })];
            });
        });
    };
    Client.prototype.waitForAllDevicesReadyToFinishOrTimeout = function (startTime, resolve) {
        if (this.allRegisteredDevicesAreReadyToFinish()) {
            resolve();
        }
        else if ((Date.now() - startTime) >= Constants.DEFAULT_PROCESS_FINISH_TIMEOUT_SECONDS) {
            throw new Error("ERROR: Timeout, not all devices were ready to finish the scenario.");
        }
        else {
            setTimeout(this.waitForAllDevicesReadyToFinishOrTimeout.bind(this, startTime, resolve), 1000);
        }
    };
    Client.prototype.allRegisteredDevicesAreReadyToStart = function () {
        var registered_ids = DeviceProcess_1.DeviceProcess.registeredProcessIds();
        var ready_to_start_ids = DeviceProcess_1.DeviceProcess.processesInState(Constants.PROCESS_STATES.ready_to_start);
        return registered_ids.filter(function (registered_id) {
            return !ready_to_start_ids.includes(registered_id);
        }).length <= 0;
    };
    Client.prototype.allRegisteredDevicesAreReadyToFinish = function () {
        var registered_ids = DeviceProcess_1.DeviceProcess.registeredProcessIds();
        var ready_to_finish_ids = DeviceProcess_1.DeviceProcess.processesInState(Constants.PROCESS_STATES.ready_to_finish);
        return registered_ids.filter(function (registered_id) {
            return !ready_to_finish_ids.includes(registered_id);
        }).length <= 0;
    };
    return Client;
}(SignalingClient_1.SignalingClient));
exports.Client = Client;
//# sourceMappingURL=Client.js.map