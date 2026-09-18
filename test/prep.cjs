// The repo is "type": "module"; the test build is compiled to CommonJS, so
// scope test/.build back to CJS or node refuses the requires.
const fs = require("fs");
const path = require("path");
fs.writeFileSync(path.join(__dirname, ".build", "package.json"), '{"type":"commonjs"}\n');
