"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROCESS_STATE_FILE_PATH = exports.PROPERTIES_PATH = exports.WEB_DEFAULT_TIMEOUT = exports.D3_DATA_FILE_NAME = exports.FILE_REPORT_NAME = exports.WEB_PORTRAIT = exports.ANDROID_LANDSCAPE = exports.ANDROID_PORTRAIT = exports.DEVICES_REPORT_FILE_NAME = exports.REPORT_PATH = exports.MOBILE_INFO_PATH = exports.DEFAULT_PROCESS_TIMEOUT_SECONDS = exports.DEFAULT_PROCESS_FINISH_TIMEOUT_SECONDS = exports.DEFAULT_PROCESS_START_TIMEOUT_MILLISECONDS = exports.SEPARATOR = exports.DEFAULT_TIMEOUT_MILLISECONDS = exports.INBOX_FILE_NAME = exports.DEVICES_FINISHED_PATH = exports.DEVICES_READY_FINISH_PATH = exports.DEVICES_READY_START_PATH = exports.PROCESS_STATES = exports.DICTIONARY_PATH = exports.DIRECTORY_PATH = exports.KRAKEN_DIRECTORY = void 0;
exports.KRAKEN_DIRECTORY = ".kraken";
exports.DIRECTORY_PATH = process.cwd() + "/" + exports.KRAKEN_DIRECTORY + "/.device_directory";
exports.DICTIONARY_PATH = process.cwd() + "/" + exports.KRAKEN_DIRECTORY + "/dictionary.json";
exports.PROCESS_STATES = {
    ready_to_start: 0,
    ready_to_finish: 1,
    finished: 2
};
exports.DEVICES_READY_START_PATH = process.cwd() + "/" + exports.KRAKEN_DIRECTORY + "/.devices_ready_to_start";
exports.DEVICES_READY_FINISH_PATH = process.cwd() + "/" + exports.KRAKEN_DIRECTORY + "/.devices_ready_to_finish";
exports.DEVICES_FINISHED_PATH = process.cwd() + "/" + exports.KRAKEN_DIRECTORY + "/.devices_finished";
exports.INBOX_FILE_NAME = 'inbox.txt';
exports.DEFAULT_TIMEOUT_MILLISECONDS = 10000;
exports.SEPARATOR = ';';
exports.DEFAULT_PROCESS_START_TIMEOUT_MILLISECONDS = 600000; // 10 minutes
exports.DEFAULT_PROCESS_FINISH_TIMEOUT_SECONDS = 600000; // 10 minutes
exports.DEFAULT_PROCESS_TIMEOUT_SECONDS = 600000; // 10 minutes
exports.MOBILE_INFO_PATH = process.cwd() + "/mobile.json";
exports.REPORT_PATH = process.cwd() + "/reports";
exports.DEVICES_REPORT_FILE_NAME = 'devices.json';
exports.ANDROID_PORTRAIT = 0;
exports.ANDROID_LANDSCAPE = 1;
exports.WEB_PORTRAIT = 0;
exports.FILE_REPORT_NAME = 'report.json';
exports.D3_DATA_FILE_NAME = 'data.json';
exports.WEB_DEFAULT_TIMEOUT = 0.5;
exports.PROPERTIES_PATH = process.cwd() + "/properties.json";
var process_state_file_paths = {};
process_state_file_paths["" + exports.PROCESS_STATES.ready_to_start] = exports.DEVICES_READY_START_PATH;
process_state_file_paths["" + exports.PROCESS_STATES.ready_to_finish] = exports.DEVICES_READY_FINISH_PATH;
process_state_file_paths["" + exports.PROCESS_STATES.finished] = exports.DEVICES_FINISHED_PATH;
exports.PROCESS_STATE_FILE_PATH = process_state_file_paths;
//# sourceMappingURL=Constants.js.map