// Compatibility shim: re-export the Manufacturer model so legacy
// requires of models/Brand.js continue to work while the canonical
// model is Manufacturer. This avoids breaking existing code while
// the codebase migrates to using Manufacturer everywhere.

try {
  const Manufacturer = require('./Manufacturer');
  module.exports = Manufacturer;
} catch (err) {
  // If Manufacturer is missing for any reason, export a minimal stub
  // to prevent require-time crashes. Consumers should move to the
  // Manufacturer model.
  module.exports = null;
}