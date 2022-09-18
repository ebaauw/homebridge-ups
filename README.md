<p align="center">
  <img src="homebridge-ups.png" height="200px">  
</p>
<span align="center">

# Homebridge UPS
[![Downloads](https://img.shields.io/npm/dt/homebridge-ups)](https://www.npmjs.com/package/homebridge-ups)
[![Version](https://img.shields.io/npm/v/homebridge-ups)](https://www.npmjs.com/package/homebridge-ups)
<!-- [![Homebridge Discord](https://img.shields.io/discord/432663330281226270?color=728ED5&logo=discord&label=discord)](https://discord.gg/zUhSZSNb4P)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins) -->

[![GitHub issues](https://img.shields.io/github/issues/ebaauw/homebridge-ups)](https://github.com/ebaauw/homebridge-ups/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/ebaauw/homebridge-ups)](https://github.com/ebaauw/homebridge-ups/pulls)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen)](https://standardjs.com)

</span>

## Homebridge plugin for UPS
Copyright © 2022 Erik Baauw. All rights reserved.

This [Homebridge](https://github.com/homebridge/homebridge) plugin exposes to Apple's [HomeKit](http://www.apple.com/ios/home/) Uninterruptible Power Supply (UPS) devices connected to a host system over [Network UPS Tools (NUT)](https://networkupstools.org).

This plugin is under development.

I developed this plugin for my [APC Back-UPS BE850G2-GR](https://www.apc.com/shop/nl/en/products/APC-Back-UPS-850VA-230V-USB-Type-C-and-A-charging-ports-8-Schuko-CEE-7-outlets-2-surge-/P-BE850G2-GR) devices, connected over USB to the host.
I have three of these: two connected to a Synology NAS, and one connected to a Raspberry Pi.

### Prerequisites
Homebridge UPS connects to the socket provided by `upsd` on port 3493.
You need to setup and configure the UPS for `upsd`, and set permissions for the server running Homebridge UPS to access it.
Check that the UPS is setup correctly by issuing:
```
$ upsc -l localhost
Init SSL without certificate database
ups
```
`upsd` knowns of one device, named `ups`.
Check that the device can be queried and reports something by:
```
$ upsc ups localhost
Init SSL without certificate database
battery.charge: 100
battery.charge.low: 10
battery.charge.warning: 50
battery.date: 2001/09/25
battery.mfr.date: 2021/05/24
battery.runtime: 3168
battery.runtime.low: 120
battery.type: PbAc
battery.voltage: 13.3
battery.voltage.nominal: 12.0
device.mfr: American Power Conversion
device.model: Back-UPS ES 850G2
device.serial: 5B2121T05717  
device.type: ups
driver.name: usbhid-ups
driver.parameter.pollfreq: 30
driver.parameter.pollinterval: 2
driver.parameter.port: auto
driver.parameter.synchronous: no
driver.version: 2.7.4
driver.version.data: APC HID 0.96
driver.version.internal: 0.41
input.sensitivity: medium
input.transfer.high: 266
input.transfer.low: 180
input.transfer.reason: input voltage out of range
input.voltage: 232.0
input.voltage.nominal: 230
ups.beeper.status: enabled
ups.delay.shutdown: 20
ups.firmware: 938.a2 .I
ups.firmware.aux: a2
ups.load: 4
ups.mfr: American Power Conversion
ups.mfr.date: 2021/05/24
ups.model: Back-UPS ES 850G2
ups.productid: 0002
ups.realpower.nominal: 520
ups.serial: 5B2121T05717  
ups.status: OL
ups.test.result: No test initiated
ups.timer.reboot: 0
ups.timer.shutdown: -1
ups.vendorid: 051d
```
If you want to control the UPS, rather than just monitoring it, you need to define a username and password in `upsd.user`, with `actions = SET` and `instcmds = ALL`.
If the username or password is missing or incorrect, `upsd` will simply ignore any command that changes the UPS state, causing a timeout.
Note that the NUT config files are in `/etc/nut` on Raspberry Pi, but in `/etc/ups` on Synology.
