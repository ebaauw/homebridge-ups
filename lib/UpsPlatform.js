// homebridge-ups/lib/UpsPlatform.js
// Copyright © 2022-2023 Erik Baauw. All rights reserved.
//
// Homebridge plugin for UPS.

'use strict'

const events = require('events')
const homebridgeLib = require('homebridge-lib')
const os = require('os')
const UpsHost = require('./UpsHost')

class UpsPlatform extends homebridgeLib.Platform {
  constructor (log, configJson, homebridge) {
    super(log, configJson, homebridge)
    this.parseConfigJson(configJson)

    this.upsHosts = {}

    this
      .once('heartbeat', this.init)
      .on('heartbeat', this.heartbeat)
      .on('shutdown', this.shutdown)
  }

  parseConfigJson (configJson) {
    this.config = {
      name: 'UPS',
      timeout: 15,
      hosts: [
        { host: 'localhost' }
      ]
    }
    const optionParser = new homebridgeLib.OptionParser(this.config, true)
    optionParser
      .stringKey('name')
      .stringKey('platform')
      .arrayKey('hosts')
      .intKey('timeout', 1, 60)
      .on('userInputError', (message) => {
        this.warn('config.json: %s', message)
      })
    try {
      optionParser.parse(configJson)
      this.upsAccessories = {}
      const validHosts = []
      for (const i in this.config.hosts) {
        const host = this.config.hosts[i]
        const config = {
          password: process.env.UPS_PASSWORD,
          port: 3493,
          username: process.env.UPS_USERNAME
        }
        const optionParser = new homebridgeLib.OptionParser(config, true)
        optionParser
          .stringKey('name')
          .hostKey()
          .stringKey('username')
          .stringKey('password')
          .on('userInputError', (error) => {
            this.warn('config.json: hosts[%d]: %s', i, error)
          })
        try {
          optionParser.parse(host)
          if (config.hostname == null || config.port == null) {
            continue
          }
          validHosts.push({
            name: config.name,
            host: config.hostname + ':' + config.port,
            username: config.username,
            password: config.password
          })
        } catch (error) {
          this.error(error)
        }
      }
      this.config.hosts = validHosts
      this.debug('config: %j', this.config)
    } catch (error) {
      this.error(error)
    }
  }

  async init (beat) {
    this.initialBeat = (beat + 1) % 30
    const jobs = []

    for (const host of this.config.hosts) {
      try {
        if (host.name == null) {
          host.name = host.host.split(':')[0]
          if (host.name === 'localhost') {
            host.name = os.hostname().split('.')[0]
          }
        }
        if (this.upsHosts[host.name] == null) {
          this.upsHosts[host.name] = new UpsHost(this, host)
        }
        jobs.push(this.upsHosts[host.name].init())
        jobs.push(events.once(this.upsHosts[host.name], 'initialised'))
      } catch (error) {
        this.error(error)
      }
    }
    for (const job of jobs) {
      await job
    }
    this.debug('initialised')
    this.emit('initialised')
  }

  async heartbeat (beat) {
    if (beat % 30 === this.initialBeat) {
      for (const id in this.upsHosts) {
        try {
          await this.upsHosts[id].heartbeat(beat)
        } catch (error) { this.warn('%s: heartbeat error %s', id, error) }
      }
    }
  }

  async shutdown () {
    for (const id in this.upsHosts) {
      await this.upsHosts[id].shutdown()
    }
  }
}

module.exports = UpsPlatform
