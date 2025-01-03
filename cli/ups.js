#!/usr/bin/env node

// homebridge-ups/cli/ups.js
// Copyright © 2022-2025 Erik Baauw. All rights reserved.
//
// Homebridge plugin for UPS.
//
// Command line interface to `upsd`.

import { createRequire } from 'node:module'

import { CommandLineParser } from 'homebridge-lib/CommandLineParser'
import { CommandLineTool } from 'homebridge-lib/CommandLineTool'
import { OptionParser } from 'homebridge-lib/OptionParser'
import { JsonFormatter } from 'homebridge-lib/JsonFormatter'

import { UpsClient } from '../lib/UpsClient.js'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json')

const { b, u } = CommandLineTool
const { UsageError } = CommandLineParser

const usage = {
  ups: `${b('ups')} [${b('-hVD')}] [${b('-H')} ${u('hostname')}[${b(':')}${u('port')}]] [${b('-U')} ${u('username')}] [${b('-P')} ${u('password')}] [${b('-t')} ${u('timeout')}] ${u('command')} [${u('argument')} ...]`,
  info: `${b('info')} [${b('-hv')}]`,
  test: `${b('test')} [${b('-v')}] [${b('-q')} | ${b('-d')} | ${b('-s')}] [${u('device')}]`
}

const description = {
  ups: 'Commmand line interface to Network UPS Tools.',
  info: `Print ${b('upsd')} info.`,
  test: 'Start or stop UPS battery test'
}

const help = {
  ups: `${description.ups}

Usage: ${usage.ups}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.

  ${b('-V')}, ${b('--version')}
  Print version and exit.

  ${b('-D')}, ${b('--debug')}
  Print debug messages for communication with the gateway.

  ${b('-H')} ${u('hostname')}[${b(':')}${u('port')}], ${b('--host=')}${u('hostname')}[${b(':')}${u('port')}]
  Connect to ${u('hostname')}${b(':80')} or ${u('hostname')}${b(':')}${u('port')} instead of the default ${b('localhost:3493')}.
  The hostname and port can also be specified by setting ${b('UPS_HOST')}.

  ${b('-U')} ${u('username')}, ${b('--username=')}${u('username')}
  Username as defined in ${b('upsd.users')}.
  The username can also be specified by setting ${b('UPS_USERNAME')}.

  ${b('-P')} ${u('password')}, ${b('--password=')}${u('password')}
  Password as defined in ${b('upsd.users')}.
  The password can also be specified by setting ${b('UPS_PASSWORD')}.

  ${b('-t')} ${u('timeout')}, ${b('--timeout=')}${u('timeout')}
  Set timeout to ${u('timeout')} seconds instead of default ${b(5)}.

Commands:
  ${usage.info}
  ${description.info}

  ${usage.test}
  ${description.test}

For more help, issue: ${b('ups')} ${u('command')} ${b('-h')}`,
  info: `${description.info}

Usage: ${b('ups')} ${usage.info}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.

  ${b('-v')}, ${b('--verbose')}
  List variable and command descriptions and variable types.`,
  test: `${description.test}

Usage: ${b('ups')} ${usage.test}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.

  ${b('-q')}, ${b('--quick')}
  Start a quick battery test.  This is the default.

  ${b('-d')}, ${b('--deep')}
  Start a deep battery test.

  ${b('-s')}, ${b('--stop')}
  Stop the battery test.

  ${u('device')}
  The UPS device.
  The device can also be specified by setting ${b('UPS_DEVICE')}.`
}

class Main extends CommandLineTool {
  constructor () {
    super({ mode: 'command', debug: false })
    this.usage = usage.ups
  }

  parseArguments () {
    const parser = new CommandLineParser(packageJson)
    const clargs = {
      options: {
        host: process.env.UPS_HOST || 'localhost',
        username: process.env.UPS_USERNAME,
        password: process.env.UPS_PASSWORD,
        timeout: 5
      }
    }
    parser
      .help('h', 'help', help.ups)
      .version('V', 'version')
      .option('H', 'host', (value) => {
        OptionParser.toHost('host', value, false, true)
        clargs.options.host = value
      })
      .option('U', 'username', (value) => {
        clargs.options.username = OptionParser.toString(
          'username', value, true
        )
      })
      .option('P', 'password', (value) => {
        clargs.options.password = OptionParser.toString(
          'password', value, true
        )
      })
      .flag('D', 'debug', () => {
        if (this.debugEnabled) {
          this.setOptions({ vdebug: true })
        } else {
          this.setOptions({ debug: true, chalk: true })
        }
      })
      .option('t', 'timeout', (value) => {
        clargs.options.timeout = OptionParser.toInt(
          'timeout', value, 1, 60, true
        )
      })
      .parameter('command', (value) => {
        if (usage[value] == null || typeof this[value] !== 'function') {
          throw new UsageError(`${value}: unknown command`)
        }
        clargs.command = value
      })
      .remaining((list) => { clargs.args = list })
    parser
      .parse()
    return clargs
  }

  async main () {
    try {
      await this._main()
    } catch (error) {
      if (error.request == null) {
        this.error(error)
      }
    }
  }

  async _main () {
    this.clargs = this.parseArguments()
    this.client = new UpsClient(this.clargs.options)
    this.client
      .on('connect', (host) => { this.debug('connected to %s', host) })
      .on('disconnect', (host) => { this.debug('disconnected from %s', host) })
      .on('error', (error) => {
        if (error.request != null) {
          this.log(
            '%s: request %d: %s',
            error.request.name, error.request.id, error.request.command
          )
          this.error(
            '%s: request %d: %s',
            error.request.name, error.request.id, error.message
          )
        } else {
          this.error('%s: %s', this.client.name, error)
        }
      })
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
    try {
      this.name = 'ups ' + this.clargs.command
      this.usage = `${b('ups')} ${usage[this.clargs.command]}`
      this.help = help[this.clargs.command]
      await this[this.clargs.command](this.clargs.args)
    } catch (error) {
      if (!(error instanceof UpsClient.UpsError)) {
        this.error(error)
      }
    }
    await this.client.disconnect()
  }

  async info (...args) {
    const parser = new CommandLineParser(packageJson)
    const clargs = {
      options: { sortKeys: true }
    }
    parser
      .help('h', 'help', this.help)
      .flag('v', 'verbose', () => { clargs.verbose = true })
      .parse(...args)

    const formatter = new JsonFormatter()
    await this.client.connect()
    const map = {
      version: await this.client.version(),
      apiVersion: await this.client.apiVersion(),
      devices: {}
    }
    await this.client.connect()
    const devices = await this.client.devices()
    for (const id in devices) {
      const device = devices[id]
      const commandList = await device.commands()
      const commandMap = {}
      const varList = await device.constants()
      const varMap = {}
      if (clargs.verbose) {
        for (const key of commandList) {
          commandMap[key] = await device.commandDescription(key)
        }
        for (const key in varList) {
          varMap[key] = {
            value: varList[key],
            type: await device.type(key),
            description: await device.description(key)
          }
        }
      }
      map.devices[id] = {
        description: await device.description(),
        nCients: await device.nClients(),
        clients: await device.clients(),
        commands: clargs.verbose ? commandMap : commandList,
        constants: clargs.verbose ? varMap : varList,
        variables: await device.variables()
      }
    }
    this.print(formatter.stringify(map))
  }

  async find (device = process.env.UPS_DEVICE) {
    if (device == null || device === '') {
      throw new UsageError(
        `Missing device name.  Set ${b('UPS_DEVICE')} or specify as argument.`
      )
    }
    await this.client.connect()
    const devices = await this.client.devices()
    for (const id in devices) {
      if (device === id) {
        return devices[id]
      }
    }
    throw new UsageError(
      `${device}: device not found`
    )
  }

  async test (...args) {
    const parser = new CommandLineParser(packageJson)
    const clargs = {
      options: { sortKeys: true },
      test: 'quick'
    }
    parser
      .help('h', 'help', this.help)
      .flag('v', 'verbose', () => { clargs.verbose = true })
      .flag('q', 'quick', () => { clargs.test = 'quick' })
      .flag('d', 'deep', () => { clargs.test = 'deep' })
      .flag('s', 'stop', () => { clargs.test = 'stop' })
      .remaining((list) => {
        if (list.length > 1) {
          throw new UsageError('too many arguments')
        }
        clargs.device = list[0]
      })
      .parse(...args)

    const device = await this.find(clargs.device)
    await device.command('test.battery.start.' + clargs.test)
  }
}

new Main().main()
