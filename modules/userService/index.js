var async       = require('async');
var mysql       = require('mysql');
var FriendState = require('../friendState');
var ChatState   = require('../chatState');
var GroupState  = require('../groupState');
var config      = require('../config');

var botAccountName = config.get('botAccountName');

var connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '123',
  database: 'steam-bot'
});

// function isRecordExists(steamId, callback){
//   connection.query('SELECT COUNT(*) FROM users WHERE steamId = ?',[steamId],function(err, results, fields) {
//     if (err) return callback(err);
//     console.log(results);
//     if (results.count != 0) {
//       return callback(null, true);
//     } else {
//       return callback(null, false);
//     }
//   });
// }

function queryResultsToArray(fieldname, resultsObject) {
  var array = [];
  for (var i = 0; i < resultsObject.length; i++) {
    array.push(resultsObject[i][fieldname]);
  }
  return array;
}

function updateFieldBySteamId(steamId, fieldName, value,  callback){
  // check if callback is function
  callback = typeof callback === 'function' ? callback : function(){};

  connection.query(`UPDATE users SET ?? = ? WHERE steamId = ?`, [fieldName, value, steamId], function(err, results, fields) {
    if (err) return callback(err);
    if (results.affectedRows == 0) return callback({
      msg: `UPDATE: 0 rows where affected`
    });
    console.log(results);
    return callback(null, results);
  });
}

function selectFieldBySteamId(steamId, fieldName, callback) {
  connection.query('SELECT ?? FROM users WHERE steamId = ?', [fieldName, steamId], function (err, results, fields) {
    if (err) return callback(err);
    
    if (results.length == 0) return callback({
      msg: `SELECT: 0 rows found for given steamId ${steamId}`
    });    

    return callback(null, results[0][fieldName]);
  });
}

// TODO think where to plug connection end();
//connection.connect();

module.exports = {

  dropTable: function(callback){
    connection.query('DELETE FROM users',(err,results)=>{
      if (err) return callback(err);
      return callback(null);
    });
  },

  initDBRecords: function (targetSteamIds, callback){
    if (targetSteamIds.length == 0) {
      callback({msg:"No steamIds were passed to the function"});
    }
    
    async.eachSeries(targetSteamIds, (steamId, next) => {
      connection.query(
        `INSERT INTO users`+
        ` (steamId, friendState, chatState, groupState, botAccountName, lastInvitationDate, sendThanks)`+
        ` VALUES`+
        ` (${steamId}, 0, 0, 0, "${botAccountName}", null, null)`,
        (err, results)=>{
          // TODO risky?
          next();
        }
      );
    },(err)=>{
      if (err) return callback(err);
      return callback(null);
    });
  },

  getSteamIds: function(callback) {
    connection.query(`SELECT * FROM users WHERE botAccountName = "${botAccountName}"`, function (err, results, fields) {
      if (err) return callback(err);                  
      var ids = queryResultsToArray("steamId", results);
      return callback(null, ids);
    });
  },

  setFriendState : function(steamId, friendState, callback) {
    updateFieldBySteamId(steamId, "friendState", friendState, callback);
  },

  getFriendState : function(steamId, callback) {
    selectFieldBySteamId(steamId, "friendState", callback);
  },

  setChatState : function(steamId, chatState, callback) {
    updateFieldBySteamId(steamId, "chatState", chatState, callback);
  },

  getChatState : function(steamId, callback) {
    selectFieldBySteamId(steamId, "chatState", callback);
  },

  setGroupState : function(steamId, groupState, callback) {
    updateFieldBySteamId(steamId, "groupState", groupState, callback);
  },

  getGroupState : function(steamId, callback) {
    selectFieldBySteamId(steamId, "groupState", callback);
  },

  setBotAccountName : function(steamId, botAccountName, callback) {
    updateFieldBySteamId(steamId, "botAccountName", botAccountName, callback);
  },

  getBotAccountName : function(steamId, callback) {
    selectFieldBySteamId(steamId, "botAccountName", callback);
  },

  setLastInvitationDate : function(steamId, lastInvitationDate, callback) {
    updateFieldBySteamId(steamId, "lastInvitationDate", lastInvitationDate, callback);
  },

  getLastInvitationDate : function(steamId, callback) {
    selectFieldBySteamId(steamId, "lastInvitationDate", callback);
  },

  getSendThanks : function(steamId, callback) {
    selectFieldBySteamId(steamId, "sendThanks", callback);
  }
}