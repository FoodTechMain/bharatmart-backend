"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// This is a compatibility shim for code that still uses Brand instead of Manufacturer
// Re-export the Manufacturer model as Brand for backward compatibility
const Manufacturer_js_1 = __importDefault(require("./Manufacturer.js"));
exports.default = Manufacturer_js_1.default;
//# sourceMappingURL=Brand.js.map