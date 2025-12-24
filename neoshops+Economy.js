// =======================================================
// NeoShops + Economy System
// =======================================================
// This file handles:
// - Player shops using signs
// - GUI-based buying & selling
// - Server-wide persistent economy
// - Player commands (/bal, /pay)
// - Admin commands (/eco)
// - LuckPerms permission checks
//
// IMPORTANT:
// - This script is written for KubeJS 6 (1.20+)
// - Uses Rhino JavaScript
// - Safe for multiplayer servers
// =======================================================



// =======================================================
// CONFIGURATION SECTION
// =======================================================
// These are SAFE to edit

// Currency symbol shown in chat and GUIs
// Example: $, €, ¥, Coins, etc.
var CURRENCY = '$'

// Starting money for a player who has NEVER joined before
// This is ONLY applied once per UUID
var STARTING_BALANCE = 1000



// =======================================================
// SERVER-WIDE ECONOMY STORAGE (VERY IMPORTANT)
// =======================================================
// WHY THIS EXISTS:
// - player.persistentData can bug, reset, or duplicate
// - server.persistentData is GLOBAL and SAFE
//
// This stores ALL balances in ONE place:
// Utils.server.persistentData.balances
//
// Structure example:
// {
//   "uuid1": 1000,
//   "uuid2": 540,
//   "uuid3": 99999
// }

var Economy = {

  // Returns the server's persistent data container
  data() {
    return Utils.server.persistentData
  },

  // Ensures the balance map exists
  // This runs automatically before every get/set
  init() {
    var d = this.data()
    if (!d.contains('balances')) {
      d.put('balances', {})
    }
  },

  // Get a player's balance using their UUID
  // If player is new, they get STARTING_BALANCE
  get(uuid) {
    this.init()
    var balances = this.data().get('balances')

    if (balances[uuid] == null) {
      balances[uuid] = STARTING_BALANCE
    }

    return balances[uuid]
  },

  // Set a player's balance directly
  // Negative values are prevented
  set(uuid, amount) {
    if (amount < 0) amount = 0
    this.init()
    this.data().get('balances')[uuid] = amount
  },

  // Add or subtract money safely
  add(uuid, amount) {
    this.set(uuid, this.get(uuid) + amount)
  }
}



// =======================================================
// PERMISSIONS & OP CHECKS
// =======================================================
// LuckPerms permissions used:
//
// neoshops.player -> Can create player shops
// neoshops.admin  -> Can create admin shops + /eco commands
// neoshops.*      -> Full access (wildcard)
//
// OPs automatically bypass permissions

function isOp(player) {
  return player.hasGameRulePermission(4)
}

function hasPerm(player, permission) {
  if (isOp(player)) return true
  return player.hasPermission(permission)
}



// =======================================================
// PLAYER ECONOMY HELPERS
// =======================================================
// These functions are wrappers so the rest of the code
// never touches Economy directly

function getBalance(player) {
  return Economy.get(player.uuid)
}

function setBalance(player, value) {
  Economy.set(player.uuid, value)
}



// =======================================================
// SHOP DATA STORAGE
// =======================================================
// Each shop sign has BLOCK ENTITY DATA
//
// Structure:
// {
//   Owner: "player-uuid",
//   Items: [
//     { item: "minecraft:diamond", buy: 10, sell: 5 }
//   ]
// }

function getShopData(block) {
  var d = block.getEntityData()

  // Ensure Items list always exists
  if (!d.contains('Items')) {
    d.put('Items', [])
  }

  return d
}



// =======================================================
// SHOP GUI (THE CHEST INTERFACE)
// =======================================================
// mode = "edit" -> Owner editing prices
// mode = "use"  -> Player buying/selling

function openShop(player, block, mode) {

  var data = getShopData(block)
  var items = data.get('Items')

  // Chest behind the sign
  var chestBlock = block.offset(block.facing.opposite)

  // If NO chest exists → admin (infinite) shop
  var isAdminShop = !chestBlock.hasContainer()

  // Open a 54-slot chest GUI
  var gui = player.openChestGui(
    mode === 'edit' ? '§cEdit Shop' : '§6Shop',
    54
  )

  // Populate GUI slots
  for (var i = 0; i < items.length; i++) {
    var entry = items[i]

    gui.setSlot(i,
      Item.of(entry.item).withLore([
        '§eBuy: ' + CURRENCY + entry.buy,
        '§aSell: ' + CURRENCY + entry.sell,
        isAdminShop ? '§7Infinite Stock' : '§7Chest Stock',
        '§7Left Click = Buy',
        '§7Right Click = Sell',
        '§7Shift = x64'
      ])
    )
  }

  // ===================================================
  // GUI CLOSE (SAVE SHOP DATA)
  // ===================================================
  gui.onClose(function () {

    // Only save when editing
    if (mode !== 'edit') return

    var newItems = []

    for (var slot = 0; slot < 54; slot++) {
      var stack = gui.getSlot(slot)
      if (!stack || stack.isEmpty()) continue

      var buy = player.storedData.getInt('buy_' + slot)
      var sell = player.storedData.getInt('sell_' + slot)

      if (buy <= 0 && sell <= 0) continue

      newItems.push({
        item: stack.id,
        buy: buy,
        sell: sell
      })
    }

    data.put('Items', newItems)
    player.tell('§aShop saved.')
  })

  // ===================================================
  // GUI CLICK HANDLING (BUY / SELL)
  // ===================================================
  gui.onClick(function (slot, click) {

    var entry = items[slot]
    if (!entry) return

    var quantity = click.shift ? 64 : 1
    var balance = getBalance(player)

    // ---------- BUY ----------
    if (click.left && entry.buy > 0) {

      var cost = entry.buy * quantity
      if (balance < cost) {
        player.tell('§cNot enough money.')
        return
      }

      if (!isAdminShop) {
        if (chestBlock.inventory.count(entry.item) < quantity) {
          player.tell('§cOut of stock.')
          return
        }
        chestBlock.inventory.extract(entry.item, quantity)
      }

      player.give(quantity + ' ' + entry.item)
      setBalance(player, balance - cost)
      player.tell('§aBought ' + quantity + 'x ' + entry.item)
      return
    }

    // ---------- SELL ----------
    if (click.right && entry.sell > 0) {

      if (player.inventory.count(entry.item) < quantity) {
        player.tell('§cNot enough items.')
        return
      }

      if (!isAdminShop) {
        chestBlock.inventory.insert(entry.item, quantity)
      }

      player.inventory.extract(entry.item, quantity)
      setBalance(player, balance + (entry.sell * quantity))
      player.tell('§aSold ' + quantity + 'x ' + entry.item)
    }
  })
}



// =======================================================
// CHAT INPUT (SETTING PRICES)
// =======================================================
// Used ONLY when editing a shop
// Example:
//   buy 10
//   sell 5

PlayerEvents.chat(function (e) {

  var slot = e.player.storedData.getInt('priceSlot')
  if (slot < 0) return

  var parts = e.message.split(' ')
  if (parts.length !== 2) {
    e.player.tell('§cUse: buy <price> OR sell <price>')
    e.cancel()
    return
  }

  var type = parts[0]
  var price = parseInt(parts[1])

  if ((type !== 'buy' && type !== 'sell') || isNaN(price) || price < 0) {
    e.player.tell('§cUse: buy <price> OR sell <price>')
    e.cancel()
    return
  }

  e.player.storedData.putInt(type + '_' + slot, price)
  e.player.storedData.putInt('priceSlot', -1)
  e.player.tell('§aPrice set.')
  e.cancel()
})



// =======================================================
// SIGN INTERACTION (OPEN SHOP)
// =======================================================

BlockEvents.rightClicked(function (e) {

  var player = e.player
  var block = e.block

  if (!block.id.includes('sign')) return
  if (block.getSignText()[0].toLowerCase() !== '[shop]') return

  var owner = block.getEntityData().getString('Owner')
  var chestBlock = block.offset(block.facing.opposite)
  var isAdminShop = !chestBlock.hasContainer()

  if (isAdminShop && !hasPerm(player, 'neoshops.admin')) {
    player.tell('§cAdmin shop.')
    return
  }

  var canEdit = owner === player.uuid || hasPerm(player, 'neoshops.admin')

  if (player.isShiftKeyDown() && canEdit) {
    openShop(player, block, 'edit')
  } else {
    openShop(player, block, 'use')
  }
})



// =======================================================
// SIGN PLACEMENT (CREATE SHOP)
// =======================================================

BlockEvents.placed(function (e) {

  var player = e.player
  var block = e.block

  if (!block.id.includes('sign')) return
  if (block.getSignText()[0].toLowerCase() !== '[shop]') return

  var chestBlock = block.offset(block.facing.opposite)

  if (!chestBlock.hasContainer() && !hasPerm(player, 'neoshops.admin')) {
    player.tell('§cOnly admins may create infinite shops.')
    block.set('minecraft:air')
    player.give('minecraft:oak_sign')
    return
  }

  if (chestBlock.hasContainer() && !hasPerm(player, 'neoshops.player')) {
    player.tell('§cNo permission to create player shops.')
    block.set('minecraft:air')
    player.give('minecraft:oak_sign')
    return
  }

  block.setEntityData({
    Owner: player.uuid,
    Items: []
  })

  player.tell('§aShop created.')
})



// =======================================================
// COMMANDS (WITH TAB COMPLETION)
// =======================================================

ServerEvents.commandRegistry(function (e) {

  var C = e.commands
  var A = e.arguments

  // ---------- /bal & /balance ----------
  function showBal(ctx) {
    ctx.source.player.tell(
      '§eBalance: ' + CURRENCY + getBalance(ctx.source.player)
    )
    return 1
  }

  e.register(C.literal('bal').executes(showBal))
  e.register(C.literal('balance').executes(showBal))


  // ---------- /pay <player> <amount> ----------
  e.register(
    C.literal('pay')
      .then(
        A.PLAYER('target')
          .then(
            A.INTEGER('amount')
              .executes(function (ctx) {

                var sender = ctx.source.player
                var target = ctx.get('target')
                var amount = ctx.get('amount')

                if (amount <= 0 || getBalance(sender) < amount) {
                  sender.tell('§cInvalid amount.')
                  return 0
                }

                setBalance(sender, getBalance(sender) - amount)
                setBalance(target, getBalance(target) + amount)

                sender.tell('§aPaid ' + CURRENCY + amount + ' to ' + target.name)
                target.tell('§aReceived ' + CURRENCY + amount + ' from ' + sender.name)
                return 1
              })
          )
      )
  )


  // ---------- /eco ADMIN COMMANDS ----------
  function ecoPerm(ctx) {
    if (!hasPerm(ctx.source.player, 'neoshops.admin')) {
      ctx.source.player.tell('§cNo permission.')
      return false
    }
    return true
  }

  e.register(
    C.literal('eco')

      .then(C.literal('give')
        .then(A.PLAYER('target')
          .then(A.INTEGER('amount')
            .executes(ctx => {
              if (!ecoPerm(ctx)) return 0
              Economy.add(ctx.get('target').uuid, ctx.get('amount'))
              return 1
            })
          )
        )
      )

      .then(C.literal('take')
        .then(A.PLAYER('target')
          .then(A.INTEGER('amount')
            .executes(ctx => {
              if (!ecoPerm(ctx)) return 0
              Economy.add(ctx.get('target').uuid, -ctx.get('amount'))
              return 1
            })
          )
        )
      )

      .then(C.literal('set')
        .then(A.PLAYER('target')
          .then(A.INTEGER('amount')
            .executes(ctx => {
              if (!ecoPerm(ctx)) return 0
              Economy.set(ctx.get('target').uuid, ctx.get('amount'))
              return 1
            })
          )
        )
      )

      .then(C.literal('bal')
        .then(A.PLAYER('target')
          .executes(ctx => {
            if (!ecoPerm(ctx)) return 0
            ctx.source.player.tell(
              ctx.get('target').name + ': ' +
              CURRENCY + Economy.get(ctx.get('target').uuid)
            )
            return 1
          })
        )
      )
  )
})
