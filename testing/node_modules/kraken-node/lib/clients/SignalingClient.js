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
exports.SignalingClient = void 0;
var FileHelper_1 = require("../utils/FileHelper");
var Device_1 = require("../devices/Device");
var Constants = __importStar(require("../utils/Constants"));
var SignalingClient = /** @class */ (function () {
    function SignalingClient(id) {
        this.id = id || Device_1.Device.generateRandomId();
    }
    SignalingClient.prototype.readSignal = function (signal, timeout) {
        if (timeout === void 0) { timeout = Constants.DEFAULT_TIMEOUT_MILLISECONDS; }
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve) { return _this.waitForSignalOrTimeout(signal, timeout, Date.now(), resolve); })];
            });
        });
    };
    SignalingClient.prototype.waitForSignalOrTimeout = function (signal, timeout, startTime, resolve) {
        if (signal === this.inboxLastSignal()) {
            resolve(signal);
        }
        else if ((Date.now() - startTime) >= timeout) {
            throw new Error("ERROR: Signal timeout, did not receive signal: " + signal);
        }
        else {
            setTimeout(this.waitForSignalOrTimeout.bind(this, signal, timeout, startTime, resolve), 1000);
        }
    };
    SignalingClient.prototype.writeSignal = function (receiverInboxId, signal) {
        FileHelper_1.FileHelper.instance().appendTextToFile(signal, this.inboxFilePathForId(receiverInboxId));
    };
    SignalingClient.prototype.createInbox = function () {
        FileHelper_1.FileHelper.instance().createKrakenSupportFileIfDoesNotExist(this.currentInboxFilePath());
    };
    SignalingClient.prototype.resetInbox = function () {
        this.deleteInbox();
        this.createInbox();
    };
    SignalingClient.prototype.deleteInbox = function () {
        FileHelper_1.FileHelper.instance().deleteFileInPathIfExists(this.currentInboxFilePath());
    };
    SignalingClient.prototype.inboxLastSignal = function () {
        try {
            var contentsOfInbox = FileHelper_1.FileHelper.instance().contentOfFile(this.currentInboxFilePath()).trim().split('\n');
            return contentsOfInbox[contentsOfInbox.length - 1];
        }
        catch (err) {
            return null;
        }
    };
    SignalingClient.prototype.currentInboxFilePath = function () {
        return this.inboxFilePathForId(this.id);
    };
    SignalingClient.prototype.inboxFilePathForId = function (id) {
        return process.cwd() + "/" + Constants.KRAKEN_DIRECTORY + "/." + id + "_" + Constants.INBOX_FILE_NAME;
    };
    return SignalingClient;
}());
exports.SignalingClient = SignalingClient;
//# sourceMappingURL=SignalingClient.js.map