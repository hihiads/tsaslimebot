const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder')
const mcData = require('minecraft-data')('1.20.4')
const Vec3 = require('vec3')

const bot = mineflayer.createBot({
  host: '8b8t.me',
  username: 's5555der',
  version: '1.20.4'
})

const WHITELIST = ['s5555der','MarlboroBOT','Sniptoes','BrockD322','s5der','Malbacoo', "SlimeBOT"]
const KILL_RANGE = 32

bot.loadPlugin(pathfinder)

bot.once('spawn', () => {
  bot.chat('/login nigger') // zamijeni password po potrebi
  console.log('✅ Bot logged in.')

  // Automatski ide home
  setTimeout(() => {
    bot.chat('/home stash')
    console.log('🏠 Bot went to home stash')
  }, 2000) // mali delay da server registruje login

  // svaki put kada dobije item oprema armor
  bot.on('playerCollect', () => equipArmor())
  bot.on('playerCollect', () => equipSword())

  // provjerava okolo svaki 1s za igrače i TNT
  setInterval(checkNearbyEntities, 1000)
})

// Komanda $$$sethome bot šalje /sethome stash
bot.on('message', (msg) => {
    const text = msg.toString().trim()

    // Ako netko pošalje $$$sethome bot
    if (text.includes('$$$sethome bot')) {
      bot.chat('/sethome stash')
      console.log('⚙️ Bot executed /sethome stash')
    }
})


// Equip sword u ruci
function equipSword() {
  const sword = bot.inventory.items().find(i => i.name.includes('sword'))
  if (sword) bot.equip(sword, 'hand').catch(()=>{})
}

// Equip armor automatski
function equipArmor() {
  const slots = { helmet: 'head', chestplate: 'torso', leggings: 'legs', boots: 'feet' }
  for (const key in slots) {
    const slotName = slots[key]
    const bestArmor = bot.inventory.items().filter(i => i.name.includes(key)).pop()
    if (bestArmor) bot.equip(bestArmor, slotName).catch(()=>{})
  }
}

// Kill aura + pathfinder
function checkNearbyEntities() {
  const target = Object.values(bot.players)
    .map(p => p.entity)
    .filter(e => e && !WHITELIST.includes(e.username))
    .filter(e => bot.entity.position.distanceTo(e.position) <= KILL_RANGE)
    .sort((a,b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))[0]

  if (target) {
    const movements = new Movements(bot, mcData)
    bot.pathfinder.setMovements(movements)
    bot.pathfinder.setGoal(new GoalNear(target.position.x, target.position.y, target.position.z, 1))

    equipSword()
    bot.attack(target)
  }

  // TNT miner
  const tnt = Object.values(bot.entities)
    .filter(e => e.name === 'tnt' && bot.entity.position.distanceTo(e.position) < 16)[0]

  if (tnt) {
    const movements = new Movements(bot, mcData)
    bot.pathfinder.setMovements(movements)
    bot.pathfinder.setGoal(new GoalNear(tnt.position.x, tnt.position.y, tnt.position.z, 1))
    const block = bot.blockAt(tnt.position)
    if (block) bot.dig(block).catch(()=>{})
  }
}

// Reset pathfinder kada se smiri
bot.on('physicTick', () => {
  if (!bot.target || !bot.target.entity) bot.pathfinder.setGoal(null)
})

bot.on('error', err => console.log('❌ Error:', err))
bot.on('end', () => setTimeout(()=>bot.quit(), 5000))
