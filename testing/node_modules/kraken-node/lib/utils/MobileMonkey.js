"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MobileMonkey = void 0;
var faker_1 = __importDefault(require("@faker-js/faker"));
var MobileMonkey = /** @class */ (function () {
    function MobileMonkey(driver) {
        this.driver = driver;
    }
    MobileMonkey.prototype.executeKrakenMonkey = function (numberOfEvents) {
        return __awaiter(this, void 0, void 0, function () {
            var i;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        i = 0;
                        _a.label = 1;
                    case 1:
                        if (!(i < numberOfEvents)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.executeRandomAction()];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    MobileMonkey.prototype.executeRandomAction = function () {
        return __awaiter(this, void 0, void 0, function () {
            var randomActions, randomAction, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        randomActions = [
                            this.randomClick.bind(this), this.insertRandomText.bind(this)
                        ];
                        randomAction = randomActions[Math.floor(Math.random() * randomActions.length)];
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, randomAction()];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        _a = _b.sent();
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    MobileMonkey.prototype.randomClick = function () {
        return __awaiter(this, void 0, void 0, function () {
            var elements, randomElement;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.driver.$$('//*')];
                    case 1:
                        elements = _a.sent();
                        randomElement = elements[Math.floor(Math.random() * elements.length)];
                        return [4 /*yield*/, randomElement.click()];
                    case 2: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    MobileMonkey.prototype.insertRandomText = function () {
        return __awaiter(this, void 0, void 0, function () {
            var inputs, randomInput;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.driver.$$('//android.widget.EditText')];
                    case 1:
                        inputs = _a.sent();
                        randomInput = inputs[Math.floor(Math.random() * inputs.length)];
                        return [4 /*yield*/, randomInput.click()];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.driver.keys(faker_1.default.lorem.paragraph())];
                    case 3: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    return MobileMonkey;
}());
exports.MobileMonkey = MobileMonkey;
//# sourceMappingURL=MobileMonkey.js.map