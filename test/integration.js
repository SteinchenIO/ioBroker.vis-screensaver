const path = require('path');
const { tests } = require('@iobroker/testing');

// Startet den Adapter in einer echten ioBroker-Testumgebung
// Siehe https://github.com/ioBroker/testing
tests.integration(path.join(__dirname, '..'));
