// homebridge-ups/lib/UpsClient.js
//
// Homebridge plugin for UPS.
// Copyright © 2022 Erik Baauw. All rights reserved.

'use strict'

const events = require('events')
// const homebridgeLib = require('homebridge-lib')
const net = require('net')

// const Nut = require('node-nut')

/*
OL      - On line (mains is present)
OB      - On battery (mains is not present)
LB      - Low battery
HB      - High battery
RB      - The battery needs to be replaced
CHRG    - The battery is charging
DISCHRG - The battery is discharging (inverter is providing load power)
BYPASS  - UPS bypass circuit is active - no battery protection is available
CAL     - UPS is currently performing runtime calibration (on battery)
OFF     - UPS is offline and is not supplying power to the load
OVER    - UPS is overloaded
TRIM    - UPS is trimming incoming voltage (called "buck" in some hardware)
BOOST   - UPS is boosting incoming voltage
FSD     - Forced Shutdown (restricted use, see the note below)
*/

const upsStatus = {
  OL: 'online',
  OB: 'on battery',
  BL: 'battery low',
  CHRG: 'charging',
  DISCHRG: 'discharging'
}

class UpsClient extends events.EventEmitter {
  static get upsStatus () { return upsStatus }

  constructor (host, port = 3493) {
    super()
    this._host = host
    this._port = port
  }

  async connect () {
    if (this._ups != null) {
      return
    }
    this._ups = net.connect(this._port, this._host)
    this._ups
      .on('connect', () => { this.emit('connect', this._host, this._port) })
      .on('close', () => { this.emit('close', this._host, this._port) })
      .on('data', (buffer) => { this.onData(buffer) })
      .on('error', (error) => { this.emit('error', error) })
    await events.once(this._ups, 'connect')
  }

  async disconnect () {
    await this._ups.destroy()
    this._ups = null
  }

  onData (buffer) {
    const s = buffer.toString('utf8')
    const lines = s.slice(0, -1).split('\n')
    for (const line of lines) {
      console.log(line)
      if (line === this._expectedResponse || this._expectedResponse === '') {
        this.emit('_gotIt')
      }
    }
  }

  async send (command, response) {
    if (this._expectedResponse != null) {
      throw new Error('send in progress')
    }
    this._expectedResponse = response
    await this._ups.write(command + '\n')
    await events.once(this, '_gotIt')
    this._expectedResponse = null
  }
}

module.export = UpsClient
