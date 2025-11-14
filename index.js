const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalNear, GoalFollow } } = require('mineflayer-pathfinder')
const mcData = require('minecraft-data')('1.20.4')
const Vec3 = require('vec3')
const { Client, GatewayIntentBits } = require('discord.js')
const { MongoClient } = require('mongodb')
const crypto = require('crypto')
const fs = require('fs')
require('dotenv').config();


// --- CONFIG ---
// (ovo je OK jer ne sadrži osjetljive podatke)
const config = JSON.parse(fs.readFileSync('./config.json'))


// --- MONGODB ---
if (!process.env.MONGO_URI) {
  console.error("❌ ERROR: MONGO_URI nije postavljen u Render Environment Variables!")
  process.exit(1)
}

if (!process.env.MONGO_DB) {
  console.error("❌ ERROR: MONGO_DB nije postavljen u Render Environment Variables!")
  process.exit(1)
}

const mongoClient = new MongoClient(process.env.MONGO_URI)
let linksCollection


async function mongoConnect() {
  await mongoClient.connect()

  const db = mongoClient.db(process.env.MONGO_DB)
  linksCollection = db.collection(config.mongoCollection)

  console.log('✅ Connected to MongoDB Atlas')
}

// --- DISCORD BOT ---
const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: ['CHANNEL']
})

discord.once('ready', () => console.log(`🤖 Discord online as ${discord.user.tag}`))

discord.on('messageCreate', async msg => {
  if (msg.author.bot) return
  const content = msg.content.trim()

  // $ping
  if (content === '$ping') {
    msg.reply('🏓 Pong!')
    return
  }
const ALLOWED_IDS = ['990626592474677349', '1241862272234688523']

if (content === '$start') {
  if (!ALLOWED_IDS.includes(msg.author.id)) {
    return msg.reply('❌ Fam u arent HIM.')
  }

  if (botRunning) {
    return msg.reply('⚠️ Fam u stupid or something u can see that the bot is active.')
  }

  try {
    startBot()
    botRunning = true
    msg.reply('✅ Minecraft bot started successfully!')
  } catch (err) {
    msg.reply(`❌ Error while starting bot: ${err.message}`)
  }
}

if (content === '$stop') {
  if (!ALLOWED_IDS.includes(msg.author.id)) {
    return msg.reply('❌ Fam u arent HIM.')
  }

  if (!botRunning || !bot) {
    return msg.reply('⚠️ Fam bot is not online.')
  }

  try {
    bot.quit('Stopped via Discord command.')
    botRunning = false
    msg.reply('🛑 Alr fam i stopped the bot.')
  } catch (err) {
    msg.reply(`❌ Error mate: ${err.message}`)
  }
}

  // $link <CODE>
  if (content.startsWith('$link')) {
    const args = content.split(/\s+/)
    if (args.length < 2) return msg.reply('❗ Usage: `$link <code>`')

    const code = args[1].toUpperCase()
    const doc = await linksCollection.findOne({ code, used: false })

    if (!doc) return msg.reply('❌ Fam ur code is incorrect or expired.')
    if (doc.expiresAt && doc.expiresAt < new Date()) return msg.reply('⏰ Mate ur code expired.')

    await linksCollection.updateOne(
      { _id: doc._id },
      { $set: { used: true, discordId: msg.author.id, linkedAt: new Date() } }
    )

    msg.reply(`✅ Successfully linked to Minecraft account **${doc.mcUsername}**!`)
    try {
      if (global.minebot?.players[doc.mcUsername]) {
        global.minebot.chat(`/w ${doc.mcUsername} ✅ Good boy ur discord acc (${msg.author.tag}) is now linked!`)
      }
    } catch (err) {
      console.log('⚠️ Failed to whisper to player:', err.message)
    }
  }
    if (content === '$status') {
    if (!global.minebot) return msg.reply('❌ Minecraft bot nije trenutno aktivan.')

    const bot = global.minebot
    let response = `🤖 **Minecraft Bot Status**\n`
    response += `🟢 Bot: **${bot.username}**\n`
    response += `📡 Ping: **${bot.player?.ping || 'N/A'} ms**\n\n`

    const chestData = []
    for (const [kitName, pos] of Object.entries(CHESTS)) {
      try {
        const chestBlock = bot.world.getBlock(pos)
        if (chestBlock && bot.openContainer) {
          const chest = await bot.openContainer(chestBlock)
          const shulkers = chest.containerItems().filter(i => i.name.includes('shulker_box'))
          chestData.push(`📦 **${kitName}**: ${shulkers.length} shulkera`)
          chest.close()
        } else {
          chestData.push(`📦 **${kitName}**: ⚠️ Chest nije pronađen`)
        }
      } catch (err) {
        chestData.push(`📦 **${kitName}**: ❌ Greška (${err.message})`)
      }
    }

    response += chestData.join('\n')
    msg.reply(response)
  }
if (content.startsWith('$send')) {
  if (!ALLOWED_IDS.includes(msg.author.id)) {
    return msg.reply('❌ Bro ur not him.')
  }

  const messageToSend = content.replace('$send', '').trim()
  if (!messageToSend) {
    return msg.reply('⚠️ use: `$send <msg>`')
  }

  if (!global.minebot) {
    return msg.reply('❌ Fam the bot isnt online.')
  }

  try {
    global.minebot.chat(messageToSend)
    msg.reply(`✅ Msg sent to 8b8t: \`${messageToSend}\``)
  } catch (err) {
    msg.reply(`❌ Error : ${err.message}`)
  }
}

})


// --- HELPER FUNCTIONS ---
function generateHexCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase() // 6 hex digits
}

async function createLinkForMcPlayer(mcUsername) {
  const code = generateHexCode()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + config.linkTtlMinutes * 60 * 1000)
  const doc = {
    mcUsername,
    code,
    createdAt: now,
    expiresAt,
    used: false,
    discordId: true
  }
  await linksCollection.insertOne(doc)
  return { code, expiresAt }
}

// --- MAKE AVAILABLE TO MC BOT ---
global.createLinkForMcPlayer = createLinkForMcPlayer
global.minebot = null // set later

// --- MINECRAFT BOT ---
const playerCooldowns = {}
const DELIVERY_COOLDOWN = 200 * 1000 // 200s normal delay
const WHITELIST_COOLDOWN = 30 * 1000  // 60s for whitelist players
let delivering = false

// Whitelisted players (reduced delay)
const WHITELIST = ['Malbacoo', 's5der', 'Brock', 'Tyler']

let bot = null
let botRunning = false


const BLACKLIST = ['IceBox','Clife2013','miktyluchitun','clownperice132','badbad_con','panana777','DEMOMAX','hadi09','progameingYT','Cauazingg_']

const CHESTS = {
  pvp: new Vec3(29999979,-37,1008),
  tools: new Vec3(29999979,-37,1008),
  totems: new Vec3(29999983,-37,1007),
  build: new Vec3(29999983,-37,1006),
  glass: new Vec3(29999983,-38,990),
}

function startBot() {
  bot = mineflayer.createBot({
    host: '8b8t.me',
    username: 'SlimeBOT',
    version: '1.20.4',
    checkTimeoutInterval: 120000
  })
  global.minebot = bot
  botRunning = true
  bot.loadPlugin(pathfinder)

function startKitBot() {
  if (!bot || !bot.connected) return
  // auto messages
  const kitMessages = [
    'Need a kit? Type $kit list.',
    'Bot is coord logger free. We value your privacy.',
    'Want some gear? $kit tools!',
    'Grab your PvP kit with $kit pvp.',
    'Get ready! $kit list for your adventure.',
    'Time for some action! $kit list now.',
    'Made by s5der. $kit list to see avilable kits!.',
    'If you see this message you are cool.',
    'Join The Slime Avengory on ⓓⓢⓒ.ⓖⓖ/ⓢⓤⓟⓡⓔⓜⓔⓢⓛⓘⓜⓔ',
    'Do not spam commands, you are gonna get blacklisted.',
    '$kit pvp, for PvP gear.',
    'Special thanks to Sniptoes, Malbacoo, Brock and Tyler for making this possible!',
  ]

  setInterval(() => {
    if (!bot || !bot.connected) return
    const msg = kitMessages[Math.floor(Math.random() * kitMessages.length)]
    bot.chat(msg)
  }, 25 * 1000)

  // listen to all messages (chat + whispers)
  bot.on('message', msg => {
    const text = msg.toString()
    if (!text || text.includes(bot.username)) return
    handleChatMessage(text)
  })
}

  bot.on('death', () => {
    setTimeout(() => {
      try {
        bot.chat("/home stashfar")
        console.log("Bot is home!")
      } catch (e) { /* ignore if can't chat while dead */ }
      bot.once('spawn', () => {})
    }, 3000)
  })

  bot.on('chat', async (username, message) => {
    if (username === bot.username) return
    handleChatMessage(username, message)
  })

  bot.on('message', msg => {
    try { console.log('[MSG]', msg.toString()) } 
    catch { console.log('[MSG] (unprintable)') }
  })

  function handleChatMessage(username, message) {
    if (BLACKLIST.includes(username)) return
    const text = (typeof message === 'string') ? message : message?.toString?.() || String(message)

    if (text.includes('$dupenigga123123')) bot.chat('/dupe')
    if (text.includes('wants to teleport you to them')) bot.chat('/tpayes s5der')
    if (text.includes('$stuck')) bot.chat('/tpahere s5der')

    if (text.startsWith('$follow')) {
      const args = text.split(/\s+/)
      const targetName = args[1]
      const target = bot.players[targetName]?.entity
      if (!target) return
      const movements = new Movements(bot, mcData)
      bot.pathfinder.setMovements(movements)
      bot.pathfinder.setGoal(new GoalFollow(target,2),true)
      bot.chat(`👣 Following ${targetName}`)
    }

    if (text.startsWith('$unfollow')) {
      bot.pathfinder.setGoal(null)
      bot.chat('🛑 Stopped following.')
    }

    const availableKits = ['pvp','tools','totems','build','glass', 'totem']
    if (text.includes('$kit list')) bot.chat(`/w ${username} 📦 Available kits: ${availableKits.join(', ')}`)

    if (text.includes('$kit pvp')) deliverKit(username,'pvp')
    if (text.includes('$kit tools')) deliverKit(username,'tools')
    if (text.includes('$kit totems')) deliverKit(username,'totems')
    if (text.includes('$kit build')) deliverKit(username,'build')
    if (text.includes('$kit glass')) deliverKit(username,'glass')
    if (text.includes('$kit totem')) deliverKit(username,'totem')

    // --- LINK COMMAND ---
    if (text.trim() === '$link') {
      createLinkForMcPlayer(username).then(({code}) => {
        bot.chat(`/w ${username} Your link code: ${code}`)
        console.log(`🔗 Link code for ${username}: ${code}`)
      }).catch(err => console.log('❌ Link code error:', err))
    }
  }

  async function deliverKit(username, kitName) {
  if (BLACKLIST.includes(username)) {
    bot.chat(`/w ${username} ⚠ You are blacklisted.`)
    return
  }

  const now = Date.now()
  if (playerCooldowns[username] && now - playerCooldowns[username] < DELIVERY_COOLDOWN) {
    bot.chat(`/w ${username} Yoo slow down with the greatness you needa wait bruh.`)
    return
  }

  if (delivering) {
    bot.chat(`/w ${username} Yo fam I am delivering another kit bruv wait.`)
    return
  }

  delivering = true

  try {
    const pos = CHESTS[kitName]
    if (!pos) {
      bot.chat(`/w ${username} Idk where chest with ${kitName} name is.`)
      delivering = false
      return
    }

    await goToChest(pos)

    const chestBlock = (typeof bot.blockAt === 'function') ? bot.blockAt(pos) : bot.world.getBlock(pos)
    if (!chestBlock) {
      bot.chat(`/w ${username} ❌ Yo fam cant find the chest im contacting s5der if he don respond.`)
      bot.chat("/w s5der ❌ Cannot find chest at coordinates.")
      delivering = false
      return
    }

    const chest = await bot.openContainer(chestBlock)
    const shulker = chest.containerItems().find(i => i.name && i.name.includes('shulker_box'))
    if (!shulker) {
      bot.chat(`/w ${username} No shulker found in chest.`)
      chest.close()
      delivering = false
      return
    }

    await chest.withdraw(shulker.type, null, 1)
    chest.close()

    // Send instructions to player
    bot.chat(`/w ${username} Yo fam sent u a tpa make sure to /tpayes...`)
    bot.chat(`/tpa ${username}`)

    let tpaAccepted = false
    let tpaTimeout = null

    const cleanup = () => {
      if (tpaTimeout) clearTimeout(tpaTimeout)
      try { bot.removeListener('message', tpaListener) } catch (e) {}
      delivering = false
    }

    const tpaListener = async msg => {
      const m = msg.toString()

      if (m.includes('Teleporting...') || m.includes('accepted your teleport request') || m.includes('Teleporting you')) {
        tpaAccepted = true
        setTimeout(() => {
          bot.chat(`/w ${username} ✅ Yoo fam your ${kitName} kit is delivered if u cant see it maybe it flew somewhere!`)
          playerCooldowns[username] = Date.now()
          bot.chat('/dupe')
          setTimeout(() => bot.chat('/kill'), 3000)
        }, 1500)
        cleanup()
        return
      }

      if (m.includes('has denied your request') || m.includes('Teleport request expired') || m.includes('denied your teleport request') || m.includes('/tpano')) {
        bot.chat(`/w ${username} ❌ Yo fam you either denied my req or it expired.`)
        try { await returnAllShulkers(pos) } catch (e) { console.log('Return shulkers error:', e) }
        cleanup()
      }
    }

    bot.on('message', tpaListener)

    tpaTimeout = setTimeout(async () => {
      if (!tpaAccepted) {
        try { bot.chat('/tpacancel') } catch (e) {}
        bot.chat(`/w ${username} ❌ Yo fam u didnt do /tpayes make sure to do that.`)
        try { await returnAllShulkers(pos) } catch (e) { console.log('Return shulkers error:', e) }
        cleanup()
      }
    }, 15000)

  } catch (err) {
    console.log('Delivery error:', err)
    try { bot.chat(`/w ${username} Cant deliver your kit ${kitName} fam my bad.`) } catch (e) {}
    try { await returnAllShulkers(CHESTS[kitName]) } catch (e) { console.log('Return shulkers error:', e) }
    delivering = false
  }
  // goToChest helper
async function goToChest(chestPos) {
  if (!chestPos) throw new Error('No chestPos provided to goToChest')
  const movements = new Movements(bot, mcData)
  bot.pathfinder.setMovements(movements)
  const { goals } = require('mineflayer-pathfinder')
  const goal = new goals.GoalNear(chestPos.x, chestPos.y, chestPos.z, 1)
  try {
    await bot.pathfinder.goto(goal)
  } catch (err) {
    console.log('goToChest error:', err)
    throw err
  }
}

// returnAllShulkers helper
async function returnAllShulkers(chestPos) {
  if (!chestPos) return

  const pos = chestPos instanceof Vec3 ? chestPos : new Vec3(chestPos.x, chestPos.y, chestPos.z)
  const chestBlock = typeof bot.blockAt === 'function' ? bot.blockAt(pos) : bot.world.getBlock(pos)
  if (!chestBlock) {
    try { bot.chat(`/w s5der ❌ Nigga u entered wrong coords!`) } catch(e){}
    return
  }

  let chest
  try {
    chest = await bot.openContainer(chestBlock)
  } catch(err) {
    console.log('Failed to open chest/container:', err)
    try { bot.chat(`/w s5der ❌ Yo nigga cant open chest help me bruh.`) } catch(e){}
    return
  }

  for (const item of bot.inventory.items()) {
    if (item.name && item.name.includes('shulker_box')) {
      try {
        await chest.deposit(item.type, null, item.count)
        try { bot.chat(`/w s5der ✅ Returned ${item.count}x ${item.name}`) } catch(e){}
      } catch(err) {
        console.log('Failed to deposit item:', err)
        try { bot.chat(`/w s5der ❌ Failed to return ${item.name}: ${err.message}`) } catch(e){}
      }
    }
  }

  try { chest.close() } catch(e){}
}

}
}

;(async () => {
  await mongoConnect()
  await discord.login(process.env.TOKEN)

  console.log('✅ Discord bot ready. Minecraft bot will only start when you type $start')
})()
