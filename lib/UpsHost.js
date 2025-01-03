// homebridge-ups/lib/UpsHost.js
// Copyright © 2022-2025 Erik Baauw. All rights reserved.
//
// Homebridge plugin for UPS.

import { timeout } from 'homebridge-lib'
import { Delegate } from 'homebridge-lib/Delegate'

import { UpsAccessory } from './UpsAccessory.js'
import { UpsClient } from './UpsClient.js'

class UpsHost extends Delegate {
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
      .on('error', (error) => {
        if (error.request != null) {
          this.log(
            'request %d: %s',
            error.request.id, error.request.command
          )
          this.warn('request %d: error: %s', error.request.id, error)
          return
        }
        this.warn(error)
      })
      .on('request', (request) => {
        this.debug('request %d: %s', request.id, request.command)
      })
      .on('response', (response) => {
        this.vdebug(
          'request %d: response: %s', response.request.id, response.body
        )
        this.debug('request %d: OK', response.request.id)
      })
  }

  get logLevel () { return this._logLevel }

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
          ? this.name + '-' + deviceId
          : constants['device.serial'].toUpperCase()
        if (this.upsAccessories[id] == null) {
          this.upsAccessories[id] = new UpsAccessory(this, {
            name: description == null || description === '' || description === 'Unavailable'
              ? this.name
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
      }
      this.updateLogLevel()
      this.debug('initialised')
      this.emit('initialised')
    } catch (error) {
      if (!(error instanceof UpsClient.UpsError)) {
        this.warn(error)
      }
      await timeout(600)
      return this.init()
    }
  }

  updateLogLevel () {
    let logLevel = 0
    for (const id in this.upsAccessories) {
      logLevel = Math.max(logLevel, this.upsAccessories[id].logLevel)
    }
    this._logLevel = logLevel
  }

  async heartbeat (beat) {
    for (const id in this.upsAccessories) {
      this.upsAccessories[id].heartbeat(beat)
    }
  }

  async shutdown () {
    return this.client.disconnect()
  }
}

export { UpsHost }
