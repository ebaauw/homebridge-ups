// homebridge-ups/lib/UpsService.js
// Copyright © 2022 Erik Baauw. All rights reserved.
//
// Homebridge plugin for UPS.

'use strict'

const homebridgeLib = require('homebridge-lib')
const UpsClient = require('./UpsClient')

class Outlet extends homebridgeLib.ServiceDelegate {
  constructor (upsAccessory, body) {
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
      unit: ' V',
      props: { minValue: 0, maxValue: 500, minStep: 0.1 }
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

    this.update(body)
  }

  update (body, nClients) {
    this.values.on = body.status.includes('OL')
    if (nClients != null) {
      this.values.outletInUse = nClients > 0
    }
    if (body.currentConsumption != null) {
      this.values.currentConsumption = body.currentConsumption
    }
    if (body.voltage != null) {
      this.values.voltage = body.voltage
    }
    this.values.lastUpdated = String(new Date()).slice(0, 24)
    if (body.mute != null) {
      this.values.mute = body.mute
    }
    this.values.statusFault = body.status.includes('ALARM') || body.alarm != null
      ? this.Characteristics.hap.StatusFault.GENERAL_FAULT
      : this.Characteristics.hap.StatusFault.NO_FAULT
    if (body.testResult != null) {
      this.values.lastEvent = body.testResult +
        (body.alarm == null ? '' : ' - ' + body.alarm)
    } else if (body.alarm != null) {
      this.values.lastEvent = body.alarm
    }
    if (body.alarm != null) {
      this.warn(body.alarm)
    }
  }

  setFault () {
    this.values.statusFault = this.Characteristics.hap.StatusFault.GENERAL_FAULT
  }
}

class Battery extends homebridgeLib.ServiceDelegate.Battery {
  constructor (upsAccessory, body) {
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

    this.update(body)
  }

  update (body) {
    this.values.batteryLevel = body.batteryLevel
    this.values.chargingState = body.status.includes('CHRG')
      ? this.Characteristics.hap.ChargingState.CHARGING
      : this.Characteristics.hap.ChargingState.NOT_CHARGING
    this.values.lowBatteryThreshold = body.status.includes('RB')
      ? 100
      : body.lowBatteryThreshold == null ? 20 : body.lowBatteryThreshold
    if (body.batteryVoltage != null) {
      this.values.voltage = body.batteryVoltage
    }
    this.values.remainingDuration = body.status.includes('OL')
      ? null
      : body.batteryRuntime
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
