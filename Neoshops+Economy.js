// =======================================================
// NeoShops – Sign Based Economy System (FIXED)
// NeoForge 21.1.215 | MC 1.21.1 | ATM10 5.4
// KubeJS 6 | Rhino-safe
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
  d.put('balances', b) // ← FIX: Save changes back to persistent data
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
  Utils.server.persistentData.put('shops', registry) // ← FIX: Ensure persistence
}

function getShop(id) {
  return shopRegistry()[id]
}

function deleteShop(id) {
  var registry = shopRegistry()
  delete registry[id]
  Utils.server.persistentData.put('shops', registry) // ← FIX: Ensure persistence
}

function updateShop(id, data) {
  var registry = shopRegistry()
  registry[id] = data
  Utils.server.persistentData.put('shops', registry) // ← FIX: Ensure persistence
}

// =======================================================
// PLAYER ARMING STATE
// =======================================================

function armShop(player, admin) {
  player.persistentData.putBoolean('shop_arm', true)
  player.persistentData.putBoolean('shop_admin', admin)
}

// =======================================================
// SIGN PLACEMENT (CREATE SHOP)
// =======================================================

BlockEvents.placed(function (e) {
  var player = e.player
  var block = e.block

  if (!block.id.includes('sign')) return
  if (!player.persistentData.getBoolean('shop_arm')) return

  player.persistentData.putBoolean('shop_arm', false)

  var admin = player.persistentData.getBoolean('shop_admin')
  player.persistentData.putBoolean('shop_admin', false)

  if (admin && !hasPerm(player, 'neoshops.admin')) {
    player.tell('§cNo permission.')
    return
  }

  var text = block.getSignText()
  var mode = text[0] ? text[0].trim().toUpperCase() : '' // ← FIX: Added trim()

  if (mode !== 'BUY' && mode !== 'SELL') {
    player.tell('§cLine 1 must be BUY or SELL.')
    return
  }

  var item = text[2] ? text[2].trim() : '' // ← FIX: Added trim() and null check
  var price = parseInt(text[3])

  if (!item || item.length === 0 || isNaN(price) || price <= 0) {
    player.tell('§cInvalid item or price.')
    return
  }

  if (!admin) {
    var back = block.offset(block.getFacing().getOpposite())
    if (!back.hasContainer()) {
      player.tell('§cPlayer shops require a chest or barrel behind the sign.')
      return
    }
  }

  var id = block.pos.toShortString()

  registerShop(id, {
    owner: player.uuid,
    admin: admin,
    mode: mode,
    item: item,
    price: price,
    pos: id
  })

  player.tell('§aShop created successfully.')
})

// =======================================================
// SHOP INTERACTION (RIGHT CLICK)
// =======================================================

BlockEvents.rightClicked(function (e) {
  var block = e.block
  var player = e.player

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
    // Player is buying from shop
    var balance = Economy.get(player.uuid)
    if (balance < cost) {
      player.tell('§cNot enough money. Need: ' + CURRENCY + cost + ', Have: ' + CURRENCY + balance)
      return
    }

    if (!shop.admin) {
      var back = block.offset(block.getFacing().getOpposite())
      // ← FIX: Check container still exists
      if (!back.hasContainer()) {
        player.tell('§cShop chest is missing.')
        return
      }
      if (back.inventory.count(shop.item) < qty) {
        player.tell('§cNot enough stock. Available: ' + back.inventory.count(shop.item))
        return
      }
      back.inventory.extract(shop.item, qty)
    }

    Economy.add(player.uuid, -cost)
    player.give(qty + ' ' + shop.item)
    player.tell('§aPurchased ' + qty + 'x ' + shop.item + ' for ' + CURRENCY + cost)

  } else {
    // Player is selling to shop
    if (player.inventory.count(shop.item) < qty) {
      player.tell('§cYou need ' + qty + 'x ' + shop.item + '. You have: ' + player.inventory.count(shop.item))
      return
    }

    if (!shop.admin) {
      var back2 = block.offset(block.getFacing().getOpposite())
      // ← FIX: Check container still exists
      if (!back2.hasContainer()) {
        player.tell('§cShop chest is missing.')
        return
      }
      // ← FIX: Check if chest has space
      var currentCount = back2.inventory.count(shop.item)
      var capacity = back2.inventory.getSlots() * 64 // Rough estimate
      if (currentCount + qty > capacity) {
        player.tell('§cShop chest is too full.')
        return
      }
      back2.inventory.insert(shop.item, qty)
    }

    player.inventory.extract(shop.item, qty)
    Economy.add(player.uuid, cost)
    player.tell('§aSold ' + qty + 'x ' + shop.item + ' for ' + CURRENCY + cost)
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

ServerEvents.commandRegistry(function (e) {
  var C = e.commands
  var A = e.arguments

  // ---------- BALANCE ----------
  e.register(C.literal('bal').executes(function (ctx) {
    ctx.source.player.tell(
      '§eBalance: ' + CURRENCY + Economy.get(ctx.source.player.uuid)
    )
    return 1
  }))

  // ---------- PAY ----------
  e.register(
    C.literal('pay')
      .then(A.STRING('target')
        .then(A.INTEGER('amount')
          .executes(function (ctx) {
            var s = ctx.source.player
            var t = ctx.source.server.getPlayer(ctx.get('target'))
            var a = ctx.get('amount')
            
            if (!t) {
              s.tell('§cPlayer not found.')
              return 0
            }
            if (a <= 0) {
              s.tell('§cAmount must be positive.')
              return 0
            }
            if (Economy.get(s.uuid) < a) {
              s.tell('§cNot enough money.')
              return 0
            }
            
            Economy.add(s.uuid, -a)
            Economy.add(t.uuid, a)
            s.tell('§aSent ' + CURRENCY + a + ' to ' + t.username)
            t.tell('§aReceived ' + CURRENCY + a + ' from ' + s.username)
            return 1
          })
        )
      )
  )

  // ---------- SHOP CREATE ----------
  e.register(C.literal('shopadd').executes(function (ctx) {
    armShop(ctx.source.player, false)
    ctx.source.player.tell('§ePlace a sign to create a player shop.')
    return 1
  }))

  e.register(C.literal('shopaddadmin').executes(function (ctx) {
    if (!hasPerm(ctx.source.player, 'neoshops.admin')) {
      ctx.source.player.tell('§cNo permission.')
      return 0
    }
    armShop(ctx.source.player, true)
    ctx.source.player.tell('§ePlace a sign to create an admin shop.')
    return 1
  }))

  // ---------- SHOP REMOVE ----------
  e.register(C.literal('shopremove').executes(function (ctx) {
    var player = ctx.source.player
    var res = getLookShop(player)
    if (!res) {
      player.tell('§cNo shop targeted. Look at a shop sign.')
      return 0
    }
    if (res.shop.owner !== player.uuid && !hasPerm(player, 'neoshops.admin')) {
      player.tell('§cYou do not own this shop.')
      return 0
    }
    deleteShop(res.id) // ← FIX: Use proper delete function
    player.tell('§aShop removed.')
    return 1
  }))

  // ---------- SHOP EDIT ----------
  e.register(C.literal('shopedit').executes(function (ctx) {
    var player = ctx.source.player
    var res = getLookShop(player)
    if (!res) {
      player.tell('§cNo shop targeted. Look at a shop sign.')
      return 0
    }
    if (res.shop.owner !== player.uuid && !hasPerm(player, 'neoshops.admin')) {
      player.tell('§cYou do not own this shop.')
      return 0
    }

    var text = res.block.getSignText()
    var mode = text[0] ? text[0].trim().toUpperCase() : ''
    var item = text[2] ? text[2].trim() : ''
    var price = parseInt(text[3])

    if (mode !== 'BUY' && mode !== 'SELL') {
      player.tell('§cLine 1 must be BUY or SELL.')
      return 0
    }

    if (!item || item.length === 0 || isNaN(price) || price <= 0) {
      player.tell('§cInvalid item or price.')
      return 0
    }

    // ← FIX: Use proper update function preserving all data
    updateShop(res.id, {
      owner: res.shop.owner,
      admin: res.shop.admin,
      mode: mode,
      item: item,
      price: price,
      pos: res.shop.pos
    })

    player.tell('§aShop updated.')
    return 1
  }))

  // ---------- LIST SHOPS ----------
  e.register(C.literal('listshops').executes(function (ctx) {
    var uuid = ctx.source.player.uuid
    var shops = shopRegistry()
    var count = 0
    for (var k in shops) {
      if (shops[k].owner === uuid) {
        ctx.source.player.tell('§7' + shops[k].mode + ' ' + shops[k].item + ' @ ' + CURRENCY + shops[k].price)
        count++
      }
    }
    if (count === 0) {
      ctx.source.player.tell('§7You have no shops.')
    }
    return 1
  }))

  e.register(C.literal('shopspublic').executes(function (ctx) {
    var shops = shopRegistry()
    var count = 0
    for (var k in shops) {
      ctx.source.player.tell(
        '§7' + shops[k].mode + ' ' + shops[k].item + ' @ ' + CURRENCY + shops[k].price + (shops[k].admin ? ' §e[ADMIN]' : '')
      )
      count++
    }
    if (count === 0) {
      ctx.source.player.tell('§7No shops available.')
    }
    return 1
  }))
})