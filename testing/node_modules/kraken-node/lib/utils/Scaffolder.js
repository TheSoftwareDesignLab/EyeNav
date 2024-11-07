"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Scaffolder = void 0;
var FileHelper_1 = require("./FileHelper");
var Scaffolder = /** @class */ (function () {
    function Scaffolder() {
    }
    Scaffolder.prototype.copyFeaturesStructureToCurrentDirectory = function () {
        if (FileHelper_1.FileHelper.instance().pathExists(process.cwd() + "/features")) {
            throw new Error('ERROR: Features directory already exists');
        }
        FileHelper_1.FileHelper.instance().copyFolderToPath(__dirname + "/../../features-skeleton", process.cwd() + "/");
    };
    return Scaffolder;
}());
exports.Scaffolder = Scaffolder;
//# sourceMappingURL=Scaffolder.js.map