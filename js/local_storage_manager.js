window.fakeStorage = {
  _data: {},

  setItem: function (id, val) {
    return this._data[id] = String(val);
  },

  getItem: function (id) {
    return this._data.hasOwnProperty(id) ? this._data[id] : undefined;
  },

  removeItem: function (id) {
    return delete this._data[id];
  },

  clear: function () {
    return this._data = {};
  }
};

function LocalStorageManager() {
  this.boardSizeKey = "boardSize";
  this.setSize(4);

  var supported = this.localStorageSupported();
  this.storage = supported ? window.localStorage : window.fakeStorage;
}

// Keep the original storage keys for existing classic games.
LocalStorageManager.prototype.setSize = function (size) {
  var suffix = size === 4 ? "" : "-" + size;
  this.bestScoreKey = "bestScore" + suffix;
  this.gameStateKey = "gameState" + suffix;
};

LocalStorageManager.prototype.getBoardSize = function () {
  var size = Number(this.storage.getItem(this.boardSizeKey));
  return size >= 4 && size <= 8 && size === Math.floor(size) ? size : null;
};

LocalStorageManager.prototype.setBoardSize = function (size) {
  this.storage.setItem(this.boardSizeKey, size);
};

LocalStorageManager.prototype.localStorageSupported = function () {
  var testKey = "test";

  try {
    var storage = window.localStorage;
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return true;
  } catch (error) {
    return false;
  }
};

// Best score getters/setters
LocalStorageManager.prototype.getBestScore = function () {
  return this.storage.getItem(this.bestScoreKey) || 0;
};

LocalStorageManager.prototype.setBestScore = function (score) {
  this.storage.setItem(this.bestScoreKey, score);
};

// Game state getters/setters and clearing
LocalStorageManager.prototype.getGameState = function () {
  var stateJSON = this.storage.getItem(this.gameStateKey);
  try {
    return stateJSON ? JSON.parse(stateJSON) : null;
  } catch (error) {
    return null;
  }
};

LocalStorageManager.prototype.setGameState = function (gameState) {
  this.storage.setItem(this.gameStateKey, JSON.stringify(gameState));
};

LocalStorageManager.prototype.clearGameState = function () {
  this.storage.removeItem(this.gameStateKey);
};
