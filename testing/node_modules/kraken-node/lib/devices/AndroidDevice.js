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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AndroidDevice = void 0;
var ADB_1 = require("../utils/ADB");
var Device_1 = require("./Device");
var Constants = __importStar(require("../utils/Constants"));
var AndroidDevice = /** @class */ (function (_super) {
    __extends(AndroidDevice, _super);
    function AndroidDevice(id, model) {
        return _super.call(this, id, model) || this;
    }
    AndroidDevice.prototype.screenSize = function () {
        var orientation = this.orientation();
        var size = ADB_1.ADB.instance().deviceScreenSize(this.id);
        var height = orientation == Constants.ANDROID_PORTRAIT ? size[1] : size[0];
        var width = orientation == Constants.ANDROID_PORTRAIT ? size[0] : size[1];
        return {
            height: height, width: width
        };
    };
    AndroidDevice.prototype.sdkVersion = function () {
        return Number(ADB_1.ADB.instance().deviceSdkVersion(this.id));
    };
    AndroidDevice.prototype.orientation = function () {
        var adbOrientation = ADB_1.ADB.instance().deviceOrientation(this.id);
        return Number(adbOrientation.trim());
    };
    return AndroidDevice;
}(Device_1.Device));
exports.AndroidDevice = AndroidDevice;
//# sourceMappingURL=AndroidDevice.js.map