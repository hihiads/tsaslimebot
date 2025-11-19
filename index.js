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
const config = JSON.parse(fs.readFileSync('./config.json'))

// --- MONGO ---
if (!process.env.MONGO_URI) {
  console.error("Bruv, MONGO_URI ain't set innit!")
  process.exit(1)
}

if (!process.env.MONGO_DB) {
  console.error("Fam, MONGO_DB ain't set innit!")
  process.exit(1)
}

const mongoClient = new MongoClient(process.env.MONGO_URI)
let linksCollection

async function mongoConnect() {
  await mongoClient.connect()
  const db = mongoClient.db(process.env.MONGO_DB)
  linksCollection = db.collection(config.mongoCollection)
  console.log('✅ Mongo connected blud')
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

discord.once('ready', () => console.log(`🤖 Discord live fam as ${discord.user.tag}`))

const ALLOWED_IDS = ['990626592474677349', '1241862272234688523']
let botRunning = false

discord.on('messageCreate', async msg => {
  if (msg.author.bot) return
  const content = msg.content.trim()

  // --- PING ---
  if (content === '$ping') return msg.reply('🏓 Yo wagwan, pong innit!')

  // --- START BOT ---
  if (content === '$start') {
    if (!ALLOWED_IDS.includes(msg.author.id)) return msg.reply('❌ Bruv u ain’t allowed fam.')
    if (botRunning) return msg.reply('⚠️ Yo fam, bot already runnin innit.')
    try { startBot(); botRunning = true; msg.reply('✅ Bot up n runnin bruv!') } 
    catch(err) { msg.reply(`❌ Bruv error: ${err.message}`) }
  }

  // --- STOP BOT ---
  if (content === '$stop') {
    if (!ALLOWED_IDS.includes(msg.author.id)) return msg.reply('❌ Ain’t ur ting bruv.')
    if (!botRunning || !bot) return msg.reply('⚠️ Bot ain’t online fam.')
    try { bot.quit('Stopped via Discord command.'); botRunning = false; msg.reply('🛑 Bot off innit.') } 
    catch(err) { msg.reply(`❌ Error blud: ${err.message}`) }
  }

  // --- LINK ---
  if (content.startsWith('$link')) {
    const args = content.split(/\s+/)
    if (args.length < 2) return msg.reply('❗ Yo fam, use `$link <code>` bruv.')
    const code = args[1].toUpperCase()
    
    const doc = await linksCollection.findOne({ code })
    if (!doc) return msg.reply('❌ Code nah exist blud.')
    if (doc.used) return msg.reply('❌ Code done been used innit.')
    if (doc.expiresAt && doc.expiresAt < new Date()) return msg.reply('⏰ Code expired fam.')

    // check if Discord user already linked
    const existingLink = await linksCollection.findOne({ discordId: msg.author.id })
    if (existingLink) return msg.reply(`❌ Yo bruv, ur Discord already linked to ${existingLink.mcUsername}.`)

    await linksCollection.updateOne(
      { _id: doc._id },
      { $set: { used: true, discordId: msg.author.id, linkedAt: new Date() } }
    )
    msg.reply(`✅ Linked innit! Your Minecraft account **${doc.mcUsername}** now got Discord fam.`)

    try {
      if (global.minebot?.players[doc.mcUsername]) {
        global.minebot.chat(`/w ${doc.mcUsername} Yo wagwan, ur Discord (${msg.author.tag}) linked bruv!`)
      }
    } catch(err) { console.log('⚠️ Whisper fail fam:', err.message) }
  }

  // --- STATUS ---
  if (content === '$status') {
    if (!global.minebot) return msg.reply('❌ Bot ain’t online fam.')
    const bot = global.minebot
    let response = `🤖 **Minecraft Bot Status**\n`
    response += `🟢 Bot: **${bot.username}**\n`
    response += `📡 Ping: **${bot.player?.ping || 'N/A'} ms**\n`
    msg.reply(response)
  }

  // --- SEND MSG ---
  if (content.startsWith('$send')) {
    if (!ALLOWED_IDS.includes(msg.author.id)) return msg.reply('❌ Nah bruv, u can’t send.')
    const messageToSend = content.replace('$send', '').trim()
    if (!messageToSend) return msg.reply('⚠️ Use `$send <msg>` fam.')
    if (!global.minebot) return msg.reply('❌ Bot offline bruv.')
    try { global.minebot.chat(messageToSend); msg.reply(`✅ Sent to MC: \`${messageToSend}\``) } 
    catch(err) { msg.reply(`❌ Error fam: ${err.message}`) }
  }

  // --- WHOIS (Discord -> MC) ---
  if (content.startsWith('$whois')) {
    const mention = msg.mentions.users.first()
    if (!mention) return msg.reply('❗ Mention a Discord user fam.')
    const doc = await linksCollection.findOne({ discordId: mention.id })
    if (!doc) return msg.reply('❌ This Discord ain’t linked to no Minecraft account bruv.')
    msg.reply(`✅ ${mention.tag} linked to MC: ${doc.mcUsername}`)
  }

  // --- MC (MC -> Discord) ---
  if (content.startsWith('$mc')) {
    const args = content.split(/\s+/)
    if (args.length < 2) return msg.reply('❗ Use `$mc <MC username>` fam.')
    const username = args[1]
    const doc = await linksCollection.findOne({ mcUsername: username })
    if (!doc) return msg.reply('❌ MC account ain’t linked to any Discord blud.')
    msg.reply(`✅ MC ${username} linked to Discord: <@${doc.discordId}>`)
  }
})

// --- HELPERS ---
function generateHexCode() { return crypto.randomBytes(3).toString('hex').toUpperCase() }
async function createLinkForMcPlayer(mcUsername) {
  const code = generateHexCode()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + config.linkTtlMinutes*60*1000)
  const doc = {
    mcUsername,
    code,
    createdAt: now,
    expiresAt,
    used: false,
    discordId: null,
    linkedAt: null
  }
  await linksCollection.insertOne(doc)
  return { code, expiresAt }
}

global.createLinkForMcPlayer = createLinkForMcPlayer
global.minebot = null

// --- MC BOT ---
let bot = null
const BLACKLIST = ['IceBox','Clife2013','miktyluchitun','clownperice132','badbad_con','panana777','DEMOMAX','hadi09','progameingYT','Cauazingg_']
const CHESTS = {
  pvp: new Vec3(29999983, -59, -6517),
  build: new Vec3(29999983, -59, -6519),
  shulker: new Vec3(29999983, -59, -6521),
  raid: new Vec3(29999983, -59, -6523),
  invis: new Vec3(29999983, -59, -6525),
  quartz: new Vec3(29999983, -59, -6529),
  redstone: new Vec3(29999983, -59, -6533),
}
let playerCooldowns = {}
const DELIVERY_COOLDOWN = 120*1000
let delivering = false

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
  // odmah nakon bot.loadPlugin(pathfinder)
const kitMessages = [
  'Need a kit? Type $kit list.',
  'Bot is coord logger free. We value your privacy.',
  'Want some gear? $kit tools!',
  'Grab your PvP kit with $kit pvp.',
  'Get ready! $kit list for your adventure.',
  'Time for some action! $kit list now.',
  'Made by s5der. $kit list to see available kits!',
  'If you see this message you are cool.',
  'Join The Slime Avengory on dsc,gg/supremeslime',
  'Do not spam commands, you are gonna get blacklisted.',
  '$kit pvp, for PvP gear.',
  'Special thanks to Sniptoes, Malbacoo, Brock and Tyler for making this possible!',
  '$kit invis to order invisibility gear.',
  '$kit raid to get raid gear.',
  '$kit shulker to get shulker boxes.',
];

let messageIntervalStarted = false;

bot.on('spawn', () => {
  if (messageIntervalStarted) return;
  messageIntervalStarted = true;

  setInterval(() => {
    const msg = kitMessages[Math.floor(Math.random() * kitMessages.length)];
    bot.chat(msg);
  }, 25 * 1000);
  bot.chat("/login nigger")
});


  bot.on('death', () => {
    setTimeout(() => {
      try {
        bot.chat("/home stash")
        console.log("Bot is home!")
      } catch (e) { /* ignore if can't chat while dead */ }
      bot.once('spawn', () => {})
    }, 2000)
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

    const availableKits = ['pvp','tools', 'build','shulker','raid','invis', 'redstone','quartz']
    if (text.includes('$kit list')) bot.chat(`/w ${username} 📦 Available kits: ${availableKits.join(', ')}`)

    if (text.includes('$kit pvp')) deliverKit(username,'pvp')
      if (text.includes('$kit build')) deliverKit(username,'build')
    if (text.includes('$kit raid')) deliverKit(username,'raid')
      if (text.includes('$kit invis')) deliverKit(username,'invis')
    if (text.includes('$kit shulker')) deliverKit(username,'shulker')
      if (text.includes('$kit quartz')) deliverKit(username,'quartz')
    if (text.includes('$kit redstone')) deliverKit(username,'redstone')
   

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

