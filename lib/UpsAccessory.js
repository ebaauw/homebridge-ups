// homebridge-ups/lib/UpsAccessory.js
// Copyright © 2022 Erik Baauw. All rights reserved.
//
// Homebridge plugin for UPS.

'use strict'

// const events = require('events')
const homebridgeLib = require('homebridge-lib')
const UpsClient = require('./UpsClient')
const UpsService = require('./UpsService')

class UpsAccessory extends homebridgeLib.AccessoryDelegate {
  constructor (upsHost, params) {
    super(upsHost.platform, params)
    this.client = upsHost.client
    this.device = params.device

    this.log(
      '%s: %s %s %sV UPS with %sV %s battery from %s',
      params.constants['device.serial'],
      params.constants['device.mfr'], params.constants['device.model'],
      params.constants['input.voltage.nominal'],
      params.constants['battery.voltage'],
      params.constants['battery.type'], params.constants['battery.mfr.date']
    )

    this.service = new UpsService.Outlet(this, params.constants)
    this.manageLogLevel(this.service.characteristicDelegate('logLevel'))
    this.batteryService = new UpsService.Battery(this, params.constants)

    this.heartbeatEnabled = true
    this
      .once('heartbeat', this.init)
      .on('heartbeat', this.heartbeat)

    setImmediate(() => {
      this.emit('initialised')
    })
  }

  async init (beat) {
    this.initialBeat = beat % 30
  }

  async heartbeat (beat) {
    if (beat % 30 === this.initialBeat) {
      try {
        const constants = await this.device.constants()
        const nClients = await this.device.nClients()
        this.service.update(constants, nClients)
        this.batteryService.update(constants)
        if (nClients > 0) {
          const clients = await this.device.clients()
          this.debug(
            '%d clients: %j', nClients, clients
          )
        }
      } catch (error) {
        if (!(error instanceof UpsClient.UpsError)) {
          this.error('heartbeat error: %s', error)
        }
      }
    }
  }

  setFault () {
    this.service.setFault()
  }
}

module.exports = UpsAccessory
