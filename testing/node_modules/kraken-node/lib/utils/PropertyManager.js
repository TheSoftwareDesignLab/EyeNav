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
exports.PropertyManager = void 0;
var FileHelper_1 = require("./FileHelper");
var Constants = __importStar(require("../utils/Constants"));
var PropertyManager = /** @class */ (function () {
    function PropertyManager() {
    }
    PropertyManager.instance = function () {
        if (!PropertyManager.singletonInstance) {
            PropertyManager.singletonInstance = new PropertyManager();
        }
        return PropertyManager.singletonInstance;
    };
    PropertyManager.stringIsAProperty = function (string) {
        return string.startsWith("<") && string.endsWith(">");
    };
    PropertyManager.prototype.getProperty = function (property) {
        var properties = {};
        properties = this.allUserProperties();
        var foundProperty = properties[property];
        if (foundProperty == null || foundProperty == undefined) {
            throw new Error("ERROR: There is no property " + property + ".");
        }
        return foundProperty;
    };
    PropertyManager.prototype.allUserProperties = function () {
        if (!FileHelper_1.FileHelper.instance().pathExists(Constants.PROPERTIES_PATH)) {
            throw new Error("ERROR: There is no " + Constants.PROPERTIES_PATH + " file.");
        }
        var fileContent = FileHelper_1.FileHelper.instance().contentOfFile(Constants.PROPERTIES_PATH);
        return JSON.parse(fileContent);
    };
    return PropertyManager;
}());
exports.PropertyManager = PropertyManager;
//# sourceMappingURL=PropertyManager.js.map