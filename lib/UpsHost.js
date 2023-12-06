// homebridge-ups/lib/UpsHost.js
// Copyright © 2022-2023 Erik Baauw. All rights reserved.
//
// Homebridge plugin for UPS.

'use strict'

const homebridgeLib = require('homebridge-lib')
const UpsAccessory = require('./UpsAccessory')
const UpsClient = require('./UpsClient')

class UpsHost extends homebridgeLib.Delegate {
  constructor (platform, host) {
    super(platform, host.name)
    this.name = host.name
    this.upsAccessories = {}
    this.client = new UpsClient(host)
    this.client
      .on('connect', (host) => { this.debug('connected to %s', host) })
      .on('disconnect', (host) => {
        this.debug('disconnected from %s', host)
        for (const id in this.upsAccessories) {
          this.upsAccessories[id].setFault()
        }
      })
      .on('error', (error) => { this.warn(error) })
      .on('request', (request) => {
        this.debug(
          '%s: request %d: %s', request.name, request.id, request.command
        )
      })
      .on('response', (response) => {
        this.vdebug(
          '%s: request %d: response: %s',
          response.request.name, response.request.id, response.body
        )
        this.debug(
          '%s: request %d: OK', response.request.name, response.request.id
        )
      })
  }

  async init () {
    try {
      await this.client.connect()
      const version = await this.client.version()
      const apiVersion = await this.client.apiVersion()
      this.log('%s, API v%s', version, apiVersion)
      if (apiVersion !== this.platform.packageJson.engines.upsd) {
        this.warn(
          'recommended version: API v%s', this.platform.packageJson.engines.upsd
        )
      }
      const devices = await this.client.devices()
      this.debug('devices: %j', Object.keys(devices))
      for (const deviceId in devices) {
        const device = devices[deviceId]
        const constants = await device.constants()
        if (constants['device.type'] !== 'ups') {
          continue
        }
        const description = await device.description()
        const id = constants['device.serial'] == null || constants['device.serial'] === ''
          ? deviceId
          : constants['device.serial'].toUpperCase()
        if (this.upsAccessories[id] == null) {
          this.upsAccessories[id] = new UpsAccessory(this.platform, {
            name: description == null || description === '' || description === 'Unavailable'
              ? this.client.name
              : description,
            id,
            manufacturer: constants['device.mfr'],
            model: constants['device.model'],
            firmware: constants['ups.firmware'] == null || constants['ups.firmware'] === ''
              ? this.platform.packageJson.version
              : constants['ups.firmware'],
            device,
            constants
          })  
        }
        const logLevel = this.upsAccessories[id].logLevel;
      }
      this.debug('initialised')
      this.emit('initialised')
    } catch (error) {
      if (!(error instanceof UpsClient.UpsError)) {
        this.error(error)
      }
      await homebridgeLib.timeout(600)
      return this.init()
    }
  }

  async shutdown () {
    return this.client.disconnect()
  }
}

module.exports = UpsHost