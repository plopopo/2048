const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createHarness() {
  const data = new Map();
  const storage = {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
  const context = vm.createContext({ window: { localStorage: storage } });

  ["tile", "grid", "local_storage_manager", "game_manager"].forEach(name => {
    const filename = path.join(__dirname, "..", "js", name + ".js");
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
  });

  function Input() { this.events = {}; }
  Input.prototype.on = function (event, callback) {
    this.events[event] = callback;
  };
  Input.prototype.emit = function (event, value) {
    this.events[event](value);
  };

  function Actuator() { this.messageClears = 0; }
  Actuator.prototype.actuate = function (grid, metadata) {
    this.size = grid.size;
    this.metadata = metadata;
  };
  Actuator.prototype.continueGame = function () { this.messageClears++; };

  return {
    context,
    storage,
    createGame: (size = 4) => new context.GameManager(
      size, Input, Actuator, context.LocalStorageManager
    )
  };
}

function setBoard(harness, game, tiles) {
  game.grid = new harness.context.Grid(game.size);
  game.score = 0;
  game.over = false;
  game.won = false;
  game.keepPlaying = false;
  tiles.forEach(([x, y, value]) => {
    game.grid.insertTile(new harness.context.Tile({ x, y }, value));
  });
}

function tileCount(game) {
  return game.size * game.size - game.grid.availableCells().length;
}

function snapshot(game) {
  return JSON.parse(JSON.stringify(game.serialize()));
}

for (const size of [4, 5, 6, 7, 8]) {
  test(size + "x" + size + " starts with two tiles", () => {
    const game = createHarness().createGame(size);
    assert.equal(game.size, size);
    assert.equal(game.grid.size, size);
    assert.equal(game.grid.cells.length, size);
    assert.equal(game.grid.cells[0].length, size);
    assert.equal(tileCount(game), 2);
    assert.equal(game.actuator.size, size);
  });

  test(size + "x" + size + " merges at every outer edge", () => {
    const harness = createHarness();
    const game = harness.createGame(size);
    const last = size - 1;
    const cases = [
      { direction: 0, tiles: [[last, last - 1, 2], [last, last, 2]],
        destination: { x: last, y: 0 } },
      { direction: 1, tiles: [[0, last, 2], [1, last, 2]],
        destination: { x: last, y: last } },
      { direction: 2, tiles: [[last, 0, 2], [last, 1, 2]],
        destination: { x: last, y: last } },
      { direction: 3, tiles: [[last - 1, last, 2], [last, last, 2]],
        destination: { x: 0, y: last } }
    ];
    game.addRandomTile = function () {};

    cases.forEach(({ direction, tiles, destination }) => {
      setBoard(harness, game, tiles);
      game.inputManager.emit("move", direction);
      assert.equal(game.grid.cellContent(destination).value, 4);
      assert.equal(game.score, 4);
      assert.equal(tileCount(game), 1);
    });
  });

  test(size + "x" + size + " merges each tile only once per move", () => {
    const harness = createHarness();
    const game = harness.createGame(size);
    setBoard(harness, game, [
      [size - 4, size - 1, 2], [size - 3, size - 1, 2],
      [size - 2, size - 1, 4], [size - 1, size - 1, 4]
    ]);
    game.addRandomTile = function () {};
    game.move(3);
    assert.equal(game.grid.cellContent({ x: 0, y: size - 1 }).value, 4);
    assert.equal(game.grid.cellContent({ x: 1, y: size - 1 }).value, 8);
    assert.equal(game.score, 12);
    assert.equal(tileCount(game), 2);
  });

  test(size + "x" + size + " checks for moves in the last row and column", () => {
    const harness = createHarness();
    const game = harness.createGame(size);
    const tiles = [];
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        tiles.push([x, y, (x + y) % 2 ? 4 : 2]);
      }
    }
    setBoard(harness, game, tiles);
    assert.equal(game.movesAvailable(), false);
    const corner = game.grid.cellContent({ x: size - 1, y: size - 1 });
    corner.value = 4;
    assert.equal(game.movesAvailable(), true);
  });

  test(size + "x" + size + " ends when a move fills an unmergeable board", () => {
    const harness = createHarness();
    const game = harness.createGame(size);
    const tiles = [];
    const valueAt = (x, y) => (x + y) % 2 ? 4 : 2;
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size - 1; y++) {
        tiles.push([x, y, valueAt(x, y)]);
      }
      if (x > 0) tiles.push([x, size - 1, valueAt(x - 1, size - 1)]);
    }
    setBoard(harness, game, tiles);
    game.addRandomTile = function () {
      this.grid.insertTile(new harness.context.Tile(
        { x: size - 1, y: size - 1 }, valueAt(size - 1, size - 1)
      ));
    };
    game.move(3);
    assert.equal(tileCount(game), size * size);
    assert.equal(game.over, true);
    assert.equal(game.actuator.metadata.terminated, true);
    assert.equal(game.storageManager.getGameState(), null);
  });

  test(size + "x" + size + " wins at 2048 and can keep playing", () => {
    const harness = createHarness();
    const game = harness.createGame(size);
    setBoard(harness, game, [[size - 2, size - 1, 1024],
      [size - 1, size - 1, 1024]]);
    game.addRandomTile = function () {};
    game.move(3);
    assert.equal(game.won, true);
    assert.equal(game.score, 2048);
    assert.equal(game.isGameTerminated(), true);
    game.inputManager.emit("keepPlaying");
    assert.equal(game.isGameTerminated(), false);
    assert.equal(harness.createGame().isGameTerminated(), false);
    game.move(1);
    assert.equal(game.grid.cellContent({ x: size - 1, y: size - 1 }).value,
      2048);
  });
}

test("switching modes and reloading preserve separate games and best scores", () => {
  const harness = createHarness();
  const game = harness.createGame();
  const saved = new Map();

  for (const size of [4, 5, 6, 7, 8]) {
    game.inputManager.emit("changeSize", String(size));
    assert.equal(game.size, size);
    assert.equal(game.score, 0);
    assert.equal(Number(game.storageManager.getBestScore()), 0);
    setBoard(harness, game, [[size - 1, size - 1, 128]]);
    game.score = size * 100;
    game.actuate();
    saved.set(size, snapshot(game));
  }

  for (const size of [4, 5, 6, 7, 8]) {
    game.inputManager.emit("changeSize", size);
    assert.deepEqual(snapshot(game), saved.get(size));
    assert.equal(Number(game.actuator.metadata.bestScore), size * 100);
    const reloaded = harness.createGame();
    assert.equal(reloaded.size, size);
    assert.deepEqual(snapshot(reloaded), saved.get(size));
  }
});

test("restart resets only the selected mode and retains its best score", () => {
  const harness = createHarness();
  const game = harness.createGame();
  setBoard(harness, game, [[3, 3, 64]]);
  game.score = 400;
  game.actuate();
  const classic = snapshot(game);
  game.inputManager.emit("changeSize", 8);
  setBoard(harness, game, [[7, 7, 128]]);
  game.score = 800;
  game.won = true;
  game.actuate();
  game.inputManager.emit("restart");
  assert.equal(game.size, 8);
  assert.equal(game.score, 0);
  assert.equal(game.won, false);
  assert.equal(tileCount(game), 2);
  assert.equal(Number(game.storageManager.getBestScore()), 800);
  game.inputManager.emit("changeSize", 4);
  assert.deepEqual(snapshot(game), classic);
});

test("existing classic saves and best scores still load", () => {
  const harness = createHarness();
  const oldGame = harness.createGame();
  setBoard(harness, oldGame, [[3, 3, 512]]);
  oldGame.score = 1234;
  oldGame.actuate();
  const saved = snapshot(oldGame);
  harness.storage.removeItem("boardSize");
  assert.equal(JSON.parse(harness.storage.getItem("gameState")).score, 1234);
  assert.equal(harness.storage.getItem("bestScore"), "1234");
  const game = harness.createGame();
  assert.equal(game.size, 4);
  assert.deepEqual(snapshot(game), saved);
  assert.equal(Number(game.actuator.metadata.bestScore), 1234);
});

test("invalid sizes and selecting the active mode leave the game intact", () => {
  const harness = createHarness();
  const game = harness.createGame(6);
  const saved = snapshot(game);
  [6, "6", 3, 9, 5.5, "garbage", null, undefined].forEach(size => {
    game.inputManager.emit("changeSize", size);
    assert.equal(game.size, 6);
    assert.deepEqual(snapshot(game), saved);
  });
});

test("a mismatched saved grid starts fresh without changing another mode", () => {
  const harness = createHarness();
  const classic = harness.createGame();
  setBoard(harness, classic, [[3, 3, 256]]);
  classic.score = 500;
  classic.actuate();
  const saved = snapshot(classic);
  harness.storage.setItem("boardSize", 8);
  harness.storage.setItem("gameState-8", JSON.stringify(saved));

  const game = harness.createGame();
  assert.equal(game.size, 8);
  assert.equal(game.grid.size, 8);
  assert.equal(game.score, 0);
  assert.equal(tileCount(game), 2);
  assert.equal(game.storageManager.getGameState().grid.size, 8);
  game.inputManager.emit("changeSize", 4);
  assert.deepEqual(snapshot(game), saved);
});

test("blocked localStorage keeps mode progress and scores in memory", () => {
  const harness = createHarness();
  Object.defineProperty(harness.context.window, "localStorage", {
    get() { throw new Error("Storage access denied"); }
  });
  const game = harness.createGame(8);
  setBoard(harness, game, [[7, 7, 128]]);
  game.score = 800;
  game.actuate();
  const saved = snapshot(game);
  game.inputManager.emit("changeSize", 4);
  assert.equal(game.score, 0);
  assert.equal(Number(game.storageManager.getBestScore()), 0);
  game.inputManager.emit("changeSize", 8);
  assert.deepEqual(snapshot(game), saved);
  assert.equal(Number(game.storageManager.getBestScore()), 800);
  assert.deepEqual(snapshot(harness.createGame()), saved);
});
