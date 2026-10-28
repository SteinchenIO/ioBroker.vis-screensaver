const path = require('path');
const { tests } = require('@iobroker/testing');

// Prüft package.json und io-package.json auf Vollständigkeit und Übereinstimmung
tests.packageFiles(path.join(__dirname, '..'));
