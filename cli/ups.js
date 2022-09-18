#!/usr/bin/env node

// homebridge-ups/cli/ups.js
//
// Homebridge plugin for UPS.
// Copyright © 2022 Erik Baauw. All rights reserved.
//
// Command line interface to `upsd`.

'use strict'

const homebridgeLib = require('homebridge-lib')
const UpsClient = require('../lib/UpsClient')
const packageJson = require('../package.json')

const { b, u } = homebridgeLib.CommandLineTool
const { UsageError } = homebridgeLib.CommandLineParser

const usage = {
  ups: `${b('ups')} [${b('-hVD')}] [${b('-H')} ${u('hostname')}[${b(':')}${u('port')}]] [${b('-U')} ${u('username')}] [${b('-P')} ${u('password')}] [${b('-t')} ${u('timeout')}] ${u('command')} [${u('argument')} ...]`,
  info: `${b('info')} [${b('-v')}]`
}

const description = {
  ups: 'Commmand line interface to Network UPS Tools.',
  info: `Print ${b('upsd')} info.`
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

For more help, issue: ${b('ups')} ${u('command')} ${b('-h')}`,
  info: `${description.info}

Usage: ${b('ups')} ${usage.info}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.

  ${b('-v')}, ${b('--verbose')}
  List variable and command descriptions and variable types.`
}

class Main extends homebridgeLib.CommandLineTool {
  constructor () {
    super({ mode: 'command', debug: false })
    this.usage = usage.ups
  }

  parseArguments () {
    const parser = new homebridgeLib.CommandLineParser(packageJson)
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
        homebridgeLib.OptionParser.toHost('host', value, false, true)
        clargs.options.host = value
      })
      .option('U', 'username', (value) => {
        clargs.options.username = homebridgeLib.OptionParser.toString(
          'username', value, true
        )
      })
      .option('P', 'password', (value) => {
        clargs.options.password = homebridgeLib.OptionParser.toString(
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
        clargs.options.timeout = homebridgeLib.OptionParser.toInt(
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
      await this.client.connect()
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
    const parser = new homebridgeLib.CommandLineParser(packageJson)
    const clargs = {
      options: { sortKeys: true }
    }
    parser
      .help('h', 'help', this.help)
      .flag('v', 'verbose', () => { clargs.verbose = true })
      .parse(...args)

    const formatter = new homebridgeLib.JsonFormatter()
    await this.client.connect()
    const map = {
      version: await this.client.version(),
      apiVersion: await this.client.apiVersion(),
      devices: {}
    }
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
      this.print(formatter.stringify(map))

      // await device.command('test.battery.start.quick')
    }
  }
}

new Main().main()
