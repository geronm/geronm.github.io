//
// Copyright (c) 2020, Geronimo J Mirano
// See license at LICENSE.txt
//

MODE_PLAY = 1
MODE_LEVEL_EDIT = 2

//
// levels.js
//
// adds:
// * LEVELS
// * TERRAIN_TYPES
//

//
// entities.js
//
// adds:
// * entityInit
// * entityUpdate
// * entityInitRandomWalk
// * entityUpdateRandomWalk
// * entityInitMovement
// * entityUpdateMovement
// * entityInitInput
// * entityUpdateInput
// * ENTITY_PROPERTIES
// * ENTITY_TYPES
// * insertMapEntity
// * removeMapEntity
//


function _isndef(val) { return (typeof val == "undefined") }


// By convention, the screen is 100 units by 100 units


var CAMERA_SMOOTH = 0.04;
// TODO: Allow all these values to be re-rolled to allow camera zoom
var TILES_HIGH_MAX = 18;
var TILES_WIDE_MAX = 18;
var tiles_high = TILES_HIGH_MAX;
var tiles_wide = TILES_WIDE_MAX;
var tile_height = 100.0 / tiles_high;
var tile_width = 100.0 / tiles_wide;
var horizontal_buffer = (tiles_wide / 2);
var vertical_buffer = (tiles_high / 2);
var SKY_WIGGLE_FRAC = 0.3;  // how much the sky should be stretched +/- the edge of the game screen for parallax effect. 0.0 would be no parallax, 1.0 would mean you see the middle 1/3rd of the image when centered.
var SHOW_FPS = false;

var game = {
  canvas : document.createElement("canvas"),
  fps : 60,
  down_keys : new Set(),
  state : {
    mode: MODE_PLAY,
    camera_row : 0,
    camera_col : 0,
    level : {
      width: 1,
      height: 1,
      terrain: [[0]],
    }
  },
  player_image : new Image(),
}


// EZ Key Press Detection (No KeyHit yet)
window.addEventListener("keydown", function (e) {
  var key = e.code;
  game.down_keys.add(key);
})
window.addEventListener("keyup", function (e) {
  var key = e.code;
  game.down_keys.delete(key);
})


function gameStart() {
  // Final game init
  game.context = game.canvas.getContext("2d");
  // game.interval = setInterval(mainLoop, 1000 / game.fps);
  game.player_image.src = "img/player.png";

  // Initialize game state
  game.state.frame = 0;
  loadLevel("simple_key_puzzle_1");
  // loadLevel("simple_key_puzzle_3"); // DEBUG

  // ENGAGE Graphics
  gameResize();
  document.getElementById("gamezone").appendChild(game.canvas);
  window.onresize = gameResize;

  mainLoop();
}


function loadLevel(level_name) {
  var state = game.state;
  var context = game.context;

  console.log("loading level: " + level_name + " ...");

  level_to_read = LEVELS[level_name]

  level = {}
  level.name = level_name;
  Object.assign(level, level_to_read);
  level.terrain = [] // Want to deep clone this
  for (var r = 0; r < level.height; r++) { // deep-copy the initial terrain of the level
    level.terrain.push(level_to_read.terrain[r].slice());
  }

  state.level = level;
  state.entity_collision_map = new Map();  // Tripley-nested map (row -> (col -> (id -> entity))).

  if (!_isndef(state.level.background_image_path)) {
    state.level.background_image = new Image();
    state.level.background_image.src = state.level.background_image_path;
  }

  // Load entities
  state.entities = new Map();
  if (level.entities) {
    for (const entity_to_read of level.entities) {
      var id = Math.floor(10**9 * Math.random());

      // Create new entity_to_read, starting with type-based init, then
      // specific level init params, and finally ending
      // with entityInit():
      var entity = {};
      Object.assign(entity, ENTITY_TYPES[entity_to_read.type]);
      Object.assign(entity, entity_to_read);
      entity.id = id;
      entityInit(entity);
      if (entity.id != id) { console.log("BAD! ENTITY HAD id DEFINED ELSEWHERE"); console.log(entity); }

      // Init entity image
      if (!_isndef(entity.image_path)) {
        entity.image = new Image();
        entity.image.src = entity.image_path;
      }

      console.log(entity)

      if (entity.is_player) {
        state.player = entity;
      }

      // Update the entities map!
      if (!_isndef(entity.row_src)) {
        if (_isndef(entity.col_src) || _isndef(entity.row_dst) || _isndef(entity.col_dst)) {
          console.log("BAAD APPLE!!");
          console.log([entity.row_src, entity.col_src, entity.row_dst, entity.col_dst]);
        } else {
          insertMapEntity(entity, entity.row_src, entity.col_src);
          insertMapEntity(entity, entity.row_dst, entity.col_dst);
        }
      }

      state.entities.set(entity.id, entity);
    }
  }

  if (_isndef(state.player)) {
    state.player = {
      row: 0,
      col: 0,
    }
  }

  state.camera_row = state.player.row;
  state.camera_col = state.player.col;

  tiles_high = Math.min(TILES_HIGH_MAX, level.height);
  tiles_wide = Math.min(TILES_WIDE_MAX, level.width);

  console.log(state.entities)

}


function gameResize() {
  var minorAxis = Math.min(document.body.clientWidth, document.body.clientHeight);
  game.canvas.width = Math.round(minorAxis * 0.8);
  game.canvas.height = Math.round(minorAxis * 0.8);
  gameRedraw();  // Yes, in fact, resize DOES invoke redraw
}


function gameRedraw() {
  var state = game.state;
  var context = game.context;

  context.clearRect(0, 0, game.canvas.width, game.canvas.height);

  // Draw "skybox"
  // TODO background image tiled with light parallax
  if (!_isndef(state.level.background_image)) {
    var frac_camera_horizontal = 0.5;
    if (state.level.width - horizontal_buffer > horizontal_buffer) {
      frac_camera_horizontal = (state.camera_col - horizontal_buffer) / (state.level.width - horizontal_buffer - horizontal_buffer);
    }
    var frac_camera_vertical = 0.5;
    if (state.level.height - vertical_buffer > vertical_buffer) {
      frac_camera_vertical = (state.camera_row - vertical_buffer) / (state.level.height - vertical_buffer - vertical_buffer);
    }
    var background_width = game.canvas.width * (1 + SKY_WIGGLE_FRAC + SKY_WIGGLE_FRAC);
    var background_height = game.canvas.height * (1 + SKY_WIGGLE_FRAC + SKY_WIGGLE_FRAC);
    var background_x = - frac_camera_horizontal * (SKY_WIGGLE_FRAC + SKY_WIGGLE_FRAC) * game.canvas.width;
    var background_y = - frac_camera_vertical * (SKY_WIGGLE_FRAC + SKY_WIGGLE_FRAC) * game.canvas.height;
    context.drawImage(state.level.background_image, background_x, background_y, background_width, background_height);
  }

  // Render world based on camera position
  if (state.mode == MODE_PLAY || state.mode == MODE_LEVEL_EDIT) {
    var lowest_visible_row_incl = Math.max(0, Math.floor(state.camera_row - tiles_high / 2 - 4));
    var highest_visible_row_excl = Math.min(state.level.height, Math.ceil(state.camera_row + tiles_high / 2 + 4));
    var lowest_visible_col_incl = Math.max(0, Math.floor(state.camera_col - tiles_wide / 2 - 4));
    var highest_visible_col_excl = Math.min(state.level.width, Math.ceil(state.camera_col + tiles_wide / 2 + 4));

    for (var r = lowest_visible_row_incl; r < highest_visible_row_excl; r++) {
      for (var c = lowest_visible_col_incl; c < highest_visible_col_excl; c++) {
        terrain_code = state.level.terrain[r][c];

        terrain_type = TERRAIN_TYPES[terrain_code]
        if (!_isndef(terrain_type)) {
          if (!_isndef(terrain_type.image)) {
            drawImageAtGridCoords(r, c, terrain_type.image);
          } else if (!_isndef(terrain_type.fill_style)) {
            fillRectAtGridCoords(r, c, terrain_type.fill_style);
          }
        } else {
          fillRectAtGridCoords(r, c, "magenta");
        }
      }
    }

    // Draw Entities
    state.entities.forEach(function(entity, id) {
      if (lowest_visible_row_incl <= entity.row && entity.row <= highest_visible_row_excl &&
          lowest_visible_col_incl <= entity.col && entity.col <= highest_visible_col_excl) {
        entityDraw(entity);
      }
    });

    // // DEBUG draw entity_collision_map
    // state.entity_collision_map.forEach(function(r_map, r) {  // for r in state.entity_collision_map
    //   if (BACON >= 0) { console.log(r_map); BACON -= 1; }
    //   fillTextAtGridCoords(r, state.camera_col - horizontal_buffer + 1, r, "red");
    //   r_map.forEach(function(c_map, c) {  // for c in state.entity_collision_map[r]
    //     fillTextAtGridCoords(r, c, c, "green");
    //     if (BACON >= 0) { console.log(state.entity_collision_map.get(r).get(c)); BACON -= 1; }
    //     c_map.forEach(function(id_map, id) {  // for id in state.entity_collision_map[r][c]
    //       // fillRectAtGridCoords(Number(r), Number(c), "map", "black");
    //       // fillTextAtGridCoords(r, c, state.entity_collision_map.get(r).get(c).get(id).type, "black");
    //     });
    //   });
    // });
  }

  if (SHOW_FPS) {
    var display_last_time_prev = display_last_time;
    display_last_time = Date.now();
    var emp_fps = 1000.0 / (display_last_time - display_last_time_prev)
    game.context.fillStyle = 'green';
    game.context.font = 'bold ' + 60 + 'px serif';
    game.context.textAlign = 'center';
    game.context.fillText(
      Math.floor(emp_fps).toString(),
      70,
      70,
      game.canvas.width / 20,
    );
  }
}

var display_last_time = Date.now();

var BACON = 5;

function fillRectAtGridCoords(r, c, fill_style) {
  var tile_canvas_width = tile_width / 100.0 * game.canvas.width;
  var tile_canvas_height = tile_height / 100.0 * game.canvas.height;
  var x = (game.canvas.height / 2) + (c - game.state.camera_col) * (tile_canvas_height);
  var y = (game.canvas.width / 2) + (r - game.state.camera_row) * (tile_canvas_width);
  game.context.fillStyle = fill_style;
  game.context.fillRect(
    x,
    y,
    tile_canvas_width,
    tile_canvas_height,
  )
}


function fillTextAtGridCoords(r, c, text, fill_style) {
  var tile_canvas_width = tile_width / 100.0 * game.canvas.width;
  var tile_canvas_height = tile_height / 100.0 * game.canvas.height;
  var x = (game.canvas.height / 2) + (c - game.state.camera_col) * (tile_canvas_height);
  var y = (game.canvas.width / 2) + (r - game.state.camera_row) * (tile_canvas_width);
  game.context.fillStyle = fill_style;
  game.context.font = 'bold ' + tile_canvas_height + 'px serif';
  game.context.textAlign = 'center';
  game.context.fillText(
    text,
    x + tile_canvas_height / 2,
    y + tile_canvas_height * 3 / 4,
    tile_canvas_width,
  );
}


function drawImageAtGridCoords(r, c, image) {
  var tile_canvas_width = tile_width / 100.0 * game.canvas.width;
  var tile_canvas_height = tile_height / 100.0 * game.canvas.height;
  var x = (game.canvas.height / 2) + (c - game.state.camera_col) * (tile_canvas_height);
  var y = (game.canvas.width / 2) + (r - game.state.camera_row) * (tile_canvas_width);
  game.context.drawImage(
    image,
    x,
    y,
    tile_canvas_width,
    tile_canvas_height,
  );
}


function gameStep() {
  var state = game.state;

  state.frame += 1;

  if (state.mode == MODE_PLAY) {

    // CAMERA UPDATE

    // Update camera if player is getting too far away
    var camera_row_speed = 0;
    var camera_col_speed = 0;
    var row_off = state.player.row - state.camera_row;
    if (row_off > tiles_high / 4) {
      camera_row_speed = Math.pow(row_off - tiles_high / 4, 3) * CAMERA_SMOOTH;  // Keep it smooooth.
    } else if (row_off < -tiles_high / 4) {
      camera_row_speed = Math.pow(tiles_high / 4 + row_off, 3) * CAMERA_SMOOTH;  // Keep it smooooth.
    }
    var col_off = state.player.col - state.camera_col;
    if (col_off > tiles_wide / 4) {
      camera_col_speed = Math.pow(col_off - tiles_wide / 4, 3) * CAMERA_SMOOTH;  // Keep it smooooth.
    } else if (col_off < -tiles_wide / 4) {
      camera_col_speed = Math.pow(tiles_wide / 4 + col_off, 3) * CAMERA_SMOOTH;  // Keep it smooooth.
    }
    // var col_off = state.player.col - state.camera_col;
    // if (Math.abs(col_off) > tiles_wide / 4) {
    //   camera_col_speed = col_off * CAMERA_SMOOTH;  // Keep it smooooth.
    // }
    state.camera_row += camera_row_speed;
    state.camera_col += camera_col_speed;

    // Collision-check camera against the edge of the world
    if (state.level.height - vertical_buffer <= vertical_buffer) {
      state.camera_row = state.level.height / 2;  // view perfectly centered if whole board fits on-screen.
    } else {
      var too_high = state.camera_row < vertical_buffer;
      var too_low = state.camera_row > state.level.height - vertical_buffer;
      if (too_high) {
        state.camera_row = vertical_buffer;
      } else if (too_low) {
        state.camera_row = state.level.height - vertical_buffer;
      }
    }

    if (state.level.width - horizontal_buffer <= horizontal_buffer) {
      state.camera_col = state.level.width / 2;  // view perfectly centered if whole board fits on-screen.
    } else {
      var too_left = state.camera_col < horizontal_buffer;
      var too_right = state.camera_col > state.level.width - horizontal_buffer;
      if (too_left) {
        state.camera_col = horizontal_buffer;
      } else if (too_right) {
        state.camera_col = state.level.width - horizontal_buffer;
      }
    }

    reformCamera(tiles_wide, tiles_high);

    // PLAYER UPDATE
    state.player.row += 0.0006;
    state.player.col -= 0.0006;

    // ENTITIES UPDATE
    state.entities.forEach(function(entity, id) {
      entityUpdate(entity);
    });
  } else {
    console.log("In unimplemented mode: " + state.mode)
  }

  if (!_isndef(state.loading_level)) {
    loadLevel(state.loading_level);
    state.loading_level = undefined
  }

};


// // TODO: Allow all these values to be re-rolled to allow camera zoom
function reformCamera(tiles_high, tiles_wide) {
  tiles_high += 0.02;
  tiles_wide += 0.02;
  tile_height = 100.0 / tiles_high;
  tile_width = 100.0 / tiles_wide;
  horizontal_buffer = (tiles_wide / 2);
  vertical_buffer = (tiles_high / 2);
}


var last_time = Date.now();
function mainLoop() {
  gameStep();
  gameRedraw();

  var current_time = Date.now();
  var desired_delay = (1000.0 / game.fps);
  var next_delay = Math.max(4, desired_delay - (current_time - last_time));
  last_time = current_time;

  // console.log(next_delay)

  setTimeout(mainLoop, next_delay);
}
