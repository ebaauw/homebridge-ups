// homebridge-ups/lib/UpsClient.js
// Copyright © 2022-2024 Erik Baauw. All rights reserved.
//
// Homebridge plugin for UPS.

'use strict'

const events = require('events')
const homebridgeLib = require('homebridge-lib')
const net = require('net')

/* Possible values for `ups.state`:
 * OL      - On line (mains is present)
 * OB      - On battery (mains is not present)
 * LB      - Low battery
 * HB      - High battery
 * RB      - The battery needs to be replaced
 * CHRG    - The battery is charging
 * DISCHRG - The battery is discharging (inverter is providing load power)
 * BYPASS  - UPS bypass circuit is active - no battery protection is available
 * CAL     - UPS is currently performing runtime calibration (on battery)
 * OFF     - UPS is offline and is not supplying power to the load
 * OVER    - UPS is overloaded
 * TRIM    - UPS is trimming incoming voltage (called "buck" in some hardware)
 * BOOST   - UPS is boosting incoming voltage
 * FSD     - Forced Shutdown (restricted use, see the note below)
 */

/** UPS error.
  * @hideconstructor
  * @extends Error
  * @memberof UpsClient
  */
class UpsError extends Error {
  constructor (message, request) {
    super(message)
    /** @member {UpsClient.UpsRequest} - The request that caused the error.
      */
    this.request = request
  }
}

/** UPS request.
  * @hideconstructor
  * @memberof UpsClient
  */
class UpsRequest {
  constructor (name, id, command) {
    /** @member {string} - The server name.
      */
    this.name = name

    /** @member {integer} - The request ID.
      */
    this.id = id

    /** @member {string} - The request command.
      */
    this.command = command
  }
}

/** UPS response.
  * @hideconstructor
  * @memberof UpsClient
  */
class UpsResponse {
  constructor (request, body) {
    /** @member {UpsClient.UpsRequest} - The request that generated the response.
      */
    this.request = request

    /** @member {?string} - The response body.
      */
    this.body = body
  }
}

/** Delegate class for a UPS device.
  * @memberof UpsClient
  */
class UpsDevice {
  /** Create a new instance of a UPS device delegate.
    *
    * @param {object} params - Parameters.
    * @param {UpsClient} params.client - The UPS client instance.
    * @param {string} params.name - The device name
    * (as returned by {@link UpsClient.list list()}.
    */
  constructor (params) {
    this._client = params.client
    this._name = params.name
  }

  /** Name of the device.
    * @type {string}
    */
  get name () { return this._name }

  /** Get a list of connected UPS clients.
    * @return {string[]} list - A list of IP addresses.
    * @throws {UpcClient.UpsError} In case of error.
    */
  async clients () {
    const list = await this._client._getList('CLIENT ' + this._name)
    return list.sort()
  }

  /** Get a list of supported NUT commands.
    * @return {string[]} list - A list of IP addresses.
    * @throws {UpcClient.UpsError} In case of error.
    */
  async commands () {
    return this._client._getList('CMD ' + this._name)
  }

  /** Get a map of supported NUT read-only variables and their values.
    * @return {Object<string, string|integer>} mao - A map of read-only
    * variables with their values.
    * @throws {UpcClient.UpsError} In case of error.
    */
  async constants () {
    return this._client._getMap('VAR ' + this._name)
  }

  /** Get a map of supported NUT read/write variables and their values.
    * @return {Object<string, string|integer>} mao - A map of read/write
    * variables with their current values.
    * @throws {UpcClient.UpsError} In case of error.
    */
  async variables () {
    return this._client._getMap('RW ' + this._name)
  }

  /** Get the number of connected UPS clients.
    * @return {integer} nClients - The number of UPS clients.
    * @throws {UpcClient.UpsError} In case of error.
    */
  async nClients () {
    const response = await this._client._send(
      `GET NUMLOGINS ${this._name}`, `NUMLOGINS ${this._name}`
    )
    const a = /NUMLOGINS .* (.*)/.exec(response)
    if (a != null && a[1] != null) {
      return a[1]
    }
  }

  /** Get the value of a NUT variable.
    * @param {string} key - The variable key.
    * @return {string|integer} value - The variable value.
    * @throws {UpcClient.UpsError} In case of error.
    */
  async value (key) {
    return this._client._get('VAR ' + this._name, key)
  }

  /** Set the value of a NUT variable.
    * @param {string} key - The variable key.
    * @param {string} value - The new value.
    * @throws {UpcClient.UpsError} In case of error.
    */
  async set (key, value) {
    return this._client._send(
      'SET VAR ' + this._name + ' ' + key + ' "' + value + '"', 'OK'
    )
  }

  /** Get the description of a NUT variable.
    *
    * Note: descriptions are empty on Synology.
    * @params {?string} key - The variable key.
    * @return {string|integer} value - The variable value.
    * @throws {UpcClient.UpsError} In case of error.
    */
  async description (key) {
    if (key == null) {
      return this._client._get('UPSDESC ' + this._name)
    }
    return this._client._get('DESC ' + this._name, key)
  }

  /** Get the type of a NUT variable.
    *
    * Note: this doesn't seem to return correct values.
    * @params {string} key - The variable key.
    * @return {string|integer} value - The variable value.
    * @throws {UpcClient.UpsError} In case of error.
    */
  async type (key) {
    return this._client._get('TYPE ' + this._name, key)
  }

  /** Execute a NUT command.
    * @params {string} key - The command key.
    * @throws {UpcClient.UpsError} In case of error.
    */
  async command (key) {
    await this._client._send(`INSTCMD ${this._name} ${key}`, 'OK')
  }

  /** Execute a NUT command.
    *
    * Note: descriptions are empty on Synology.
    * @params {string} key - The command key.
    * @throws {UpcClient.UpsError} In case of error.
    */
  async commandDescription (key) {
    return this._client._get('CMDDESC ' + this._name, key)
  }
}

/** Delegate class for a UPS daemon, `upsd`.
  * @extends EventEmitter
  */
class UpsClient extends events.EventEmitter {
  static get UpsDevice () { return UpsDevice }
  static get UpsError () { return UpsError }
  static get UpsRequest () { return UpsRequest }
  static get UpsResponse () { return UpsResponse }

  /** Create a new instance of a UPS Daemon delegate.
    *
    * @param {object} params - Parameters.
    * @param {string} params.name - The name of the `upsd`.
    * @param {string} params.host - The `upsd` hostname and port (default: `localhost:3493`).
    * @param {string} params.username - The username (as specified in `upsd.users`).
    * @param {string} params.password - The password (as specified in `upsd.users`).
  */
  constructor (params) {
    super()
    this._params = {
      hostname: 'localhost',
      port: 3493,
      timeout: 15
    }
    const optionParser = new homebridgeLib.OptionParser(this._params)
    optionParser
      .hostKey()
      .stringKey('name')
      .stringKey('username')
      .stringKey('password')
      .intKey('timeout', 1, 60)
      .parse(params)
    this._host = this._params.hostname + ':' + this._params.port
    this._requestId = 0
    this._devices = {}
  }

  /** The name of the UPS Daemon.
    * @type {string}
    */
  get name () { return this._params.name }

  /** Return whether delegate is connected to `upsd`.
    * @type {boolean}
    */
  get connected () { return this._client != null }

  /** Connect to `upsd`.
    * @throws {UpsClient.UpsError} In case of error.
    */
  async connect () {
    if (this._client != null) {
      return
    }
    this._client = net.createConnection({
      port: this._params.port, host: this._params.hostname, family: 4
    })
    this._client
      .on('connect', () => {
        /** Emitted when client has connected to `upsd`.
          * @event UpsClient#connect
          * @param {string} host - The hostname and port.
          */
        this.emit('connect', this._host)
      })
      .on('close', () => {
        /** Emitted when client has disconnected from `upsd`.
          * @event UpsClient#disconnect
          * @param {string} host - The hostname and port.
          */
        this.emit('disconnect', this._host)
        this._client = null
      })
      .on('data', (buffer) => { this._onData(buffer) })
      .on('error', (error) => {
        /** Emitted in case of error.
          * @event UpsClient#error
          * @param {UpsClient.UpsError} error - The error.
          */
        this.emit('error', new UpsError(error.message, this._request))
      })
    try {
      await events.once(this._client, 'connect')
    } catch (error) {
      throw new UpsError(error.message, this._request)
    }
    if (this._params.username != null && this._params.username !== '') {
      await this._send(`USERNAME ${this._params.username}`, 'OK')
      await this._send(`PASSWORD ${this._params.password}`, 'OK')
    }
  }

  /** Disconnect from `upsd`.
    */
  async disconnect () {
    for (const id in this._devices) {
      delete this._devices[id]
    }
    if (this._client != null) {
      await this._client.destroy()
    }
    this._client = null
  }

  _onData (buffer) {
    const s = buffer.toString('utf8')
    this._response += s
    const lines = this._response.split('\n')
    for (const line of lines) {
      if (line.startsWith(this._expectedResponse)) {
        /** Emitted when a valid response has been received from `upsd`.
          * @event UpsClient#response
          * @param {UpsClient.UpsResponse} response - The response.
          */
        this.emit('response', new UpsResponse(
          this._request, this._response.slice(0, -1))
        )
        break
      }
    }
  }

  async _send (command, expectedResponse, nRetries = 0) {
    await this.connect()
    if (this._expectedResponse != null) {
      if (nRetries < 5) {
        await homebridgeLib.timeout(500)
        return this._send(command, expectedResponse, ++nRetries)
      }
      const error = new UpsError(
        'send in progress',
        new UpsRequest(this._params.name, ++this._requestId, command)
      )
      this.emit('error', error)
      throw error
    }
    this._request = new UpsRequest(this._params.name, ++this._requestId, command)
    this._expectedResponse = expectedResponse
    this._response = ''
    /** Emitted when a request has been sent to `upsd`.
      * @event UpsClient#request
      * @param {UpsClient.UpsRequest} request - The request.
      */
    this.emit('request', this._request)
    await this._client.write(command + '\n')
    const timeout = setTimeout(() => {
      this.emit('error', new UpsError(
        `timeout after ${this._params.timeout}s`, this._request
      ))
    }, this._params.timeout * 1000)
    try {
      const response = await events.once(this, 'response')
      clearTimeout(timeout)
      return response[0].body
    } finally {
      this._expectedResponse = null
    }
  }

  async _get (type, key) {
    if (key != null) {
      type += ' ' + key
    }
    const s = await this._send('GET ' + type, type)
    const regexp = new RegExp(`^${type} "?([^"]*)"?$`)
    const a = regexp.exec(s)
    if (a != null && a[1] != null) {
      return a[1].trim()
    }
  }

  async _getList (key) {
    const list = []
    const s = await this._send('LIST ' + key, 'END LIST ' + key)
    const regexp = new RegExp(`^${key} ([^ ]*)$`)
    const lines = s.slice(0, -1).split('\n')
    for (const line of lines) {
      const a = regexp.exec(line)
      if (a != null && a[1] != null) {
        list.push(a[1].trim())
      }
    }
    return list
  }

  async _getMap (key) {
    const map = {}
    const s = await this._send('LIST ' + key, 'END LIST ' + key)
    const regexp = new RegExp(`^${key} ([^ ]*) "(.*)"$`)
    const lines = s.slice(0, -1).split('\n')
    for (const line of lines) {
      const a = regexp.exec(line)
      if (a != null && a[1] != null && a[2] != null) {
        map[a[1]] = a[2].trim()
      }
    }
    return map
  }

  /** Get the version of `upsd`.
    * @return {string} version - The `upsd` version.
    * @throws {UpsClient.UpsError} In case of error.
    */
  async version () {
    return this._send('VER', '')
  }

  /** Get the API version of `upsd`.
    * @return {string} version - The API `upsd` version.
    * @throws {UpsClient.UpsError} In case of error.
    */
  async apiVersion () {
    return this._send('NETVER', '')
  }

  /** Get a map of UPS devices.
    * @return {Object<string, UpsClient.UpsDevice>} deviceMap - Map of UPS devices by name.
    * @throws {UpsClient.UpsError} In case of error.
    */
  async devices () {
    const map = {}
    const descriptionByName = await this._getMap('UPS')
    for (const name of Object.keys(descriptionByName).sort()) {
      map[name] = new UpsDevice({ client: this, name })
    }
    return map
  }
}

module.exports = UpsClient
