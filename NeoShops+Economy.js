// =======================================================
// NeoShops – Book-Based Economy System
// NeoForge 21.1.215 | MC 1.21.1 | ATM10 5.4
// KubeJS 6 | Book & Quill Configuration
// =======================================================

// ---------------- CONFIG ----------------
var CURRENCY = '$'
var STARTING_BALANCE = 1000
var RAY_DISTANCE = 5
// ---------------------------------------

// =======================================================
// ECONOMY (SERVER PERSISTENT)
// =======================================================

var Economy = {}

Economy.data = function () {
  return Utils.server.persistentData
}

Economy.init = function () {
  var d = this.data()
  if (!d.contains('balances')) d.put('balances', {})
}

Economy.get = function (uuid) {
  this.init()
  var b = this.data().get('balances')
  if (b[uuid] == null) b[uuid] = STARTING_BALANCE
  return b[uuid]
}

Economy.add = function (uuid, amount) {
  this.init()
  var d = this.data()
  var b = d.get('balances')
  var v = b[uuid] == null ? STARTING_BALANCE : b[uuid]
  v += amount
  if (v < 0) v = 0
  b[uuid] = v
  d.put('balances', b)
}

// =======================================================
// PERMISSIONS
// =======================================================

function isOp(player) {
  return player.isOp()
}

function hasPerm(player, perm) {
  if (isOp(player)) return true
  if (player.hasPermission('neoshops.*')) return true
  return player.hasPermission(perm)
}

// =======================================================
// SHOP REGISTRY (SERVER PERSISTENT)
// =======================================================

function shopRegistry() {
  var d = Utils.server.persistentData
  if (!d.contains('shops')) d.put('shops', {})
  return d.get('shops')
}

function registerShop(id, data) {
  var registry = shopRegistry()
  registry[id] = data
  Utils.server.persistentData.put('shops', registry)
}

function getShop(id) {
  return shopRegistry()[id]
}

function deleteShop(id) {
  var registry = shopRegistry()
  delete registry[id]
  Utils.server.persistentData.put('shops', registry)
}

// =======================================================
// BOOK PARSING
// =======================================================

function parseBookConfig(book) {
  // Book format:
  // Line 1: BUY or SELL
  // Line 2: item_id (e.g. minecraft:diamond or allthemodium:vibranium)
  // Line 3: price (e.g. 100)
  
  if (!book || book.id !== 'minecraft:writable_book') return null
  
  var pages = book.nbt?.pages
  if (!pages || pages.length === 0) return null
  
  var firstPage = String(pages[0])
  var lines = firstPage.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  
  if (lines.length < 3) return null
  
  var mode = lines[0].toUpperCase()
  var item = lines[1]
  var price = parseInt(lines[2])
  
  if (mode !== 'BUY' && mode !== 'SELL') return null
  if (!item || item.length === 0) return null
  if (isNaN(price) || price <= 0) return null
  
  return {
    mode: mode,
    item: item,
    price: price
  }
}

function getItemDisplayName(itemId) {
  // Shorten long mod item names for sign display
  var parts = itemId.split(':')
  if (parts.length !== 2) return itemId
  
  var namespace = parts[0]
  var itemName = parts[1]
  
  // Remove underscores and capitalize
  var display = itemName.replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
  
  // Limit to 15 characters for sign
  if (display.length > 15) {
    display = display.substring(0, 12) + '...'
  }
  
  return display
}

// =======================================================
// SIGN PLACEMENT (CREATE SHOP)
// =======================================================

BlockEvents.placed(event => {
  var player = event.player
  var block = event.block

  if (!block.id.includes('sign')) return
  if (!player.persistentData.getBoolean('shop_arm')) return

  player.persistentData.putBoolean('shop_arm', false)

  var admin = player.persistentData.getBoolean('shop_admin')
  player.persistentData.putBoolean('shop_admin', false)

  if (admin && !hasPerm(player, 'neoshops.admin')) {
    player.tell('§cNo permission.')
    return
  }

  // Get chest behind sign
  var back = block.offset(block.properties.facing.getOpposite())
  if (!back.hasContainer()) {
    player.tell('§cSign must be placed on a chest or barrel.')
    return
  }

  // Find book in chest
  var inv = back.inventory
  var book = null
  
  for (var i = 0; i < inv.size; i++) {
    var item = inv.getStackInSlot(i)
    if (item && item.id === 'minecraft:writable_book') {
      book = item
      break
    }
  }

  if (!book && !admin) {
    player.tell('§cNo writable book found in chest. Add a book with shop config.')
    return
  }

  var config = null
  
  if (admin) {
    // Admin shops can work without book (use sign text as fallback)
    if (book) {
      config = parseBookConfig(book)
    }
    if (!config) {
      player.tell('§cAdmin shop created but needs book config to function.')
      var id = block.pos.toShortString()
      registerShop(id, {
        owner: player.uuid.toString(),
        admin: true,
        mode: 'BUY',
        item: 'minecraft:air',
        price: 1,
        pos: id
      })
      return
    }
  } else {
    config = parseBookConfig(book)
    if (!config) {
      player.tell('§cInvalid book format. Use:\nLine 1: BUY or SELL\nLine 2: item:id\nLine 3: price')
      return
    }
  }

  var id = block.pos.toShortString()

  registerShop(id, {
    owner: player.uuid.toString(),
    admin: admin,
    mode: config.mode,
    item: config.item,
    price: config.price,
    pos: id
  })

  // Update sign text to show item
  var displayName = getItemDisplayName(config.item)
  var signText = [
    '{"text":"' + config.mode + '"}',
    '{"text":"' + displayName + '"}',
    '{"text":"' + CURRENCY + config.price + '"}',
    '{"text":"R-Click"}'
  ]
  
  block.entityData.front_text.messages = signText
  block.mergeNbt(block.entityData)

  player.tell('§aShop created: ' + config.mode + ' ' + displayName + ' for ' + CURRENCY + config.price)
})

// =======================================================
// SHOP INTERACTION (RIGHT CLICK)
// =======================================================

BlockEvents.rightClicked(event => {
  var block = event.block
  var player = event.player

  if (!block.id.includes('sign')) return

  var shop = getShop(block.pos.toShortString())
  if (!shop) return

  if (shop.admin && !hasPerm(player, 'neoshops.player')) {
    player.tell('§cNo permission to use admin shops.')
    return
  }

  var qty = player.isShiftKeyDown() ? 64 : 1
  var cost = shop.price * qty

  if (shop.mode === 'BUY') {
    var balance = Economy.get(player.uuid.toString())
    if (balance < cost) {
      player.tell('§cNeed ' + CURRENCY + cost + ', have ' + CURRENCY + balance)
      return
    }

    if (!shop.admin) {
      var back = block.offset(block.properties.facing.getOpposite())
      if (!back.hasContainer()) {
        player.tell('§cShop chest missing.')
        return
      }
      if (back.inventory.count(shop.item) < qty) {
        player.tell('§cOut of stock (' + back.inventory.count(shop.item) + ' available)')
        return
      }
      back.inventory.extract(shop.item, qty)
    }

    Economy.add(player.uuid.toString(), -cost)
    player.give(Item.of(shop.item, qty))
    player.tell('§aBought ' + qty + 'x for ' + CURRENCY + cost)

  } else {
    if (player.inventory.count(shop.item) < qty) {
      player.tell('§cYou need ' + qty + 'x (have ' + player.inventory.count(shop.item) + ')')
      return
    }

    if (!shop.admin) {
      var back2 = block.offset(block.properties.facing.getOpposite())
      if (!back2.hasContainer()) {
        player.tell('§cShop chest missing.')
        return
      }
      back2.inventory.insert(shop.item, qty)
    }

    player.inventory.extract(shop.item, qty)
    Economy.add(player.uuid.toString(), cost)
    player.tell('§aSold ' + qty + 'x for ' + CURRENCY + cost)
  }
})

// =======================================================
// HELPER: SHOP PLAYER IS LOOKING AT
// =======================================================

function getLookShop(player) {
  var hit = player.rayTrace(RAY_DISTANCE)
  if (!hit || !hit.block) return null
  var block = hit.block
  if (!block.id.includes('sign')) return null
  var id = block.pos.toShortString()
  var shop = getShop(id)
  if (!shop) return null
  return { block: block, shop: shop, id: id }
}

// =======================================================
// COMMANDS
// =======================================================

ServerEvents.commandRegistry(event => {
  const { commands: Commands, arguments: Arguments } = event

  // ---------- BALANCE ----------
  event.register(
    Commands.literal('bal')
      .executes(ctx => {
        let player = ctx.source.player
        player.tell('§eBalance: ' + CURRENCY + Economy.get(player.uuid.toString()))
        return 1
      })
  )

  // ---------- PAY ----------
  event.register(
    Commands.literal('pay')
      .then(
        Commands.argument('target', Arguments.PLAYER.create(event))
          .then(
            Commands.argument('amount', Arguments.INTEGER.create(event))
              .executes(ctx => {
                let sender = ctx.source.player
                let target = Arguments.PLAYER.getResult(ctx, 'target')
                let amount = Arguments.INTEGER.getResult(ctx, 'amount')

                if (!target) {
                  sender.tell('§cPlayer not found.')
                  return 0
                }
                if (amount <= 0) {
                  sender.tell('§cAmount must be positive.')
                  return 0
                }
                if (Economy.get(sender.uuid.toString()) < amount) {
                  sender.tell('§cNot enough money.')
                  return 0
                }

                Economy.add(sender.uuid.toString(), -amount)
                Economy.add(target.uuid.toString(), amount)
                sender.tell('§aSent ' + CURRENCY + amount + ' to ' + target.username)
                target.tell('§aReceived ' + CURRENCY + amount + ' from ' + sender.username)
                return 1
              })
          )
      )
  )

  // ---------- SHOP CREATE ----------
  event.register(
    Commands.literal('shopadd')
      .executes(ctx => {
        ctx.source.player.persistentData.putBoolean('shop_arm', true)
        ctx.source.player.persistentData.putBoolean('shop_admin', false)
        ctx.source.player.tell('§ePlace a sign on a chest with a book inside.')
        return 1
      })
  )

  event.register(
    Commands.literal('shopaddadmin')
      .executes(ctx => {
        if (!hasPerm(ctx.source.player, 'neoshops.admin')) {
          ctx.source.player.tell('§cNo permission.')
          return 0
        }
        ctx.source.player.persistentData.putBoolean('shop_arm', true)
        ctx.source.player.persistentData.putBoolean('shop_admin', true)
        ctx.source.player.tell('§ePlace a sign on a chest with a book inside.')
        return 1
      })
  )

  // ---------- SHOP REMOVE ----------
  event.register(
    Commands.literal('shopremove')
      .executes(ctx => {
        let player = ctx.source.player
        let res = getLookShop(player)
        if (!res) {
          player.tell('§cNo shop targeted. Look at a shop sign.')
          return 0
        }
        if (res.shop.owner !== player.uuid.toString() && !hasPerm(player, 'neoshops.admin')) {
          player.tell('§cYou do not own this shop.')
          return 0
        }
        deleteShop(res.id)
        player.tell('§aShop removed.')
        return 1
      })
  )

  // ---------- SHOP INFO ----------
  event.register(
    Commands.literal('shopinfo')
      .executes(ctx => {
        let player = ctx.source.player
        let res = getLookShop(player)
        if (!res) {
          player.tell('§cNo shop targeted.')
          return 0
        }
        player.tell('§e--- Shop Info ---')
        player.tell('§7Mode: ' + res.shop.mode)
        player.tell('§7Item: ' + res.shop.item)
        player.tell('§7Price: ' + CURRENCY + res.shop.price)
        player.tell('§7Admin: ' + (res.shop.admin ? 'Yes' : 'No'))
        return 1
      })
  )

  // ---------- LIST SHOPS ----------
  event.register(
    Commands.literal('listshops')
      .executes(ctx => {
        let uuid = ctx.source.player.uuid.toString()
        let shops = shopRegistry()
        let count = 0
        for (let k in shops) {
          if (shops[k].owner === uuid) {
            ctx.source.player.tell('§7' + shops[k].mode + ' ' + shops[k].item + ' @ ' + CURRENCY + shops[k].price)
            count++
          }
        }
        if (count === 0) {
          ctx.source.player.tell('§7You have no shops.')
        }
        return 1
      })
  )

  event.register(
    Commands.literal('shopspublic')
      .executes(ctx => {
        let shops = shopRegistry()
        let count = 0
        for (let k in shops) {
          ctx.source.player.tell(
            '§7' + shops[k].mode + ' ' + shops[k].item + ' @ ' + CURRENCY + shops[k].price + (shops[k].admin ? ' §e[ADMIN]' : '')
          )
          count++
        }
        if (count === 0) {
          ctx.source.player.tell('§7No shops available.')
        }
        return 1
      })
  )
})