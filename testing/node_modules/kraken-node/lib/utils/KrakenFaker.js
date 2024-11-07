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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KrakenFaker = void 0;
var faker_1 = __importDefault(require("@faker-js/faker"));
var Constants = __importStar(require("../utils/Constants"));
var FileHelper_1 = require("./FileHelper");
var KrakenFaker = /** @class */ (function () {
    function KrakenFaker() {
    }
    KrakenFaker.instance = function () {
        if (!KrakenFaker.singletonInstance) {
            KrakenFaker.singletonInstance = new KrakenFaker();
        }
        return KrakenFaker.singletonInstance;
    };
    KrakenFaker.prototype.generateValueForKey = function (key) {
        var value = '';
        if (key.startsWith('$name')) {
            value = this.generateName();
        }
        else if (key.startsWith('$number')) {
            value = this.generateNumber();
        }
        else if (key.startsWith('$email')) {
            value = this.generateEmail();
        }
        else if (key.startsWith('$string')) {
            value = this.generateString();
        }
        else if (key.startsWith('$date')) {
            value = this.generateDate();
        }
        else if (key.startsWith('$url')) {
            value = this.generateUrl();
        }
        else {
            throw new Error("ERROR: Faker key not supported.");
        }
        this.saveKeyValueInDictionary(key, value);
        return value;
    };
    KrakenFaker.prototype.reuseValueForKey = function (key) {
        var dictionary = this.dictionaryJson();
        var value = dictionary[key.substring(1)];
        if (value == null || value == undefined) {
            throw new Error("ERROR: Key does not exist.");
        }
        return value;
    };
    KrakenFaker.prototype.dictionaryJson = function () {
        FileHelper_1.FileHelper.instance().createFileIfDoesNotExist(Constants.DICTIONARY_PATH);
        var fileContent = FileHelper_1.FileHelper.instance().contentOfFile(Constants.DICTIONARY_PATH) || '{}';
        return JSON.parse(fileContent);
    };
    KrakenFaker.prototype.saveKeyValueInDictionary = function (key, value) {
        var dictionary = this.dictionaryJson();
        dictionary[key] = value;
        FileHelper_1.FileHelper.instance().writeTextToFile(JSON.stringify(dictionary), Constants.DICTIONARY_PATH);
    };
    KrakenFaker.prototype.generateName = function () {
        return faker_1.default.name.firstName();
    };
    KrakenFaker.prototype.generateNumber = function () {
        return "" + faker_1.default.datatype.number();
    };
    KrakenFaker.prototype.generateEmail = function () {
        return faker_1.default.internet.email();
    };
    KrakenFaker.prototype.generateString = function () {
        return faker_1.default.datatype.string();
    };
    KrakenFaker.prototype.generateDate = function () {
        return faker_1.default.datatype.datetime({}).toDateString();
    };
    KrakenFaker.prototype.generateUrl = function () {
        return faker_1.default.internet.url();
    };
    KrakenFaker.stringIsAFaker = function (string) {
        return string.startsWith("$");
    };
    KrakenFaker.stringIsAFakerReuse = function (string) {
        return string.startsWith("$$");
    };
    return KrakenFaker;
}());
exports.KrakenFaker = KrakenFaker;
//# sourceMappingURL=KrakenFaker.js.map