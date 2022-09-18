// homebridge-ups/index.js
// Copyright © 2022 Erik Baauw. All rights reserved.
//
// Homebridge plugin for deCONZ.

'use strict'

const UpsPlatform = require('./lib/UpsPlatform')
const packageJson = require('./package.json')

module.exports = function (homebridge) {
  UpsPlatform.loadPlatform(homebridge, packageJson, 'UPS', UpsPlatform)
}
