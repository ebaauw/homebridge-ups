// homebridge-ups/lib/UpsAccessory.js
// Copyright © 2022-2023 Erik Baauw. All rights reserved.
//
// Homebridge plugin for UPS.

'use strict'

// const events = require('events')
const homebridgeLib = require('homebridge-lib')
const UpsClient = require('./UpsClient')
const UpsService = require('./UpsService')

function exists (value) {
  return value != null && value !== ''
}

function parse (constants) {
  const result = {}
  if (exists(constants['ups.status'])) {
    result.status = constants['ups.status'].split(' ')
  } else {
    result.status = []
  }
  if (exists(constants['ups.load'])) {
    if (exists(constants['ups.realpower.nominal'])) {
      result.power = Math.round(
        parseFloat(constants['ups.realpower.nominal']) *
          parseFloat(constants['ups.load']) / 10
      ) / 10
    } else if (exists(constants['ups.power.nominal'])) {
      result.power = Math.round(
        parseFloat(constants['ups.power.nominal']) *
          parseFloat(constants['ups.load']) / 10
      ) / 10
    } else if (exists(constants['output.current'])) {
      if (exists(constants['output.voltage'])) {
        result.power = Math.round(
          parseFloat(constants['output.voltage']) *
            parseFloat(constants['output.current']) * 10
        ) / 10
      }
    }
  }
  if (exists(constants['input.voltage'])) {
    result.voltage = parseFloat(constants['input.voltage'])
  } else if (exists(constants['output.voltage'])) {
    result.voltage = parseFloat(constants['output.voltage'])
  }
  if (exists(constants['ups.beeper.status'])) {
    result.mute = constants['ups.beeper.status'] !== 'enabled'
  }
  if (exists(constants['ups.alarm'])) {
    result.alarm = constants['ups.alarm']
  }
  if (exists(constants['ups.test.result'])) {
    result.testResult = constants['ups.test.result']
  }
  if (exists(constants['battery.charge'])) {
    result.batteryLevel = parseInt(constants['battery.charge'])
  }
  if (exists(constants['battery.charge.low'])) {
    result.lowBatteryThreshold = parseInt(constants['battery.charge.low'])
  }
  if (exists(constants['battery.voltage'])) {
    result.batteryVoltage = parseFloat(constants['battery.voltage'])
  }
  if (exists(constants['battery.runtime'])) {
    result.batteryRuntime = parseInt(constants['battery.runtime'])
  }
  return result
}

class UpsAccessory extends homebridgeLib.AccessoryDelegate {
  constructor (upsHost, params) {
    super(upsHost.platform, params)
    this.device = params.device
    this.values.firmware = params.firmware
    const body = parse(params.constants)

    this.log(
      '%s: %s %s %sV UPS with %sV %s battery from %s',
      params.id, params.manufacturer, params.model,
      parseFloat(params.constants['input.voltage.nominal']),
      parseFloat(params.constants['battery.voltage.nominal']),
      params.constants['battery.type'], params.constants['battery.mfr.date']
    )
    this.debug('state: %j', body)

    this.service = new UpsService.Outlet(this, body)
    this.manageLogLevel(this.service.characteristicDelegate('logLevel'))
    this.batteryService = new UpsService.Battery(this, body)
    this.historyService = new homebridgeLib.ServiceDelegate.History(this, {
      consumptionDelegate: this.service.characteristicDelegate('consumption'),
      computedTotalConsumptionDelegate: this.service.characteristicDelegate('totalConsumption'),
      onDelegate: this.service.characteristicDelegate('on'),
      lastOnDelegate: this.service.characteristicDelegate('lastActivation')
    })

    this.heartbeatEnabled = true
    this
      .once('heartbeat', this.init)
      .on('heartbeat', this.heartbeat)
      .on('identify', this.identify)

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
        const nClients = await this.device.nClients()
        const constants = await this.device.constants()
        const body = parse(constants)
        this.debug('state: %j', body)
        this.service.update(body, nClients)
        this.batteryService.update(body)
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

  async identify () {
    try {
      await this.device.command('test.battery.start.quick')
    } catch (error) {
      if (!(error instanceof UpsClient.UpsError)) {
        this.error('heartbeat error: %s', error)
      }
    }
  }

  setFault () {
    this.service.setFault()
  }
}

module.exports = UpsAccessory
