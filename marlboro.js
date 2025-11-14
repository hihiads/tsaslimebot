const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalNear, GoalFollow } } = require('mineflayer-pathfinder')
const mcData = require('minecraft-data')('1.20.4')
const Vec3 = require('vec3')

const playerCooldowns = {}
const DELIVERY_COOLDOWN = 200 * 1000 // 200 sekundi
let delivering = false
const PASSWORD = 'nigger'
let bot

// Blacklist igrača (username)
const BLACKLIST = ['IceBox', 'Clife2013', 'miktyluchitun', 'clownperice132', 'badbad_con', 'panana777', 'DEMOMAX', 'hadi09', 'progameingYT', 'Cauazingg_']  

// Chest coordinates
const CHESTS = {
  pvp: new Vec3(1167, 3, 1403),
}

function startBot() {
  bot = mineflayer.createBot({
    host: '8b8t.me',
    username: 'MarlboroBOT',
    version: "1.20.4",
    checkTimeoutInterval: 120000
  })

  bot.loadPlugin(pathfinder)

  bot.once('spawn', () => {
    bot.chat(`/login ${PASSWORD}`)
    console.log('✅ Bot joined the server and sent login')

    const kitMessages = [
      ' > Need a kit? Type @kit list.',
      ' > Want some gear? @kit tools!',
      ' > Grab your PvP kit with @kit pvp.',
      ' > Get ready! @kit list for your adventure.',
      ' > Time for some action! @kit list now.',
      ' > Made by Malbacoo and s5der. @kit list to see available kits!',
      ' > If you see this message you are cool.',
      ' > Join The Slime Avengory on Discord: dsc.gg/supremeslime.',
      ' > Do not spam commands, you will get blacklisted.',
      ' > @kit pvp, for PvP gear.',
      ' > Special thanks to s5der for making this possible',
    ]

    setInterval(() => {
      const msg = kitMessages[Math.floor(Math.random() * kitMessages.length)]
      bot.chat(msg)
    }, 25 * 1000)
  })

  bot.on('death', () => {
    console.log("💀 Bot died, waiting for respawn...")
  })

  bot.on('chat', (username, message) => {
    if (username === bot.username) return
    handleChatMessage(username, message)
  })

  bot.on('message', msg => {
    try { console.log('[MSG]', msg.toString()) } 
    catch { console.log('[MSG] (unprintable)') }
  })

  function handleChatMessage(username, message) {
    if (BLACKLIST.includes(username)) {
      bot.chat(`/w ${username} ⚠ You are blacklisted.`)
      return
    }

    const text = (typeof message === 'string') ? message : message?.toString?.() || String(message)

    if (text.includes('@dupenigga123123')) bot.chat('/dupe')
    if (text.includes('Leee wants to teleport you to them')) bot.chat('/tpayes Leee')
    if (text.includes('@getmeoutmb')) bot.chat('/tpahere Malbacoo')

    if (text.startsWith('@follow')) {
      const args = text.split(/\s+/)
      const targetName = args[1]
      const target = bot.players[targetName]?.entity
      if (!target) return
      const movements = new Movements(bot, mcData)
      bot.pathfinder.setMovements(movements)
      bot.pathfinder.setGoal(new GoalFollow(target, 2), true)
      bot.chat(`👣 Following ${targetName}`)
    }

    if (text.startsWith('@unfollow')) {
      bot.pathfinder.setGoal(null)
      bot.chat('🛑 Stopped following.')
    }

    const availableKits = ['pvp',]
    if (text.includes('@kit list')) bot.chat(`/w ${username} 📦 Available kits: ${availableKits.join(', ')}`)

    if (text.includes('@kit pvp')) deliverKit(username, 'pvp')
    if (text.includes('@kit tools')) deliverKit(username, 'tools')
  }

  async function deliverKit(username, kitName) {
    if (BLACKLIST.includes(username)) {
      bot.chat(`/w ${username} ⚠ You are blacklisted.`)
      return
    }

    const now = Date.now()
    if (playerCooldowns[username] && now - playerCooldowns[username] < DELIVERY_COOLDOWN) {
      bot.chat(`/w ${username} Wait before requesting another kit.`)
      return
    }

    if (delivering) {
      bot.chat(`/w ${username} I'm delivering another kit. Try later.`)
      return
    }

    delivering = true

    try {
      const pos = CHESTS[kitName]
      if (!pos) {
        bot.chat(`/w ${username} Chest coordinates for ${kitName} not set.`)
        delivering = false
        return
      }

      await goToChest(pos)
      const chest = await bot.openContainer(bot.blockAt(pos))
      const shulker = chest.containerItems().find(i => i.name.includes('shulker_box'))
      if (!shulker) {
        bot.chat(`/w ${username} No shulker found in chest.`)
        chest.close()
        delivering = false
        return
      }

      await chest.withdraw(shulker.type, null, 1)
      chest.close()

      // Obavijesti igrača da pošalje /tpahere
      bot.chat(`/w ${username} Please type: /tpahere ${bot.username} so I can deliver your kit.`)

      let tpaAccepted = false

      const tpaListener = async msg => {
  const m = msg.toString()
  
  // Kada igrač napiše da želi teleportirati bota
  if (m.includes('wants to teleport you to them')) {
    tpaAccepted = true
    // Prvo čekamo da teleport stvarno završi (male MC server delay)
    setTimeout(() => {
      bot.chat(`/w ${username} ✅ Your ${kitName} kit has been delivered!`)
      playerCooldowns[username] = Date.now()
      bot.chat('/dupe') // /dupe se šalje tek nakon teleportacije
      setTimeout(() => bot.chat('/kill'), 3000)
    }, 1500) // 1.5 sekunde delay da se teleportacija desi
    cleanup()
  }

  if (m.includes('has denied your request') || m.includes('Teleport request expired')) {
    bot.chat(`/w ${username} ❌ Your TPA was denied or expired.`)
    await returnAllShulkers(pos)
    cleanup()
  }
}


      const cleanup = () => {
        clearTimeout(tpaTimeout)
        bot.removeListener('message', tpaListener)
        delivering = false
      }

      bot.on('message', tpaListener)

      const tpaTimeout = setTimeout(async () => {
        if (!tpaAccepted) {
          bot.chat(`/w ${username} ❌ You didn't send /tpahere in time.`)
          await returnAllShulkers(pos)
          cleanup()
        }
      }, 30000) // 30 sekundi da igrač reagira

    } catch (err) {
      console.log('Delivery error:', err)
      bot.chat(`/w ${username} Failed to deliver ${kitName} kit.`)
      await returnAllShulkers(CHESTS[kitName])
      delivering = false
    }
  }

  async function goToChest(pos) {
    const movements = new Movements(bot, mcData)
    bot.pathfinder.setMovements(movements)
    const { goals } = require('mineflayer-pathfinder')
    const goal = new goals.GoalNear(pos.x, pos.y, pos.z, 1)
    await bot.pathfinder.goto(goal)
  }

  async function returnAllShulkers(pos) {
    const chestBlock = bot.blockAt(pos)
    if (!chestBlock) return
    const chest = await bot.openContainer(chestBlock)
    for (const item of bot.inventory.items()) {
      if (item.name.includes('shulker_box')) {
        await chest.deposit(item.type, null, item.count)
      }
    }
    chest.close()
    console.log('🔁 Returned all shulkers to chest')
  }

  bot.on('end', () => setTimeout(startBot, 5000))
}

startBot()
