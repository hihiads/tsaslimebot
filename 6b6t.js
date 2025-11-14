const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder')
const mcData = require('minecraft-data')('1.20.4')
const Vec3 = require('vec3')

const PASSWORD = 'dCkmKG5cSVUCk'
let bot

// Portali
const PORTALS = {
  first: new Vec3(-1000, 101, -988),  // void
  second: new Vec3(289, 46, 88)       // plains
}

function startBot() {
  bot = mineflayer.createBot({
    host: '6b6t.org',
    username: 'VSTMbot',
    version: '1.20.4',
    checkTimeoutInterval: 120000
  })

  bot.loadPlugin(pathfinder)

  bot.once('spawn', () => {
    bot.chat(`/login ${PASSWORD}`)
    console.log('✅ Bot joined the server and logged in')

    bot.on('message', msg => {
      const text = msg.toString()
      console.log('[MSG]', text)

      // Kad dobije login poruku, kreće prema prvom portalu
      if (text.includes('VSTMbot, you are now logged in! Please enter the server through the portal.')) {
        moveToPortal(PORTALS.first, 'first')
      }
    })
  })

  bot.on('end', () => {
    console.log('Bot disconnected, restarting in 5s...')
    setTimeout(startBot, 5000)
  })
}

// Funkcija za pomicanje kroz zrak
async function flyTo(pos, name) {
  console.log(`🚀 Flying to ${name} portal at ${pos.x} ${pos.y} ${pos.z}`)

  return new Promise(resolve => {
    const interval = setInterval(() => {
      const direction = pos.minus(bot.entity.position)
      const distance = direction.distanceTo(new Vec3(0,0,0))
      if (distance < 1.5) {
        bot.entity.velocity = new Vec3(0,0,0)
        clearInterval(interval)
        console.log(`✅ Reached ${name} portal!`)
        bot.chat(`Reached ${name} portal!`)
        resolve()
        return
      }

      bot.lookAt(pos, true)
      const speed = 0.5
      bot.entity.velocity = direction.scaled(speed / distance)
    }, 50)
  })
}

async function moveToPortal(pos, name) {
  if (name === 'first') {
    // Fly kroz void
    await flyTo(pos)
    // nakon prvog portala, odmah idemo na drugi
    await flyTo(PORTALS.second, 'second')
  } else {
    // Za drugi portal može pathfinder ako teren normalan
    const movements = new Movements(bot, mcData)
    bot.pathfinder.setMovements(movements)
    const { goals } = require('mineflayer-pathfinder')
    const goal = new goals.GoalNear(pos.x, pos.y, pos.z, 1)

    try {
      await bot.pathfinder.goto(goal)
      console.log(`✅ Reached ${name} portal!`)
      bot.chat(`Reached ${name} portal!`)
    } catch (err) {
      console.log(`❌ Could not path to ${name} portal:`, err.message)
      bot.chat(`Cannot path to ${name} portal!`)
    }
  }
}

startBot()
