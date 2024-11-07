"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureFile = void 0;
var FeatureScenario_1 = require("./FeatureScenario");
var fs = require("fs");
var Gherkin = require("@cucumber/gherkin");
var Messages = require("@cucumber/messages");
var FeatureFile = /** @class */ (function () {
    function FeatureFile(filePath) {
        this.filePath = filePath;
        this.scenarios = [];
        this.readContent();
    }
    FeatureFile.prototype.readContent = function () {
        var _this = this;
        var content = this.gherkinDocument();
        var feature = content.feature;
        feature.children.forEach(function (featureChild) {
            _this.scenarios.push(new FeatureScenario_1.FeatureScenario(featureChild.scenario.name, featureChild.scenario.tags.map(function (tag) { return (tag.name); })));
        });
    };
    FeatureFile.prototype.requiredDevicesInfo = function () {
        var userTags = this.uniqueUserTags();
        var systemTags = this.systemTags();
        return userTags.map(function (userTag) {
            return {
                userId: userTag.split('@user').join(''),
                systemType: systemTags.shift() || '@mobile'
            };
        });
    };
    FeatureFile.prototype.numberOfRequiredMobileDevices = function () {
        var tags = this.systemTags();
        return tags.filter(function (tag) {
            return tag === '@mobile';
        }).length;
    };
    FeatureFile.prototype.numberOfRequiredWebDevices = function () {
        var tags = this.systemTags();
        return tags.filter(function (tag) {
            return tag === '@web';
        }).length;
    };
    FeatureFile.prototype.numberOfRequiredDevices = function () {
        return this.uniqueUserTags().length;
    };
    FeatureFile.prototype.hasRightSyntax = function () {
        return this.allScenariosHaveAUserTag() && !this.hasDuplicateTagsForAUser();
    };
    FeatureFile.prototype.hasDuplicateTagsForAUser = function () {
        var tags = this.allUserTags();
        for (var i = 0; i < tags.length; i++) {
            for (var j = i + 1; j < tags.length; j++) {
                if (i === j) {
                    continue;
                }
                if (tags[i] === tags[j]) {
                    return true;
                }
            }
        }
        return false;
    };
    FeatureFile.prototype.allScenariosHaveAUserTag = function () {
        var emptyUserTagScenarios = this.scenarios.filter(function (scenario) {
            var userTags = scenario.tags.filter(function (tag) {
                return tag.startsWith('@user');
            });
            return userTags.length === 0;
        });
        return emptyUserTagScenarios.length === 0;
    };
    FeatureFile.prototype.allTags = function () {
        var allScenariosTags = this.scenarios.map(function (scenario) { return (scenario.tags); });
        return [].concat.apply([], allScenariosTags);
    };
    FeatureFile.prototype.allUserTags = function () {
        var allTags = this.allTags();
        return allTags.filter(function (tag) {
            return tag.startsWith('@user');
        });
    };
    FeatureFile.prototype.uniqueUserTags = function () {
        var allTags = this.allTags();
        var uniqueTags = allTags.filter(function (tag, index, self) {
            return self.indexOf(tag) === index;
        });
        return uniqueTags.filter(function (tag) {
            return tag.startsWith('@user');
        });
    };
    FeatureFile.prototype.systemTags = function () {
        return this.scenarios.map(function (scenario) {
            var tags = scenario.tags;
            var systemTag = tags.find(function (tag) {
                return tag.startsWith('@mobile') || tag.startsWith('@web');
            });
            return systemTag || '@mobile';
        });
    };
    FeatureFile.prototype.gherkinDocument = function () {
        var uuidFn = Messages.IdGenerator.uuid();
        var builder = new Gherkin.AstBuilder(uuidFn);
        var matcher = new Gherkin.TokenMatcher();
        var parser = new Gherkin.Parser(builder, matcher);
        var content = fs.readFileSync(this.filePath, 'utf8');
        return parser.parse(content);
    };
    return FeatureFile;
}());
exports.FeatureFile = FeatureFile;
//# sourceMappingURL=FeatureFile.js.map