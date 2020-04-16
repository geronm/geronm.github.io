//
// Copyright (c) 2020, Geronimo J Mirano
// See license at LICENSE.txt
//

//
// levels.js
//
// adds:
// * LEVELS
// * TERRAIN_TYPES
//


function _isndef(val) { return (typeof val == 'undefined') }


function entityInit(entity) {
  entity.name = "" + entity.type + " #" + entity.id;
  for (var property of entity.properties) {
    ENTITY_PROPERTIES[property].init(entity);
  }
}


function entityUpdate(entity) {
  for (var property of entity.properties) {
    ENTITY_PROPERTIES[property].update(entity);
  }
}


function entityDraw(entity) {
  // Base draw code for every entity
  if (!_isndef(entity.image)) {
    drawImageAtGridCoords(entity.row, entity.col, entity.image);
  } else if (!_isndef(entity.fill_style)) {
    fillRectAtGridCoords(entity.row, entity.col, entity.fill_style);
  }

  for (var property of entity.properties) {
    ENTITY_PROPERTIES[property].draw(entity);
  }

  if (!_isndef(entity.extra_draw)) {
    entity.extra_draw(entity);
  }
}


function entityInitMovement(entity) {
  FIELDS = ['row', 'col', 'row_src', 'col_src', 'row_dst', 'col_dst', 'move_frac', 'movement_speed'] // 'last_move_start_frame' init-ed below
  for (var field of FIELDS) {
    if (_isndef(entity[field])) {
      if (field == 'movement_speed') {
        entity[field] = 1.0;
      } else if ((field == 'row' || field == 'row_src' || field == 'row_dst') && !_isndef(entity.row_start)) {
          entity[field] = entity.row_start;
      } else if ((field == 'col' || field == 'col_src' || field == 'col_dst') && !_isndef(entity.col_start)) {
          entity[field] = entity.col_start;
      } else {
        entity[field] = 0; // incidentally, 0 is a great default value for most of these fields
      }
    }
  }
  if (_isndef(entity.last_move_start_frame)) {
    entity.last_move_start_frame = game.state.frame - game.fps / entity.movement_speed;
  }
  entityUpdateMovement(entity);
}


function entityUpdateMovement(entity) {
  var state = game.state;
  // Everything follows from last_move_start_frame, game.state.frame, and src/dst tiles
  if (_isndef(game.state.frame) || _isndef(entity.last_move_start_frame) || _isndef(entity.row_src) || _isndef(entity.row_dst) || _isndef(entity.col_src) || _isndef(entity.row_dst)) {
    console.log("BAAAAAAAAAAAAAAAAAAAAAAAAAAAD");
    return
  }

  // Update move_frac
  var move_frac_untruncated = (game.state.frame - entity.last_move_start_frame) * entity.movement_speed / game.fps;
  entity.move_frac = Math.max(0.0, Math.min(1.0, move_frac_untruncated))

  // If we're really done moving (REALLY done moving, like move_frac_untruncated >= 3.0 meaning we've had 2 whole move times since we reached dst) then we can clean up our src square
  if (move_frac_untruncated >= 3.0 && ((entity.row_src != entity.row_dst) || (entity.col_src != entity.col_dst))) {
    removeMapEntity(entity, entity.row_src, entity.col_src);
    entity.row_src = entity.row_dst;
    entity.col_src = entity.col_dst;
  }

  // IMPORTANT: Collision detection!

  // ENTITY-TERRAIN COLLISION
  var result = entityAllTerrainCollideAtDst(entity);
  if (result == "blocked") {
    entity.row_dst = entity.row_src;
    entity.col_dst = entity.col_src;
  }

  // ENTITY-ENTITY COLLISION
  // don't assume our dst square is in entity_map yet -- might be speculative, trying
  // to move there
  result = entityAllEntityCollideAtDst(entity);
  if (result["result"] == "blocked") {
    // Back off
    entity.row_dst = entity.row_src;
    entity.col_dst = entity.col_src;
  } else if (result["result"] == "pushing") {
    // Allow movement; propagate push through stationary object
    var pushed_entity = result["pushed_entity"];
    if (_isndef(pushed_entity)) {
      console.log("VERYBAD: pushed_entity was undefined despite pushing being the result");
    } else {
      // PUSH!!
      pushed_entity.movement_speed = entity.movement_speed;
      move(
        pushed_entity,
        pushed_entity.row_dst + (entity.row_dst - entity.row_src),
        pushed_entity.col_dst + (entity.col_dst - entity.col_src),
      );
      pushed_entity.last_move_start_frame = entity.last_move_start_frame - 1 * 0;
    }
  }

  // hole! delete other entities
  if (entity.hole && entity.move_frac == 1.0) {
    if (state.entity_map.has(entity.row_dst) && state.entity_map.get(entity.row_dst).has(entity.col_dst) && state.entity_map.get(entity.row_dst).get(entity.col_dst).size > 1) {
      console.log("hole");
      state.entity_map.get(entity.row_dst).get(entity.col_dst).forEach(function(other_entity, other_id) {
        if (other_entity.id != entity.id) {
          other_entity.move_frac = Math.max(0.0, Math.min(1.0, (game.state.frame - other_entity.last_move_start_frame) * other_entity.movement_speed / game.fps));
          if ((other_entity.move_frac == 0.0 &&
               entity.row_dst == other_entity.row_src &&
               entity.col_dst == other_entity.col_src) ||
              (other_entity.move_frac == 1.0 &&
               entity.row_dst == other_entity.row_dst &&
               entity.col_dst == other_entity.col_dst)) {
            // FINISH HIM!! Other entity done fallen into the hole, now it meets our WRATH
            removeMapEntity(other_entity, other_entity.row_src, other_entity.col_src);
            if (other_entity.row_dst != other_entity.row_src || other_entity.col_dst != other_entity.col_src) { removeMapEntity(other_entity, other_entity.row_dst, other_entity.col_dst); }
            other_entity.row_src = 0;
            other_entity.col_src = 0;
            other_entity.row_dst = 0;
            other_entity.col_dst = 0;
            other_entity.row = 0;
            other_entity.col = 0;
            other_entity.ghost = true;
            other_entity.no_clip = true;
          }
        }
      });
    }
  }

  // Now update row/col
  entity.row = (1 - entity.move_frac) * entity.row_src + (entity.move_frac) * entity.row_dst;
  entity.col = (1 - entity.move_frac) * entity.col_src + (entity.move_frac) * entity.col_dst;
}


function entityAllTerrainCollideAtDst(entity) {
  if (entity.row_dst < 0 || entity.row_dst >= game.state.level.height || entity.col_dst < 0 || entity.col_dst >= game.state.level.width) {
    if (entity.allowed_to_leave_map) {
      return null;
    } else {
      return "blocked";
    }
  }
  if (!entity.no_clip && !TERRAIN_TYPES[game.state.level.terrain[entity.row_dst][entity.col_dst]].passable) {
    return "blocked";
  }
  return null;
}


function entityAllEntityCollideAtDst(entity) {
  var outer_result = {result : null};
  if (game.state.entity_map.has(entity.row_dst)) {
    if (game.state.entity_map.get(entity.row_dst).has(entity.col_dst)) {
      game.state.entity_map.get(entity.row_dst).get(entity.col_dst).forEach(function(other_entity, id) {
        result = entityEntityCollide(entity, other_entity);
        if (result == "blocked") {
          outer_result = {result : "blocked"};
        } else if (result == "pushing") {
          if (outer_result["result"] != "blocked") {
            outer_result = {result : "pushing", pushed_entity : other_entity};
          }
        }
      });
    }
  }
  return outer_result;
}


/**
 * Tells whether e_self is "blocked" by e_other, is "pushing" e_other, or
 * is free to move relative to e_other (in which case null is returned).
 * @param {*} e_self
 * @param {*} e_other
 */
function entityEntityCollide(e_self, e_other) {
  // LET'S MAKE 100% SURE e_other.move_frac IS CORRECT.
  e_self.move_frac = Math.max(0.0, Math.min(1.0, (game.state.frame - e_self.last_move_start_frame) * e_self.movement_speed / game.fps));
  e_other.move_frac = Math.max(0.0, Math.min(1.0, (game.state.frame - e_other.last_move_start_frame) * e_other.movement_speed / game.fps));

  if (e_self.id == e_other.id) {
    return null;
  }

  if (e_self.ghost || e_other.ghost) {
    return null;
  }

  // console.log("checking collision " + e_self.type + " " + e_other.type);

  var e_self_stationary = e_self.move_frac == 1.0 || ((e_self.row_src == e_self.row_dst) && (e_self.col_src == e_self.col_dst));
  var e_self_squares;
  if (e_self_stationary) {
    e_self_squares = [[e_self.row_dst, e_self.col_dst]];
  } else {
    e_self_squares = [[e_self.row_src, e_self.col_src], [e_self.row_dst, e_self.col_dst]];
  }

  var e_other_stationary = e_other.move_frac == 1.0 || ((e_other.row_src == e_other.row_dst) && (e_other.col_src == e_other.col_dst));
  var e_other_squares;
  if (e_other_stationary) {
    e_other_squares = [[e_other.row_dst, e_other.col_dst]];
  } else {
    e_other_squares = [[e_other.row_src, e_other.col_src], [e_other.row_dst, e_other.col_dst]];
  }

  // if (e_self_stationary && e_other_stationary && e_self.row_dst == e_other.row_dst && e_self.col_dst == e_other.col_dst) {
  //     console.log("two stationary non-ghost entities overlap? " + e_self.name + " " + e_other.name + " " + e_self.row_dst + " " + e_self.col_dst);
  // }

  if (e_self_stationary) {
    // I'm stationary, so I don't need to collide with anyone.
    return null;
  }
  // I'm moving
  if (e_other_stationary) {
    var e_moving = e_self;
    var e_stationary = e_other;
    if (e_stationary.row_dst == e_moving.row_dst && e_stationary.col_dst == e_moving.col_dst) {
      // check for pushable case:
      if (e_stationary.can_push) {
        // PUSHING TIME!! Moving entity is moving into a stationary, pushable object.
        // Now, we have to see if we can push the pushable object -- which requires
        // recursively checking if the object can be moved in that direction. If the
        // chain checks out, we'll return the special value "pushing".
        entity_copy_pushed = {}; // this will represent a copy of the stationary entity if it were moving in the pushed direction
        Object.assign(entity_copy_pushed, e_stationary);
        entity_copy_pushed.movement_speed = e_moving.movement_speed;
        entity_copy_pushed.row_src = e_stationary.row_dst;
        entity_copy_pushed.col_src = e_stationary.col_dst;
        entity_copy_pushed.row_dst = e_stationary.row_dst + (e_moving.row_dst - e_moving.row_src);
        entity_copy_pushed.col_dst = e_stationary.col_dst + (e_moving.col_dst - e_moving.col_src);
        entity_copy_pushed.last_move_start_frame = game.state.frame;
        var result_terrain = entityAllTerrainCollideAtDst(entity_copy_pushed);
        if (result_terrain == "blocked") {
          // no go
          return "blocked";
        }
        // Note: the below entity collision check WOULD cause the pushed entity to
        // collide with the original moving entity (assuming it's in the entity_map)
        // if it weren't for the fact that there's an exception for moving-moving
        // collisions where two entities moving together through neighboring squares
        // in sync at compatible speeds are considered not-colliding.
        var result_entities = entityAllEntityCollideAtDst(entity_copy_pushed)["result"];
        if (result_entities == "blocked") {
          return "blocked";
        }
        // also, cannot push through this block if it is "heavy"
        if (result_entities == "pushing" && e_stationary.heavy) {
          return "blocked";
        }
        return "pushing";
      }
      return "blocked";
    };
    return null;
  };

  // We're both moving!
  // Check if we're moving in the same direction and overlapping. If so, check if our speeds are compatible;
  // if so, we're good! Not colliding.
  if (e_self.row_dst - e_self.row_src == e_other.row_dst - e_other.row_src &&
      e_self.col_dst - e_self.col_src == e_other.col_dst - e_other.col_src) {
    if (e_self.row_dst == e_other.row_src &&
        e_self.col_dst == e_other.col_src &&
        e_self.movement_speed <= e_other.movement_speed) {
      // I'm moving into other's square as other leaves it at compatible speed
      return null;
    }
    if (e_other.row_dst == e_self.row_src &&
        e_other.col_dst == e_self.col_src &&
        e_other.movement_speed <= e_self.movement_speed) {
      // Other's moving into my square as I leave it at compatible speed
      return null;
    }
  } else {
  }

  // Finally, check moving stuff
  for (var i=0; i < e_self_squares.length; i++) {
    for (var j=0; j < e_other_squares.length; j++) {
      if (e_self_squares[i][0] == e_other_squares[j][0] &&
          e_self_squares[i][1] == e_other_squares[j][1]) {
        return "blocked";
      }
    }
  }

  return null;
}


function removeMapEntity(entity, row, col) {
  var state = game.state;
  if (!state.entity_map.has(row) ||
      !state.entity_map.get(row).has(col) ||
      !state.entity_map.get(row).get(col).has(entity.id)) {
    console.log("BAD. VERY unclean, requested removal of entity not in map.");
    console.log(row, col);
    console.log(entity);
    return false;
  } else {
    // we happy
    state.entity_map.get(row).get(col).delete(entity.id);
    if (state.entity_map.get(row).get(col).size == 0) {
      state.entity_map.get(row).delete(col);
      if (state.entity_map.get(row).size == 0) {
        state.entity_map.delete(row);
      }
    }
    return true;
  }
}


function insertMapEntity(entity, row, col) {
  var state = game.state;
  if (!state.entity_map.has(row)) { state.entity_map.set(row, new Map()); };
  if (!state.entity_map.get(row).has(col)) { state.entity_map.get(row).set(col, new Map()); };
  state.entity_map.get(row).get(col).set(entity.id, entity);
}


/**
 * Starts to move the given "movement" entity to the desired target square.
 *
 * entityUpdateMovement() will kick us back to former dst square if there is
 * any collision issue.
 *
 * @param {*} movement_entity the entity
 * @param {*} row_dst row desired
 * @param {*} col_dst col desired
 */
function move(entity, row_dst, col_dst) {
  // REMOVE ENTRIES FROM ENTITY MAP
  removeMapEntity(entity, entity.row_src, entity.col_src);
  if (entity.row_dst != entity.row_src || entity.col_dst != entity.col_src) {
    removeMapEntity(entity, entity.row_dst, entity.col_dst);
  }

  // UPDATE FIELDS AND DO COLLISION CHECK
  entity.row_src = entity.row_dst;
  entity.col_src = entity.col_dst;
  entity.row_dst = row_dst;
  entity.col_dst = col_dst;
  entity.last_move_start_frame = game.state.frame;

  entityUpdateMovement(entity); // Important to always call this right after setting row_dst and col_dst, for collision checking

  // ADD NEW ENTRIES FROM ENTITY MAP. DO THIS *AFTER* COLLISION CHECK
  insertMapEntity(entity, entity.row_src, entity.col_src);
  insertMapEntity(entity, entity.row_dst, entity.col_dst);
}


function entityInitRandomWalk(entity) {
  FIELDS = ["random_walk_interval", "last_random_walk_start_frame"]
  for (var field of FIELDS) {
    if (_isndef(entity[field])) {
      if (field == "random_walk_interval") {
        entity[field] = 1.0;
      } else if (field == "last_random_walk_start_frame") {
        entity[field] = game.state.frame;
      } else {
        entity[field] = 0;
      }
    }
  }
  entity.movement_speed = entity.random_walk_speed;
}


function entityUpdateRandomWalk(entity) {
  if (game.state.frame - entity.last_random_walk_start_frame > game.fps * entity.random_walk_interval && entity.move_frac == 1.0) {
    entity.movement_speed = entity.random_walk_speed;
    // Make a random move!
    var possible_moves = [
      // {r: 0, c: 0},
      {r: 1, c: 0},
      {r: 0, c: 1},
      {r:-1, c: 0},
      {r: 0, c:-1},
    ];
    possible_moves = possible_moves.filter(function(a_move) {
      var entity_copy = {};
      Object.assign(entity_copy, entity);
      entity_copy.row_dst = entity.row_dst + a_move.r;
      entity_copy.col_dst = entity.col_dst + a_move.c;
      if (entityAllTerrainCollideAtDst(entity_copy) == "blocked") {
        return false;
      }
      if (entityAllEntityCollideAtDst(entity_copy)["result"] == "blocked") {
        return false;
      }
      return true;
    });
    if (possible_moves.length > 0) {
      var cur_move = possible_moves[Math.floor(Math.random() * possible_moves.length)]
      move(entity, entity.row_dst + cur_move.r, entity.col_dst + cur_move.c);
    } else {
      console.log("I can't move! " + entity.id + " " + entity.type);
    }

    // Reset timer
    entity.last_random_walk_start_frame = game.state.frame;
  }
}


function entityInitInput(entity) {
  FIELDS = ["input_refractory_period"]
  for (var field of FIELDS) {
    if (_isndef(entity[field])) {
      entity[field] = 0;
    }
  }
  entity.movement_speed = entity.input_speed;
  entity.down_keys_to_first_frame = new Map(); // Keep track of which frame a key was started to be held down on (to implement refractory)
  entity.hit_keys = new Set(); // Track hit keys in a stateful set so they can be removed when it's time to take action
}


function entityUpdateInput(entity) {
  if (_isndef(entity.move_frac)) {
    console.log("BAAAAAAAAAAAAAAAAAAAAAAAAAAAAD BAD BAD");
  }

  
  game.down_keys.forEach(function(key) {
    if (!entity.down_keys_to_first_frame.has(key)) {
      entity.hit_keys.add(key);
      entity.down_keys_to_first_frame.set(key, game.state.frame);
    }
  });

  // Make sure we're up to date
  entity.down_keys_to_first_frame.forEach(function(frame, key) {
    if (!game.down_keys.has(key)) {
      entity.down_keys_to_first_frame.delete(key);
    }
  });

  // If movement is done, listen to keyboard input to make next move (consider moving anyway, with refractory period on repeat moves)
  if (entity.move_frac == 1.0) {
    var hit_keys = entity.hit_keys;
    entity.hit_keys = new Set();
    if (game.down_keys.size > 0 || hit_keys.size > 0) {
      var r = 0;
      var c = 0;

      var key_should_take_action = function(key) {
        return hit_keys.has(key) || (entity.down_keys_to_first_frame.has(key) && (game.state.frame - entity.down_keys_to_first_frame.get(key)) > (entity.input_refractory_period * game.fps));
      };

      if (key_should_take_action("ArrowDown")) { r += 1; };
      if (key_should_take_action("ArrowUp")) { r -= 1; };
      if (key_should_take_action("ArrowRight")) { c += 1; };
      if (key_should_take_action("ArrowLeft")) { c -= 1; };

      if (r != 0) {
        c = 0;
      }

      if (r != 0 || c != 0) {
        entity.movement_speed = entity.input_speed;
        move(entity, entity.row_dst + r, entity.col_dst + c)
      }
    }
  }
}

function entityInitTrackFollow(entity) {
  FIELDS = ["track_i"]
  for (var field of FIELDS) {
    if (_isndef(entity[field])) {
      entity[field] = 0;
    }
  }
  if (_isndef(entity.track)) {
    console.log("BAD!!!")
    entity.track = [];
  }
}


function entityUpdateTrackFollow(entity) {
  if (entity.track_i < entity.track.length) {
    if (entity.move_frac == 1.0) {
      move(entity, entity.track[entity.track_i][0], entity.track[entity.track_i][1]);
      // Bump counter if move was successful
      if (entity.row_dst == entity.track[entity.track_i][0] && entity.col_dst == entity.track[entity.track_i][1]) {
        entity.track_i += 1;
      }
    }
  }
}


ENTITY_PROPERTIES = {
  movement : {
    init : entityInitMovement,
    update : entityUpdateMovement,
    draw : function(entity) {},
  },
  input : {
    init : entityInitInput,
    update : entityUpdateInput,
    draw : function(entity) {},
  },
  random_walk : {
    init : entityInitRandomWalk,
    update : entityUpdateRandomWalk,
    draw : function(entity) {},
  },
  energy_holder : {
    init : function(entity) {},
    update : function(entity) {},
    draw : function(entity) {
      if (_isndef(ENTITY_TYPES.lightning_image)) {
        ENTITY_TYPES.lightning_image = new Image();
        ENTITY_TYPES.lightning_image.src = "img/electricity_symbol.png";
      }
      if (entity.has_energy) {
        drawImageAtGridCoords(entity.row, entity.col, ENTITY_TYPES.lightning_image);
      }
    },
  },
  track_follow : {
    init : entityInitTrackFollow,
    update : entityUpdateTrackFollow,
    draw : function(entity) {},
  },
}


ENTITY_TYPES = {
  player : {
    properties : ["movement", "input", "track_follow"],
    input_refractory_period : 0.2,
    input_speed : 10.0,
    image_path : "img/player.png",
    is_player : true,
    is_hole : false,
    // ghost : true,
    // no_clip : true,
    can_push : true,
    track : [],
  },
  roamer : {
    properties : ["movement", "random_walk"],
    random_walk_speed : 15.0,
    random_walk_interval : 2.0, // 3.0,
    fill_style: "green",
    can_push: true,
  },
  box : {
    properties : ["movement", "energy_holder"],
    image_path: "img/crate2.png",
    can_push : true,
    has_energy : false,
  },
  crate : {
    properties : ["movement", "energy_holder"],
    image_path: "img/crate1.png",
    can_push : true,
    has_energy : false,
    heavy : true, // heavy == cannot be pushed in a train
  },
  hole : {
    properties : ["movement"],
    hole : true,
    ghost : true,
  },
}
