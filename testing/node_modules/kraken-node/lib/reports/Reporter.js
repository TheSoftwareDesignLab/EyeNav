"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.Reporter = void 0;
var Constants = __importStar(require("../utils/Constants"));
var FileHelper_1 = require("../utils/FileHelper");
var ejs_1 = __importDefault(require("ejs"));
var AndroidProcess_1 = require("../processes/AndroidProcess");
var WebProcess_1 = require("../processes/WebProcess");
var createHash = require('crypto').createHash;
var Reporter = /** @class */ (function () {
    function Reporter(testScenario) {
        this.PASSED = 'passed';
        this.FAILED = 'failed';
        this.SKIPPED = 'skipped';
        this.PENDING = 'pending';
        this.NOT_DEFINED = 'undefined';
        this.AMBIGUOUS = 'ambiguous';
        this.testScenario = testScenario;
    }
    Reporter.prototype.createReportFolderRequirements = function () {
        this.createReportExecutionReportFolder();
        this.createDevicesExecutionReportFolder();
        this.saveExecutionDevicesList();
    };
    Reporter.prototype.saveReport = function () {
        this.generateEachDeviceReport();
        this.generateGeneralReport();
    };
    Reporter.prototype.createReportExecutionReportFolder = function () {
        FileHelper_1.FileHelper.instance().createFolderIfDoesNotExist(Constants.REPORT_PATH);
        FileHelper_1.FileHelper.instance().createFolderIfDoesNotExist(Constants.REPORT_PATH + "/" + this.testScenario.executionId);
        FileHelper_1.FileHelper.instance().createFolderIfDoesNotExist(this.screenshotPath());
        FileHelper_1.FileHelper.instance().copyFolderToPath(__dirname + "/../../reporter/assets", Constants.REPORT_PATH + "/" + this.testScenario.executionId + "/assets");
    };
    Reporter.prototype.createDevicesExecutionReportFolder = function () {
        var _this = this;
        this.testScenario.devices.forEach(function (device) {
            if (!device) {
                return;
            }
            FileHelper_1.FileHelper.instance().createFolderIfDoesNotExist(Constants.REPORT_PATH + "/" + _this.testScenario.executionId + "/" + device.id);
        });
    };
    Reporter.prototype.saveExecutionDevicesList = function () {
        var devicesPath = Constants.REPORT_PATH + "/" + this.testScenario.executionId + "/" + Constants.DEVICES_REPORT_FILE_NAME;
        FileHelper_1.FileHelper.instance().createFileIfDoesNotExist(devicesPath);
        FileHelper_1.FileHelper.instance().appendTextToFile(JSON.stringify(this.devicesHash()), devicesPath);
    };
    Reporter.prototype.screenshotPath = function () {
        return Constants.REPORT_PATH + "/" + this.testScenario.executionId + "/screenshots/";
    };
    Reporter.prototype.devicesHash = function () {
        return this.testScenario.devices.filter(function (device) {
            return device != null || device != undefined;
        }).map(function (device, index) {
            var screenSize = device.screenSize();
            return {
                user: (index + 1), id: device.id,
                model: device.model, screen_height: screenSize.height,
                screen_width: screenSize.width, sdk: device.sdkVersion(),
                type: device.constructor.name
            };
        });
    };
    Reporter.prototype.generateFeaturesReport = function (features, device) {
        var _this = this;
        features.forEach(function (feature) {
            _this.generateFeatureReport(feature, device);
        });
    };
    Reporter.prototype.generateFeatureReport = function (feature, device) {
        var data = {
            feature: feature,
            featurePassedScenariosPercentage: this.featurePassedScenariosPercentage.bind(this),
            featureFailedScenariosPercentage: this.featureFailedScenariosPercentage.bind(this),
            passedScenarios: this.passedScenarios.bind(this),
            failedScenarios: this.failedScenarios.bind(this),
            feature_duration: this.durationForFeature.bind(this),
            format_duration: this.formatDurationOfFeature.bind(this),
            PASSED: this.PASSED
        };
        var template = FileHelper_1.FileHelper.instance().contentOfFile(__dirname + "/../../reporter/scenario_report.html.ejs");
        var html = ejs_1.default.render(template, data);
        var folderName = Constants.REPORT_PATH + "/" + this.testScenario.executionId + "/" + device.id + "/features_report/";
        var fileName = "" + folderName + this.featureId(feature) + ".html";
        FileHelper_1.FileHelper.instance().createFolderIfDoesNotExist(folderName);
        FileHelper_1.FileHelper.instance().createFileIfDoesNotExist(fileName);
        FileHelper_1.FileHelper.instance().createFileIfDoesNotExist(fileName);
        FileHelper_1.FileHelper.instance().appendTextToFile(html, fileName);
    };
    Reporter.prototype.featureId = function (feature) {
        return createHash('sha256').update("" + feature.id.trim() + feature.uri.trim()).digest('hex');
    };
    Reporter.prototype.generateEachDeviceReport = function () {
        var _this = this;
        this.testScenario.processes.forEach(function (process, index) {
            if (!process || !process.device) {
                return;
            }
            _this.generateProcessReport(process, index + 1);
        });
    };
    Reporter.prototype.generateProcessReport = function (process, userId) {
        if (process instanceof AndroidProcess_1.AndroidProcess) {
            this.generateMobileReport(process, userId);
        }
        else if (process instanceof WebProcess_1.WebProcess) {
            this.generateWebReport(process, userId);
        }
        else {
            throw new Error('ERROR: Platform not supported');
        }
    };
    Reporter.prototype.generateMobileReport = function (process, userId) {
        var data = {
            apk_path: process.apkPath()
        };
        this.generateDeviceReport(data, process.device, userId);
    };
    Reporter.prototype.generateWebReport = function (process, userId) {
        var data = {};
        this.generateDeviceReport(data, process.device, userId);
    };
    Reporter.prototype.generateDeviceReport = function (baseData, device, userId) {
        var cucumberFile = Constants.REPORT_PATH + "/" + this.testScenario.executionId + "/" + device.id + "/" + Constants.FILE_REPORT_NAME;
        var features = JSON.parse(FileHelper_1.FileHelper.instance().contentOfFile(cucumberFile));
        var data = __assign({ apk_path: null, features: features, total_scenarios: this.totalScenariosForFeatures(features), device: device, total_failed_scenarios_percentage: this.totalFailedScenariosPercentageForFeatures(features), total_passed_scenarios_percentage: this.totalPassedScenariosPercentageForFeatures(features), total_passed_features_percentage: this.totalPassedFeaturesPercentageForFeatures(features), total_failed_features_percentage: this.totalFailedFeaturesPercentageForFeatures(features), total_passed_features: this.totalPassedFeaturesForFeatures(features), total_failed_features: this.totalFailedFeaturesForFeatures(features), total_passed_scenarios: this.totalPassedScenariosForFeatures(features), total_failed_scenarios: this.totalFailedScenariosForFeatures(features), feature_passed: this.featurePassed.bind(this), passed_scenarios: this.passedScenariosForFeature.bind(this), failed_scenarios: this.failedScenariosForFeature.bind(this), feature_duration: this.durationForFeature.bind(this), format_duration: this.formatDurationOfFeature.bind(this), featureId: this.featureId.bind(this) }, baseData);
        var template = FileHelper_1.FileHelper.instance().contentOfFile(__dirname + "/../../reporter/feature_report.html.ejs");
        var html = ejs_1.default.render(template, data);
        var reportFilePath = Constants.REPORT_PATH + "/" + this.testScenario.executionId + "/" + device.id + "/feature_report.html";
        FileHelper_1.FileHelper.instance().createFileIfDoesNotExist(reportFilePath);
        FileHelper_1.FileHelper.instance().appendTextToFile(html, reportFilePath);
        this.generateFeaturesReport(features, device);
    };
    Reporter.prototype.generateGeneralReport = function () {
        var devicesReport = this.reportByDevices();
        var featuresReport = this.feturesFromReportByDevices(devicesReport);
        var dataHash = this.featureByNodesAndLinks(featuresReport);
        var dataPath = Constants.REPORT_PATH + "/" + this.testScenario.executionId + "/assets/js/" + Constants.D3_DATA_FILE_NAME;
        FileHelper_1.FileHelper.instance().createFileIfDoesNotExist(dataPath);
        FileHelper_1.FileHelper.instance().appendTextToFile(JSON.stringify(dataHash), dataPath);
        var data = {
            devices: this.devicesHash(),
            featuresReport: featuresReport
        };
        var template = FileHelper_1.FileHelper.instance().contentOfFile(__dirname + "/../../reporter/index.html.ejs");
        var html = ejs_1.default.render(template, data);
        var reportFilePath = Constants.REPORT_PATH + "/" + this.testScenario.executionId + "/index.html";
        FileHelper_1.FileHelper.instance().createFileIfDoesNotExist(reportFilePath);
        FileHelper_1.FileHelper.instance().appendTextToFile(html, reportFilePath);
    };
    Reporter.prototype.reportByDevices = function () {
        var _this = this;
        var devicesReport = {};
        this.devicesHash().forEach(function (device) {
            var deviceReportFilePath = Constants.REPORT_PATH + "/" + _this.testScenario.executionId + "/" + device.id + "/" + Constants.FILE_REPORT_NAME;
            if (!FileHelper_1.FileHelper.instance().pathExists(deviceReportFilePath)) {
                return;
            }
            var fileContent = FileHelper_1.FileHelper.instance().contentOfFile(deviceReportFilePath);
            devicesReport[device.user] = JSON.parse(fileContent);
            devicesReport[device.user].forEach(function (entry) {
                if (entry.device_model == null || entry.device_model == undefined) {
                    entry.device_model = device.model;
                }
                if (entry.device_id == null || entry.device_id == undefined) {
                    entry.device_id = device.id;
                }
            });
        });
        return devicesReport;
    };
    Reporter.prototype.feturesFromReportByDevices = function (reportByDevices) {
        var _this = this;
        var features = {};
        Object.keys(reportByDevices).forEach(function (key) {
            var report = reportByDevices[key];
            report.forEach(function (feature) {
                if (features[feature.id] == null || features[feature.id] == undefined) {
                    features[feature.id] = {};
                }
                if ((features[feature.id].name == null || features[feature.id].name == undefined) && feature.name) {
                    features[feature.id].name = feature.name;
                }
                if (features[feature.id].devices == null || features[feature.id].devices == undefined) {
                    features[feature.id].devices = {};
                }
                if (feature.elements && feature.elements.length > 0) {
                    features[feature.id].devices[key] = [];
                    if (feature.elements[0].steps != null || feature.elements[0].steps != undefined) {
                        var failed_1 = false;
                        feature.elements[0].steps.forEach(function (step) {
                            if (failed_1) {
                                return;
                            }
                            failed_1 = step.result.status != _this.PASSED;
                            var image = null;
                            if (step.embeddings != null && step.embeddings != undefined && step.embeddings.length > 0) {
                                image = step.embeddings[0].data;
                            }
                            features[feature.id].devices[key].push({
                                name: step.keyword + " " + (step.name || ''),
                                duration: step.result.duration,
                                image: image,
                                device_model: feature.device_model,
                                status: failed_1 ? _this.FAILED : _this.PASSED
                            });
                        });
                    }
                }
            });
        });
        return features;
    };
    Reporter.prototype.featureByNodesAndLinks = function (reportByDevices) {
        var _this = this;
        var features = [];
        Object.keys(reportByDevices).forEach(function (key) {
            var feature = reportByDevices[key];
            if (feature.devices != null && feature.devices != undefined) {
                features.push(_this.nodesAndLinks(feature.devices, feature.name));
            }
        });
        return features;
    };
    Reporter.prototype.nodesAndLinks = function (featureReport, featureName) {
        var _this = this;
        var lastNodeId = 0;
        var nodes = [{ name: "", id: "empty", image: null }];
        var signalHash = {};
        var links = [];
        Object.keys(featureReport).forEach(function (key) {
            var steps = featureReport[key];
            var comingFromSignal = false;
            var lastSignal = -1;
            steps.forEach(function (step, index) {
                var nodeId = lastNodeId + 1;
                if (_this.isReadSignal(step.name) && step.status == _this.PASSED) {
                    var signal_1 = _this.signalContent(step.name);
                    var alreadyCreatedSignal = signalHash[signal_1] ? true : false;
                    signalHash[signal_1] = alreadyCreatedSignal ? signalHash[signal_1] : { id: "" + nodeId, receiver: key };
                    var node = {
                        name: "Signal: " + signal_1 + ", Receiver: " + step.device_model,
                        id: signalHash[signal_1].id, image: null, status: step.status
                    };
                    if (alreadyCreatedSignal) {
                        var entry = nodes.filter(function (node) {
                            return node.id == signalHash[signal_1].id;
                        })[0];
                        if (entry != null || entry != undefined) {
                            entry.name = "Signal: " + signal_1 + ", Receiver: " + step.device_model;
                        }
                    }
                    var source = (comingFromSignal ? lastSignal : (index == 0 ? 0 : lastNodeId));
                    var link = {
                        source: source,
                        target: parseInt(signalHash[signal_1].id),
                        value: 1,
                        owner: key,
                        owner_model: step.device_model
                    };
                    if (!alreadyCreatedSignal) {
                        nodes.push(node);
                        lastNodeId += 1;
                    }
                    links.push(link);
                    lastSignal = parseInt(signalHash[signal_1].id);
                    comingFromSignal = true;
                }
                else if (_this.isWriteSignal(step.name) && step.status == _this.PASSED) {
                    var signal = _this.signalContent(step.name);
                    var receiver = _this.signalReceiver(step.name);
                    var alreadyCreatedSignal = signalHash[signal] ? true : false;
                    signalHash[signal] = alreadyCreatedSignal ? signalHash[signal] : { id: "" + nodeId, receiver: receiver };
                    var node = {
                        name: step.name, id: signalHash[signal].id,
                        image: null, status: step.status
                    };
                    var source = (comingFromSignal ? lastSignal : (index == 0 ? 0 : lastNodeId));
                    var link = {
                        source: source,
                        target: parseInt(signalHash[signal].id),
                        value: 1,
                        owner: key,
                        owner_model: step.device_model
                    };
                    if (!alreadyCreatedSignal) {
                        nodes.push(node);
                        lastNodeId += 1;
                    }
                    links.push(link);
                    lastSignal = parseInt(signalHash[signal].id);
                    comingFromSignal = true;
                }
                else {
                    var node = {
                        name: step.name,
                        id: "" + nodeId,
                        image: step.image, status: step.status
                    };
                    var source = (comingFromSignal ? lastSignal : (index == 0 ? 0 : lastNodeId));
                    var link = {
                        source: source,
                        target: nodeId,
                        value: 1,
                        owner: key,
                        owner_model: step.device_model
                    };
                    nodes.push(node);
                    links.push(link);
                    lastNodeId += 1;
                    comingFromSignal = false;
                }
            });
        });
        return {
            name: featureName,
            nodes: nodes,
            links: links
        };
    };
    Reporter.prototype.isReadSignal = function (step) {
        return step.toLowerCase().indexOf("i send a signal to user") != -1;
    };
    Reporter.prototype.isWriteSignal = function (step) {
        return step.toLowerCase().indexOf("i wait for a signal containing") != -1;
    };
    Reporter.prototype.signalContent = function (step) {
        var found = step.match(/"([^\"]*)"/);
        if (found && found.length > 0) {
            return found[0].trim();
        }
        return null;
    };
    Reporter.prototype.signalReceiver = function (step) {
        var found = step.match(/(\d+)/);
        if (found && found.length > 0) {
            return found[0].trim();
        }
        return null;
    };
    Reporter.prototype.totalScenariosForFeatures = function (features) {
        var count = 0;
        features.forEach(function (feature) {
            var scenarios = feature.elements;
            if (scenarios) {
                count += scenarios.length;
            }
        });
        return count;
    };
    Reporter.prototype.featurePassedScenariosPercentage = function (feature) {
        return Math.round((this.passedScenarios(feature).length / feature.elements.length)) * 100.00;
    };
    Reporter.prototype.featureFailedScenariosPercentage = function (feature) {
        return Math.round((this.failedScenarios(feature).length / feature.elements.length)) * 100.00;
    };
    Reporter.prototype.totalPassedScenariosPercentageForFeatures = function (features) {
        return parseFloat((this.totalPassedScenariosForFeatures(features) / this.totalScenariosForFeatures(features)).toFixed(2)) * 100.00;
    };
    Reporter.prototype.totalFailedScenariosPercentageForFeatures = function (features) {
        return parseFloat((this.totalFailedScenariosForFeatures(features) / this.totalScenariosForFeatures(features)).toFixed(2)) * 100.00;
    };
    Reporter.prototype.totalPassedFeaturesPercentageForFeatures = function (features) {
        return parseFloat((this.totalPassedFeaturesForFeatures(features) / features.length).toFixed(2)) * 100.00;
    };
    Reporter.prototype.totalFailedFeaturesPercentageForFeatures = function (features) {
        return parseFloat((this.totalFailedFeaturesForFeatures(features) / features.length).toFixed(2)) * 100.00;
    };
    Reporter.prototype.totalPassedScenariosForFeatures = function (features) {
        var _this = this;
        var count = 0;
        features.forEach(function (feature) {
            count += _this.passedScenariosForFeature(feature).length;
        });
        return count;
    };
    Reporter.prototype.totalFailedScenariosForFeatures = function (features) {
        var _this = this;
        var count = 0;
        features.forEach(function (feature) {
            count += _this.failedScenariosForFeature(feature).length;
        });
        return count;
    };
    Reporter.prototype.totalPassedFeaturesForFeatures = function (features) {
        var _this = this;
        var count = 0;
        features.forEach(function (feature) {
            if (_this.featurePassed(feature)) {
                count += 1;
            }
        });
        return count;
    };
    Reporter.prototype.totalFailedFeaturesForFeatures = function (features) {
        var _this = this;
        var count = 0;
        features.forEach(function (feature) {
            if (!_this.featurePassed(feature)) {
                count += 1;
            }
        });
        return count;
    };
    Reporter.prototype.featurePassed = function (feature) {
        return this.passedScenariosForFeature(feature).length == feature.elements.length;
    };
    Reporter.prototype.passedScenariosForFeature = function (feature) {
        var scenarios = feature.elements;
        return scenarios.filter(function (scenario) {
            var steps = scenario.steps;
            var allPassed = true;
            steps.forEach(function (step) {
                if (step.result && step.result.status != 'passed') {
                    allPassed = false;
                }
            });
            return allPassed;
        });
    };
    Reporter.prototype.failedScenariosForFeature = function (feature) {
        var scenarios = feature.elements;
        return scenarios.filter(function (scenario) {
            var steps = scenario.steps;
            var allPassed = true;
            steps.forEach(function (step) {
                if (step.result && step.result.status != 'passed') {
                    allPassed = false;
                }
            });
            return !allPassed;
        });
    };
    Reporter.prototype.passedScenarios = function (feature) {
        var _this = this;
        var scenarios = feature.elements;
        return scenarios.filter(function (scenario) {
            var allPassed = true;
            var steps = scenario.steps;
            steps.forEach(function (step) {
                if (step.result && step.result.status != _this.PASSED) {
                    allPassed = false;
                }
            });
            return allPassed;
        });
    };
    Reporter.prototype.failedScenarios = function (feature) {
        var _this = this;
        var scenarios = feature.elements;
        return scenarios.filter(function (scenario) {
            var allFailed = true;
            var steps = scenario.steps;
            steps.forEach(function (step) {
                if (step.result && step.result.status == _this.PASSED) {
                    allFailed = false;
                }
            });
            return allFailed;
        });
    };
    Reporter.prototype.durationForFeature = function (feature) {
        var _this = this;
        var scenarios = feature.elements;
        var duration = 0;
        scenarios.forEach(function (scenario) {
            duration += _this.durationForScenario(scenario);
        });
        return duration;
    };
    Reporter.prototype.durationForScenario = function (scenario) {
        var duration = 0;
        scenario.steps.forEach(function (step) {
            if (step.result && step.result.duration) {
                duration += step.result.duration;
            }
        });
        return duration;
    };
    Reporter.prototype.formatDurationOfFeature = function (nanoseconds) {
        var durationInSeconds = nanoseconds / 1000000000.0;
        var mod = durationInSeconds % 60;
        var div = Number(durationInSeconds / 60);
        return div.toFixed(0) + "m " + mod.toFixed(3) + "s";
    };
    return Reporter;
}());
exports.Reporter = Reporter;
//# sourceMappingURL=Reporter.js.map