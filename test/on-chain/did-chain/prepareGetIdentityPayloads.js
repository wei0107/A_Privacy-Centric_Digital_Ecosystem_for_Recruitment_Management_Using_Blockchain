const fs = require('fs');
const path = require('path');

const testAccounts = require('../../../application/scripts/testAccounts');

const OUT = path.join(__dirname, 'getIdentityPayloads.json');

const payloads = testAccounts.slice(0, 100).map((acc) => ({
  address: acc.address,
}));

fs.writeFileSync(OUT, JSON.stringify(payloads, null, 2));
console.log(`Generated ${payloads.length} payloads -> ${OUT}`);