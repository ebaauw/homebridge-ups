// homebridge-ups/index.js
// Copyright © 2022-2025 Erik Baauw. All rights reserved.
//
// Homebridge plugin for UPS.

import { createRequire } from 'node:module'

import { UpsPlatform } from './lib/UpsPlatform.js'

const require = createRequire(import.meta.url)
const packageJson = require('./package.json')

function main (homebridge) {
  UpsPlatform.loadPlatform(homebridge, packageJson, 'UPS', UpsPlatform)
}

export { main as default }
