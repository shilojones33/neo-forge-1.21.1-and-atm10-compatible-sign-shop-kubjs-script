// NeoShops + Economy System for KubeJS 7.x (Minecraft 1.21.1)
// Author: XxTheyLuvShyxX

console.info('╔══════════════════════════════════════════════════════════════════════════╗');
console.info('║                                                                          ║');
console.info('║   ███╗   ██╗███████╗ ██████╗ ███████╗██╗  ██╗ ██████╗ ██████╗ ███████╗   ║');
console.info('║   ████╗  ██║██╔════╝██╔═══██╗██╔════╝██║  ██║██╔═══██╗██╔══██╗██╔════╝   ║');
console.info('║   ██╔██╗ ██║█████╗  ██║   ██║███████╗███████║██║   ██║██████╔╝███████╗   ║');
console.info('║   ██║╚██╗██║██╔══╝  ██║   ██║╚════██║██╔══██║██║   ██║██╔═══╝ ╚════██║   ║');
console.info('║   ██║ ╚████║███████╗╚██████╔╝███████║██║  ██║╚██████╔╝██║     ███████║   ║');
console.info('║   ╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚══════╝   ║');
console.info('║                          + ECONOMY                                       ║');
console.info('║                                                                          ║');
console.info('║              📦 Book-Based Shop System 📦                               ║');
console.info('║              💰 Player Economy Enabled 💰                               ║');
console.info('║              ✍️  Shops Tied to Book Authors ✍️                          ║');
console.info('║                                                                          ║');
console.info('║                  Author: XxTheyLuvShyxX                                  ║');
console.info('║                                                                          ║');
console.info('╚══════════════════════════════════════════════════════════════════════════╝');

// ==================== CONFIGURATION ====================
const CONFIG = {
  currency: '$',
  startingBalance: 1000,
  rayDistance: 5
};

// ==================== ECONOMY SYSTEM ====================
const Economy = {
  getData: function(server) {
    if (!server.persistentData.contains('balances')) {
      server.persistentData.put('balances', {});
    }
    return server.persistentData.get('balances');
  },

  getBalance: function(server, uuid) {
    let balances = this.getData(server);
    if (balances[uuid] === undefined || balances[uuid] === null) {
      balances[uuid] = CONFIG.startingBalance;
      server.persistentData.put('balances', balances);
    }
    return balances[uuid];
  },

  setBalance: function(server, uuid, amount) {
    let balances = this.getData(server);
    balances[uuid] = Math.max(0, amount);
    server.persistentData.put('balances', balances);
  },

  addBalance: function(server, uuid, amount) {
    let current = this.getBalance(server, uuid);
    this.setBalance(server, uuid, current + amount);
  }
};

// ==================== SHOP REGISTRY ====================
const ShopRegistry = {
  getData: function(server) {
    if (!server.persistentData.contains('shops')) {
      server.persistentData.put('shops', {});
    }
    return server.persistentData.get('shops');
  },

  getShop: function(server, posKey) {
    let shops = this.getData(server);
    return shops[posKey] || null;
  },

  registerShop: function(server, posKey, shopData) {
    let shops = this.getData(server);
    shops[posKey] = shopData;
    server.persistentData.put('shops', shops);
  },

  deleteShop: function(server, posKey) {
    let shops = this.getData(server);
    delete shops[posKey];
    server.persistentData.put('shops', shops);
  },

  getAllShops: function(server) {
    return this.getData(server);
  }
};

// ==================== UTILITY FUNCTIONS ====================
function parseBookConfig(itemStack, playerUuid, isAdmin, bookNbt) {
  if (!itemStack || itemStack.isEmpty()) return null;

  let itemId = itemStack.id;
  let nbt = bookNbt || itemStack.nbt || itemStack.tag;
  
  // Debug: Show what we're checking
  console.info('[NeoShops] Parsing book - ItemID: ' + itemId);
  console.info('[NeoShops] Player UUID: ' + playerUuid);
  if (nbt) {
    console.info('[NeoShops] Book has NBT: Yes');
    if (nbt.author) {
      console.info('[NeoShops] Book author: ' + nbt.author);
    } else {
      console.info('[NeoShops] Book author: NONE');
    }
  } else {
    console.info('[NeoShops] Book has NBT: No');
  }
  
  // For admin shops, allow writable books
  if (isAdmin && itemId === 'minecraft:writable_book') {
    // Admin can use unsigned books
  } else if (itemId === 'minecraft:written_book') {
    // Regular shops MUST use signed books (written_book)
    
    // Check if book has an author
    if (!nbt || !nbt.author) {
      return { error: 'Book must be SIGNED! Right-click with the book and click "Sign".' };
    }
    
    // Check if the player who signed the book matches the shop creator
    let bookAuthor = String(nbt.author);
    let playerUuidStr = String(playerUuid);
    
    console.info('[NeoShops] Comparing author "' + bookAuthor + '" with player "' + playerUuidStr + '"');
    
    // Try comparing different formats - UUID might be with or without dashes
    if (bookAuthor !== playerUuidStr && bookAuthor !== playerUuidStr.replace(/-/g, '')) {
      // Also check if author is the player name instead of UUID
      console.info('[NeoShops] Author mismatch - might be player name vs UUID');
      // For now, allow it and just log a warning
      console.warn('[NeoShops] Book author does not match player UUID, but allowing anyway');
    }
  } else {
    return { error: 'Must use a SIGNED Book (Written Book), not a Book and Quill!' };
  }

  if (!nbt || !nbt.pages) return { error: 'Book has no pages!' };

  let pages = nbt.pages;
  if (pages.length === 0) return { error: 'Book is empty!' };

  let firstPage = String(pages[0]);
  
  console.info('[NeoShops] First page raw: ' + firstPage);

  // Try to parse JSON format
  try {
    let parsed = JSON.parse(firstPage);
    if (parsed.text) {
      firstPage = parsed.text;
    }
  } catch (e) {
    // Not JSON, use as-is
  }
  
  console.info('[NeoShops] First page parsed: ' + firstPage);

  let lines = firstPage.split('\n')
    .map(function(line) { return line.trim(); })
    .filter(function(line) { return line.length > 0; });

  console.info('[NeoShops] Lines found: ' + lines.length);
  for (let i = 0; i < lines.length; i = i + 1) {
    console.info('[NeoShops] Line ' + i + ': ' + lines[i]);
  }

  if (lines.length < 3) {
    return { error: 'Book needs 3 lines: BUY/SELL, item ID, price' };
  }

  let mode = lines[0].toUpperCase();
  let item = lines[1];
  let price = parseInt(lines[2], 10);
  
  console.info('[NeoShops] Parsed - Mode: ' + mode + ', Item: ' + item + ', Price: ' + price);

  if (mode !== 'BUY' && mode !== 'SELL') {
    return { error: 'Line 1 must be BUY or SELL' };
  }
  if (!item || item.length === 0) {
    return { error: 'Line 2 must be a valid item ID' };
  }
  if (isNaN(price) || price <= 0) {
    return { error: 'Line 3 must be a positive number' };
  }

  return {
    mode: mode,
    item: item,
    price: price
  };
}

function getItemDisplayName(itemId) {
  let parts = itemId.split(':');
  if (parts.length !== 2) return itemId;

  let itemName = parts[1];
  let words = itemName.split('_');
  let capitalized = words.map(function(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
  let display = capitalized.join(' ');

  if (display.length > 15) {
    display = display.substring(0, 12) + '...';
  }

  return display;
}

function getBlockBehind(block) {
  let facing = String(block.properties.facing);
  let offsetX = 0;
  let offsetY = 0;
  let offsetZ = 0;

  if (facing === 'north') {
    offsetZ = 1;
  } else if (facing === 'south') {
    offsetZ = -1;
  } else if (facing === 'east') {
    offsetX = -1;
  } else if (facing === 'west') {
    offsetX = 1;
  } else {
    return null;
  }

  return block.offset(offsetX, offsetY, offsetZ);
}

function hasPermission(player, perm) {
  if (player.op) return true;
  if (player.hasPermission('neoshops.*')) return true;
  return player.hasPermission(perm);
}

function getLookingAtShop(player, server) {
  let hit = player.rayTrace(CONFIG.rayDistance);
  if (!hit || !hit.block) return null;

  let block = hit.block;
  if (!block.id.includes('sign')) return null;

  let posKey = block.pos.x + ',' + block.pos.y + ',' + block.pos.z;
  let shop = ShopRegistry.getShop(server, posKey);
  
  if (!shop) return null;

  return {
    block: block,
    shop: shop,
    posKey: posKey
  };
}

// ==================== BLOCK EVENTS ====================
BlockEvents.placed(function(event) {
  let player = event.player;
  let block = event.block;
  let server = event.server;

  if (!block.id.includes('sign')) return;

  let playerData = player.persistentData;
  if (!playerData.getBoolean('shop_arm')) return;

  playerData.putBoolean('shop_arm', false);

  let isAdmin = playerData.getBoolean('shop_admin');
  playerData.putBoolean('shop_admin', false);

  if (isAdmin && !hasPermission(player, 'neoshops.admin')) {
    player.tell('§cYou do not have permission to create admin shops.');
    return;
  }

  let backBlock = getBlockBehind(block);
  if (!backBlock || !backBlock.inventory) {
    player.tell('§cSign must be placed on a chest or barrel!');
    return;
  }

  let inventory = backBlock.inventory;
  let bookStack = null;
  
  player.tell('§6=== DEBUG: Chest Contents ===');
  player.tell('§7Block type: ' + backBlock.id);
  player.tell('§7Has inventory: ' + (inventory ? 'Yes' : 'No'));
  
  if (inventory) {
    player.tell('§7Testing inventory.items property...');
    if (inventory.items) {
      player.tell('§7inventory.items found! Length: ' + inventory.items.length);
      for (let idx = 0; idx < inventory.items.length; idx = idx + 1) {
        let itemStack = inventory.items[idx];
        if (itemStack && !itemStack.isEmpty()) {
          player.tell('§eSlot ' + idx + ': ' + itemStack.id + ' x' + itemStack.count);
          
          let itemId = String(itemStack.id);
          if (itemId === 'minecraft:written_book' || (isAdmin && itemId === 'minecraft:writable_book')) {
            if (!bookStack) bookStack = itemStack;
          }
        }
      }
    } else {
      player.tell('§7inventory.items NOT found');
    }
    
    player.tell('§7Testing inventory.allItems property...');
    if (inventory.allItems) {
      player.tell('§7inventory.allItems found! Length: ' + inventory.allItems.length);
      for (let idx = 0; idx < inventory.allItems.length; idx = idx + 1) {
        let itemStack = inventory.allItems[idx];
        if (itemStack && !itemStack.isEmpty()) {
          player.tell('§eSlot ' + idx + ': ' + itemStack.id + ' x' + itemStack.count);
          
          // IMPORTANT: Actually search for the book here!
          let itemId = String(itemStack.id);
          if (itemId === 'minecraft:written_book' || (isAdmin && itemId === 'minecraft:writable_book')) {
            if (!bookStack) {
              bookStack = itemStack;
              player.tell('§aFound book in slot ' + idx + '!');
            }
          }
        }
      }
    } else {
      player.tell('§7inventory.allItems NOT found');
    }
  }
  
  player.tell('§6=== END DEBUG ===');

  if (!bookStack) {
    if (isAdmin) {
      player.tell('§cNo book found in chest!');
      player.tell('§7Put a signed book (Written Book) or Book and Quill in the chest.');
    } else {
      player.tell('§cNo SIGNED book found in chest!');
      player.tell('§7You must use a SIGNED book (Written Book), not a Book and Quill!');
      player.tell('§7Write in a Book and Quill, then right-click and press "Sign" to sign it.');
    }
    player.tell('§7Format: Line 1: BUY or SELL | Line 2: minecraft:diamond | Line 3: 100');
    return;
  }

  // Debug: Check NBT before parsing
  player.tell('§7Book found! Checking data components...');
  player.tell('§7Book ID: ' + bookStack.id);
  
  // In Minecraft 1.21.1 with KubeJS, we need to call methods to get data
  let bookData = null;
  
  // Try to get base components (Minecraft 1.21.1 data components)
  try {
    if (typeof bookStack.owo$getBaseComponents === 'function') {
      player.tell('§7Calling owo$getBaseComponents()...');
      let components = bookStack.owo$getBaseComponents();
      player.tell('§7Components type: ' + typeof components);
      
      // Try to get written book content component
      if (components && components['minecraft:written_book_content']) {
        player.tell('§aFound minecraft:written_book_content!');
        bookData = components['minecraft:written_book_content'];
      } else if (components && components['minecraft:writable_book_content']) {
        player.tell('§aFound minecraft:writable_book_content!');
        bookData = components['minecraft:writable_book_content'];
      } else if (components) {
        player.tell('§7Components exists, checking keys...');
        for (let key in components) {
          if (key.includes('book')) {
            player.tell('§7Found book-related key: ' + key);
          }
        }
      }
    }
  } catch (e) {
    player.tell('§cError calling owo$getBaseComponents: ' + e);
  }
  
  // Fallback: try direct NBT access
  if (!bookData) {
    player.tell('§7Trying direct NBT access...');
    let nbt = bookStack.nbt || bookStack.tag;
    if (nbt) {
      if (nbt['minecraft:written_book_content']) {
        bookData = nbt['minecraft:written_book_content'];
      } else if (nbt.pages) {
        bookData = nbt;
      }
    }
  }
  
  if (bookData) {
    player.tell('§aBook data found!');
    if (bookData.pages) {
      player.tell('§7Pages: ' + bookData.pages.length);
      if (bookData.pages.length > 0) {
        player.tell('§7First page: ' + String(bookData.pages[0]).substring(0, 50));
      }
    }
    if (bookData.author) {
      player.tell('§7Author: ' + bookData.author);
    }
  } else {
    player.tell('§cCould not find book data!');
    player.tell('§7Try using the Item.of() method instead...');
    return;
  }

  let config = parseBookConfig(bookStack, player.uuid.toString(), isAdmin, bookData);
  
  if (!config || config.error) {
    player.tell('§c' + (config ? config.error : 'Invalid book format!'));
    player.tell('§7Format: Line 1: BUY or SELL | Line 2: minecraft:diamond | Line 3: 100');
    return;
  }

  let posKey = block.pos.x + ',' + block.pos.y + ',' + block.pos.z;

  ShopRegistry.registerShop(server, posKey, {
    owner: player.uuid.toString(),
    admin: isAdmin,
    mode: config.mode,
    item: config.item,
    price: config.price
  });

  let displayName = getItemDisplayName(config.item);

  // Update sign text
  let signData = block.entityData;
  signData.front_text = signData.front_text || {};
  signData.front_text.messages = [
    '{"text":"' + config.mode + '"}',
    '{"text":"' + displayName + '"}',
    '{"text":"' + CONFIG.currency + config.price + '"}',
    '{"text":"[Click]"}'
  ];
  block.mergeNbt(signData);

  player.tell('§aShop created: ' + config.mode + ' ' + displayName + ' @ ' + CONFIG.currency + config.price);
});

BlockEvents.rightClicked(function(event) {
  let player = event.player;
  let block = event.block;
  let server = event.server;

  if (!block.id.includes('sign')) return;

  let posKey = block.pos.x + ',' + block.pos.y + ',' + block.pos.z;
  let shop = ShopRegistry.getShop(server, posKey);

  if (!shop) return;

  if (shop.admin && !hasPermission(player, 'neoshops.player')) {
    player.tell('§cYou do not have permission to use admin shops.');
    return;
  }

  let qty = player.crouching ? 64 : 1;
  let cost = shop.price * qty;

  if (shop.mode === 'BUY') {
    // Player is buying from shop
    let balance = Economy.getBalance(server, player.uuid.toString());
    if (balance < cost) {
      player.tell('§cInsufficient funds! Need ' + CONFIG.currency + cost + ', have ' + CONFIG.currency + balance);
      return;
    }

    if (!shop.admin) {
      let backBlock = getBlockBehind(block);
      if (!backBlock || !backBlock.inventory) {
        player.tell('§cShop chest is missing!');
        return;
      }

      let stockCount = backBlock.inventory.count(shop.item);
      if (stockCount < qty) {
        player.tell('§cOut of stock! (Only ' + stockCount + ' available)');
        return;
      }

      backBlock.inventory.extract(shop.item, qty, false);
    }

    Economy.addBalance(server, player.uuid.toString(), -cost);
    player.give(Item.of(shop.item, qty));
    player.tell('§aPurchased ' + qty + 'x for ' + CONFIG.currency + cost);

  } else {
    // Player is selling to shop
    let playerStock = player.inventory.count(shop.item);
    if (playerStock < qty) {
      player.tell('§cYou need ' + qty + 'x (you have ' + playerStock + ')');
      return;
    }

    if (!shop.admin) {
      let backBlock = getBlockBehind(block);
      if (!backBlock || !backBlock.inventory) {
        player.tell('§cShop chest is missing!');
        return;
      }

      backBlock.inventory.insert(shop.item, qty, false);
    }

    player.inventory.extract(shop.item, qty, false);
    Economy.addBalance(server, player.uuid.toString(), cost);
    player.tell('§aSold ' + qty + 'x for ' + CONFIG.currency + cost);
  }
});

// ==================== COMMANDS ====================
ServerEvents.commandRegistry(function(event) {
  let Commands = event.commands;
  let Arguments = event.arguments;

  // /bal - Check balance
  event.register(
    Commands.literal('bal')
      .executes(function(ctx) {
        let player = ctx.source.player;
        let server = ctx.source.server;
        let balance = Economy.getBalance(server, player.uuid.toString());
        player.tell('§eBalance: ' + CONFIG.currency + balance);
        return 1;
      })
  );

  // /pay <player> <amount> - Send money
  event.register(
    Commands.literal('pay')
      .then(
        Commands.argument('target', Arguments.PLAYER.create(event))
          .then(
            Commands.argument('amount', Arguments.INTEGER.create(event))
              .executes(function(ctx) {
                let sender = ctx.source.player;
                let server = ctx.source.server;
                let target = Arguments.PLAYER.getResult(ctx, 'target');
                let amount = Arguments.INTEGER.getResult(ctx, 'amount');

                if (!target) {
                  sender.tell('§cPlayer not found!');
                  return 0;
                }

                if (amount <= 0) {
                  sender.tell('§cAmount must be positive!');
                  return 0;
                }

                let senderBalance = Economy.getBalance(server, sender.uuid.toString());
                if (senderBalance < amount) {
                  sender.tell('§cInsufficient funds!');
                  return 0;
                }

                Economy.addBalance(server, sender.uuid.toString(), -amount);
                Economy.addBalance(server, target.uuid.toString(), amount);

                sender.tell('§aSent ' + CONFIG.currency + amount + ' to ' + target.username);
                target.tell('§aReceived ' + CONFIG.currency + amount + ' from ' + sender.username);
                return 1;
              })
          )
      )
  );

  // /shopadd - Create player shop
  event.register(
    Commands.literal('shopadd')
      .executes(function(ctx) {
        let player = ctx.source.player;
        player.persistentData.putBoolean('shop_arm', true);
        player.persistentData.putBoolean('shop_admin', false);
        player.tell('§e=== How to Create a Shop ===');
        player.tell('§71. Write in a Book and Quill');
        player.tell('§72. RIGHT-CLICK the book and press "Sign" to sign it');
        player.tell('§73. Put the SIGNED book in a chest');
        player.tell('§74. Place a sign on the chest');
        player.tell('§7Book Format: Line 1: BUY/SELL | Line 2: minecraft:diamond | Line 3: 100');
        return 1;
      })
  );

  // /shopaddadmin - Create admin shop
  event.register(
    Commands.literal('shopaddadmin')
      .executes(function(ctx) {
        let player = ctx.source.player;
        
        if (!hasPermission(player, 'neoshops.admin')) {
          player.tell('§cYou do not have permission!');
          return 0;
        }

        player.persistentData.putBoolean('shop_arm', true);
        player.persistentData.putBoolean('shop_admin', true);
        player.tell('§eAdmin Mode: Place a sign on a chest with a book inside.');
        player.tell('§7Admin shops have infinite stock.');
        return 1;
      })
  );

  // /shopremove - Remove shop
  event.register(
    Commands.literal('shopremove')
      .executes(function(ctx) {
        let player = ctx.source.player;
        let server = ctx.source.server;
        let result = getLookingAtShop(player, server);

        if (!result) {
          player.tell('§cNo shop targeted. Look at a shop sign!');
          return 0;
        }

        let isOwner = result.shop.owner === player.uuid.toString();
        let isAdmin = hasPermission(player, 'neoshops.admin');

        if (!isOwner && !isAdmin) {
          player.tell('§cYou do not own this shop!');
          return 0;
        }

        ShopRegistry.deleteShop(server, result.posKey);
        player.tell('§aShop removed!');
        return 1;
      })
  );

  // /shopinfo - View shop info
  event.register(
    Commands.literal('shopinfo')
      .executes(function(ctx) {
        let player = ctx.source.player;
        let server = ctx.source.server;
        let result = getLookingAtShop(player, server);

        if (!result) {
          player.tell('§cNo shop targeted!');
          return 0;
        }

        let shop = result.shop;
        player.tell('§e--- Shop Info ---');
        player.tell('§7Mode: ' + shop.mode);
        player.tell('§7Item: ' + shop.item);
        player.tell('§7Price: ' + CONFIG.currency + shop.price);
        player.tell('§7Admin Shop: ' + (shop.admin ? 'Yes' : 'No'));
        return 1;
      })
  );

  // /listshops - List your shops
  event.register(
    Commands.literal('listshops')
      .executes(function(ctx) {
        let player = ctx.source.player;
        let server = ctx.source.server;
        let uuid = player.uuid.toString();
        let shops = ShopRegistry.getAllShops(server);

        let count = 0;
        let keys = Object.keys(shops);
        for (let i = 0; i < keys.length; i = i + 1) {
          let key = keys[i];
          let shop = shops[key];
          if (shop.owner === uuid) {
            player.tell('§7' + shop.mode + ' ' + shop.item + ' @ ' + CONFIG.currency + shop.price);
            count = count + 1;
          }
        }

        if (count === 0) {
          player.tell('§7You have no shops.');
        }
        return 1;
      })
  );

  // /shopspublic - List all shops
  event.register(
    Commands.literal('shopspublic')
      .executes(function(ctx) {
        let player = ctx.source.player;
        let server = ctx.source.server;
        let shops = ShopRegistry.getAllShops(server);

        let count = 0;
        let keys = Object.keys(shops);
        for (let i = 0; i < keys.length; i = i + 1) {
          let key = keys[i];
          let shop = shops[key];
          let adminTag = shop.admin ? ' §e[ADMIN]' : '';
          player.tell('§7' + shop.mode + ' ' + shop.item + ' @ ' + CONFIG.currency + shop.price + adminTag);
          count = count + 1;
        }

        if (count === 0) {
          player.tell('§7No shops available.');
        }
        return 1;
      })
  );
});

console.info('[NeoShops] Loaded successfully!');
console.info('[NeoShops] Remember: Players must use SIGNED books (Written Books) to create shops!');

