// homebridge-ups/lib/UpsService.js
// Copyright © 2022-2025 Erik Baauw. All rights reserved.
//
// Homebridge plugin for UPS.

import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'
import 'homebridge-lib/ServiceDelegate/Battery'

import { UpsClient } from './UpsClient.js'

class Contact extends ServiceDelegate {
  constructor (upsAccessory, body) {
    super(upsAccessory, {
      name: upsAccessory.name,
      Service: upsAccessory.Services.hap.ContactSensor
    })
    this.device = upsAccessory.device

    this.addCharacteristicDelegate({
      key: 'contact',
      Characteristic: this.Characteristics.hap.ContactSensorState
    })
    this.addCharacteristicDelegate({
      key: 'lastActivation',
      Characteristic: this.Characteristics.eve.LastActivation,
      silent: true
    })
    this.addCharacteristicDelegate({
      key: 'timesOpened',
      Characteristic: this.Characteristics.eve.TimesOpened,
      value: 0,
      silent: true
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
    this.addCharacteristicDelegate({
      key: 'logLevel',
      Characteristic: this.Characteristics.my.LogLevel,
      value: this.accessoryDelegate.logLevel
    }).on('didSet', (value, fromHomeKit) => {
      if (fromHomeKit) {
        upsAccessory.upsHost.updateLogLevel()
      }
    })
    this.addCharacteristicDelegate({
      key: 'lastEvent',
      Characteristic: this.Characteristics.my.LastEvent,
      value: ''
    })

    this.update(body)
  }

  update (body, nClients) {
    this.values.contact = body.status.includes('OL')
      ? this.Characteristics.hap.ContactSensorState.CONTACT_DETECTED
      : this.Characteristics.hap.ContactSensorState.CONTACT_NOT_DETECTED
    if (nClients != null) {
      this.values.outletInUse = nClients > 0 ? 1 : 0
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

class Consumption extends ServiceDelegate {
  constructor (upsAccessory, body) {
    super(upsAccessory, {
      name: upsAccessory.name + ' Consumption',
      Service: upsAccessory.Services.eve.Consumption
    })

    this.addCharacteristicDelegate({
      key: 'totalConsumption',
      Characteristic: this.Characteristics.eve.TotalConsumption,
      unit: ' kWh',
      value: 0
    })
    this.addCharacteristicDelegate({
      key: 'consumption',
      Characteristic: this.Characteristics.eve.Consumption,
      unit: ' W',
      value: 0
    })
    this.addCharacteristicDelegate({
      key: 'voltage',
      Characteristic: this.Characteristics.eve.Voltage,
      unit: ' V',
      props: { minValue: 0, maxValue: 500, minStep: 0.1 }
    })
  }

  update (body) {
    if (body.power != null) {
      this.values.consumption = body.power
    }
    if (body.voltage != null) {
      this.values.voltage = body.voltage
    }
  }
}

class Battery extends ServiceDelegate.Battery {
  constructor (upsAccessory, body) {
    super(upsAccessory, {
      batteryLevel: body.batteryLevel,
      chargingState: body.status.includes('CHRG')
        ? upsAccessory.Characteristics.hap.ChargingState.CHARGING
        : upsAccessory.Characteristics.hap.ChargingState.NOT_CHARGING,
      lowBatteryThreshold: body.status.includes('RB')
        ? 100
        : body.lowBatteryThreshold == null ? 20 : body.lowBatteryThreshold
    })
    this.device = upsAccessory.device

    this.addCharacteristicDelegate({
      key: 'voltage',
      Characteristic: this.Characteristics.eve.Voltage,
      unit: 'V',
      props: { minValue: 0, maxValue: 60, minStep: 0.1 }
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

class UpsService extends ServiceDelegate {
  static get Contact () { return Contact }
  static get Consumption () { return Consumption }
  static get Battery () { return Battery }
}

export { UpsService }
