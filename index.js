'use strict'

const UpsClient = require('lib/UpsClient')

const host = 'pi4'
const port = 3493

async function main () {
  try {
    const ups = new UpsClient(host, port)
    await ups.connect()
    await ups.send('VER', '')
    await ups.send('NETVER', '')
    await ups.send('LIST UPS', 'END LIST UPS')
    await ups.send('GET NUMLOGINS ups', '')
    await ups.send('LIST VAR ups', 'END LIST VAR ups')
    await ups.send('LIST RW ups', 'END LIST RW ups')
    await ups.send('LIST CMD ups', 'END LIST CMD ups')
    await ups.send('LIST CLIENT ups', 'END LIST CLIENT ups')
    await ups.send('USERNAME upsadmin', 'OK')
    await ups.send('PASSWORD secret', 'OK')
    // await ups.send('MASTER ups', 'OK')
    await ups.send('INSTCMD ups beeper.on', 'OK')
    await ups.disconnect()
  } catch (error) {
    console.error(error)
  }
}

main()
  .then(() => {
    console.log('goodbye')
  })
  .catch((error) => {
    console.error('error: %s', error)
  })
