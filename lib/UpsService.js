// homebridge-ups/lib/UpsService.js
// Copyright © 2022 Erik Baauw. All rights reserved.
//
// Homebridge plugin for UPS.

'use strict'

const homebridgeLib = require('homebridge-lib')
const UpsClient = require('./UpsClient')

class Outlet extends homebridgeLib.ServiceDelegate {
  constructor (upsAccessory, constants) {
    super(upsAccessory, {
      name: upsAccessory.name,
      Service: upsAccessory.Services.hap.Outlet
    })
    this.device = upsAccessory.device

    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On
    })
    this.addCharacteristicDelegate({
      key: 'outletInUse',
      Characteristic: this.Characteristics.hap.OutletInUse,
      value: 1 // Eve interpretes OutletInUse as: device is physically plugged in.
    })
    this.addCharacteristicDelegate({
      key: 'totalConsumption',
      Characteristic: this.Characteristics.eve.TotalConsumption,
      unit: ' kWh',
      value: 0
    })
    this.addCharacteristicDelegate({
      key: 'currentConsumption',
      Characteristic: this.Characteristics.eve.CurrentConsumption,
      unit: ' W'
    })
    this.addCharacteristicDelegate({
      key: 'voltage',
      Characteristic: this.Characteristics.eve.Voltage,
      unit: ' V'
    })
    this.addCharacteristicDelegate({
      key: 'lastUpdated',
      Characteristic: this.Characteristics.my.LastUpdated,
      silent: true
    })
    this.addCharacteristicDelegate({
      key: 'mute',
      Characteristic: this.Characteristics.hap.Mute
    }).on('didSet', async (value, fromHomeKit) => {
      if (fromHomeKit) {
        await this.device.command(value ? 'beeper.disable' : 'beeper.enable')
      }
    })
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault
    })
    // Needed for Eve to show history for _On_.
    this.addCharacteristicDelegate({
      key: 'lockPhysicalControls',
      Characteristic: this.Characteristics.hap.LockPhysicalControls
    })
    this.addCharacteristicDelegate({
      key: 'logLevel',
      Characteristic: this.Characteristics.my.LogLevel,
      value: this.accessoryDelegate.logLevel
    })
    this.addCharacteristicDelegate({
      key: 'lastEvent',
      Characteristic: this.Characteristics.my.LastEvent,
      value: ''
    })

    this.update(constants)
  }

  update (constants, nClients) {
    this.values.on = constants['ups.status'].includes('OL')
    if (nClients != null) {
      this.values.outletInUse = nClients > 0
    }
    this.values.currentConsumption = Math.round(
      parseFloat(constants['ups.realpower.nominal']) *
        parseFloat(constants['ups.load']) / 10
    ) / 10
    this.values.voltage = parseFloat(constants['input.voltage'])
    this.values.lastUpdated = String(new Date()).slice(0, 24)
    this.values.mute = constants['ups.beeper.status'] !== 'enabled'
    this.values.statusFault =
      constants['ups.status'].includes('ALARM') || constants['ups.alarm'] != null
        ? this.Characteristics.hap.StatusFault.GENERAL_FAULT
        : this.Characteristics.hap.StatusFault.NO_FAULT
    this.values.lastEvent = constants['ups.test.result'] +
      (constants['ups.alarm'] == null ? '' : ' - ' + constants['ups.alarm'])
    if (constants['ups.alarm'] != null) {
      this.warn(constants['ups.alarm'])
    }
  }

  setFault () {
    this.values.statusFault = this.Characteristics.hap.StatusFault.GENERAL_FAULT
  }
}

class Battery extends homebridgeLib.ServiceDelegate.Battery {
  constructor (upsAccessory, constants) {
    super(upsAccessory)
    this.device = upsAccessory.device

    this.addCharacteristicDelegate({
      key: 'voltage',
      Characteristic: this.Characteristics.eve.Voltage,
      unit: 'V',
      props: { minValue: 0, maxValue: 30, minStep: 0.1 }
    })
    this.addCharacteristicDelegate({
      key: 'remainingDuration',
      Characteristic: this.Characteristics.hap.RemainingDuration,
      props: { minValue: 0, maxValue: 86400 },
      getter: () => { return this.values.remainingDuration }
    })
    this.characteristicDelegate('lowBatteryThreshold')
      .on('didSet', (value, fromHomeKit) => {
        if (fromHomeKit) {
          this.setLowBatteryThreshold()
        }
      })

    this.update(constants)
  }

  update (constants) {
    this.values.batteryLevel = parseInt(constants['battery.charge'])
    this.values.chargingState = constants['ups.status'].includes('CHRG')
      ? this.Characteristics.hap.ChargingState.CHARGING
      : this.Characteristics.hap.ChargingState.NOT_CHARGING
    this.values.lowBatteryThreshold = constants['ups.status'].includes('RB')
      ? 100
      : parseInt(constants['battery.charge.low'])
    this.values.voltage = parseFloat(constants['battery.voltage'])
    this.values.remainingDuration = constants['ups.status'].includes('OL')
      ? null
      : parseInt(constants['battery.runtime'])
  }

  setLowBatteryThreshold () {
    if (this.timer == null) {
      this.timer = setTimeout(async () => {
        try {
          delete this.timer
          await this.device.set('battery.charge.low', this.values.lowBatteryThreshold)
        } catch (error) {
          if (!(error instanceof UpsClient.UpsError)) {
            this.error(error)
          }
        }
      }, 500)
    }
  }
}

class UpsService extends homebridgeLib.ServiceDelegate {
  static get Outlet () { return Outlet }

  static get Battery () { return Battery }
}

module.exports = UpsService
