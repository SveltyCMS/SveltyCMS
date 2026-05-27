// @file scripts/generate-core-countries.js
// @description
// This script generates a core countries file from the full countries file.
// It is used to reduce the size of the bundle and to ensure that the core countries are always available.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const srcPath = resolve('src/widgets/custom/Address/countries.json');
const destPath = resolve('src/widgets/custom/Address/countries-core.json');

const data = JSON.parse(readFileSync(srcPath, 'utf8'));

const core = data.map((c) => ({
	alpha2: c.alpha2,
	en: c.en,
	de: c.de
}));

writeFileSync(destPath, JSON.stringify(core, null, 2));
console.log(`Generated ${destPath} with ${core.length} entries.`);
