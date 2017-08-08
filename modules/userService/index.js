var async       = require('async');
var mysql       = require('mysql');
var FriendState = require('../friendState');
var ChatState   = require('../chatState');
var GroupState  = require('../groupState');

module.exports = UserService;

var connection;
var botAccountName;
var groupId;

/*  
  ВНИМАНИЕ: Подразумевается, что один бот использует один UserService!
            Не создавайте более одного экземпляра класса UserService в рамках одного бота!
            Любые методы выполняют запросы с проверкой соответствия полей botAccountName и groupId
            (кроме debug методов, обозначенных явно)
*/
function UserService(options) {
  this.botAccountName = options.login;
  this.groupId = options.groupId;
  this.connection = mysql.createConnection({
    host: options.dbHost,
    user: options.dbUser,
    password: options.dbPassword,
    database: options.dbDatabase
  });
  // dirty hack
  connection = this.connection;
  botAccountName = this.botAccountName;
  groupId = this.groupId;  
}

// Преобразовать результаты запроса по fieldname из resultsObject в обычный массив
function queryResultsToArray(fieldname, resultsObject) {
  var array = [];
  for (var i = 0; i < resultsObject.length; i++) {
    array.push(resultsObject[i][fieldname]);
  }
  return array;
}

// Обновить значение поля fieldName значением value для записи с соответствующим steamId
function updateFieldBySteamId(steamId, fieldName, value,  callback){
  // check if callback is function
  callback = typeof callback === 'function' ? callback : function(){};

  connection.query(`
    UPDATE
      users
    SET
      ${fieldName} = ${value}
    WHERE
      steamId         = "${steamId}"
      AND
      groupId         = "${groupId}"
      AND
      botAccountName  = "${botAccountName}"`,
    (err, results, fields)=>{
      if (err) return callback(err);
      if (results.affectedRows == 0) return callback(new Error("UPDATE: 0 rows where affected"));    
      return callback(null, results);
    }
  );
}

// Получить значение поля fieldName из записи с соответствующим значением steamId
function selectFieldBySteamId(steamId, fieldName, callback) {
  connection.query(`
    SELECT
      ${fieldName}
    FROM
      users
    WHERE
      steamId         = "${steamId}"
      AND
      groupId         = "${groupId}"
      AND
      botAccountName  = "${botAccountName}"`,
    (err, results, fields)=>{
      if (err) return callback(err);
      
      if (results.length == 0)
        return callback(new Error(`SELECT: 0 rows found for given steamId ${steamId}`));    

      return callback(null, results[0][fieldName]);
    }
  );
}

// Выбрать steamId записей, соответствующих условию fieldName == fieldValue
function selectSteamIdsByField(fieldName, fieldValue, callback) {
  connection.query(`
    SELECT
      steamId
    FROM
      users
    WHERE
      ${fieldName}    = "${fieldValue}"
      AND
      groupId         = "${groupId}"
      AND
      botAccountName  = "${botAccountName}"`,
    (err, results, fields)=>{
      if (err) return callback(err);
      
      if (results.length == 0)
        return callback(null, []);

      var steamIds = queryResultsToArray("steamId", results);
      
      return callback(null, steamIds);
    }
  );
}

// use only for debug purposes
// Уничтожаеть ВСЕ записи в таблице users
UserService.prototype.dropTable = function(callback){
  connection.query('DELETE FROM users',(err,results)=>{
    if (err) return callback(err);
    return callback(null);
  });
};

// use only for debug purposes
// Добавить в базу новые записи пользователей из переданных targetSteamIds
// ВНИМАНИЕ: записи создаются сразу с присвоенным botAccountName, соответствующим текущему боту
UserService.prototype.initDBRecords = function (targetSteamIds, callback){
  if (targetSteamIds.length == 0) {
    return callback(new Error("No steamIds were passed to the function"));
  }
  
  async.eachSeries(targetSteamIds, (steamId, next) => {
    connection.query(`
      INSERT INTO
        users(
          steamId,
          groupId,
          friendState,
          chatState,
          groupState,
          botAccountName,
          lastInvitationDate,
          sendThanks)
      VALUES
        (
          "${steamId}",
          "${this.groupId}",
          0,
          0,
          0,
          "${this.botAccountName}",
          null,
          0)`,
      (err, results)=>{
        //if (err) next(err);
        return next();
      }
    );
  },(err)=>{
    if (err) return callback(err);
    return callback(null);
  });
},

// Выбрать нового пользователя: "заблокировать" его запись от других ботов, получить steamId пользователя
UserService.prototype.pickNewUser = function(callback){
  
  async.series({
      // Установить "свой" botAccountName, чтобы другие боты не попытались работать с данной записью
      lockUserRecord: (callback)=>{
        connection.query(`
          UPDATE
            users
          SET
            botAccountName = "${this.botAccountName}"
          WHERE
            botAccountName  IS NULL
            AND
            groupId         = "103582791459120719"
          LIMIT
            1`,
          (err, results, fields)=>{
            if (err) return callback(err);
            if (results.affectedRows == 0) return callback(new Error('В базе нет новых пользователей для обработки'));
            return callback(null);
          }
        );
      },

      // Получить steamId. Есть шанс, что будет взят не той записи, которая была создана, но это не должно вызвать проблем
      getNewUserSteamId:  (callback)=>{
        connection.query(`
          SELECT
            steamId
          FROM
            users
          WHERE
            botAccountName  = "${this.botAccountName}"
            AND
            groupId         = "${this.groupId}"
            AND
            friendState 		= 0
            AND
            chatState				= 0
            AND
            groupState			= 0
            AND
            sendThanks			=	0
          LIMIT
            1`,
          (err, results, fields)=>{
            if (err) return callback(err);
            if (results.length == 0) return callback(new Error('Произошла непредвиденная ошибка при получении новой записи пользователя.'));
            var steamId = results[0]["steamId"];
            return callback(null, steamId);
          }
        );
      }
    },
    (err, results)=>{
      if (err) return callback(err);
      var steamId = results.getNewUserSteamId;
      return callback(null,steamId);
    }
  );
}

/*
  Получить записи тех пользователей, которые: 
    отклонили приглашение в друзья
*/
UserService.prototype.getDeclined = function(callback) {
  connection.query(`
    SELECT
      steamId
    FROM
      users
    WHERE     
      friendState     = ${FriendState.DECLINED}
      AND
      botAccountName  = "${this.botAccountName}"
      AND
      groupId         = "${this.groupId}"`,
    (err, results, fields)=>{
      if (err) return callback(err);
      var steamIds = queryResultsToArray("steamId", results);
      return callback(null, steamIds);
    }
  );
}

/*
  Получить записи тех пользователей, которые: 
    удалили бота из друзей & (приглашение в группу не отправлено || оповещение о подарке не отправлено)
*/
UserService.prototype.getRemoved = function(callback) {
  connection.query(`
    SELECT
      steamId
    FROM
      users
    WHERE     
      friendState     = ${FriendState.REMOVED}      
      AND
      chatState       < ${ChatState.GROUP_INVITATION_SENT}
      AND
      botAccountName  = "${this.botAccountName}"
      AND
      groupId         = "${this.groupId}"`,
    (err, results, fields)=>{
      if (err) return callback(err);
      var steamIds = queryResultsToArray("steamId", results);
      return callback(null, steamIds);
    }
  );
}

/*
  Получить записи тех пользователей, которые: 
    являются друзьями & переписка не начата
*/
UserService.prototype.getChatNotStarted = function(callback) {
  connection.query(`
    SELECT
      steamId
    FROM
      users
    WHERE     
      friendState     = ${FriendState.FRIEND}      
      AND
      chatState       = ${ChatState.NOT_STARTED}
      AND
      botAccountName  = "${this.botAccountName}"
      AND
      groupId         = "${this.groupId}"`,
    (err, results, fields)=>{
      if (err) return callback(err);
      var steamIds = queryResultsToArray("steamId", results);
      return callback(null, steamIds);
    }
  );
}

/*
  Получить записи тех пользователей, которые: 
    являются друзьями & пользователь ответил на приветственное сообщение
*/
UserService.prototype.getRepliedToHello = function(callback) {
  connection.query(`
    SELECT
      steamId
    FROM
      users
    WHERE     
      friendState     = ${FriendState.FRIEND}      
      AND
      chatState       = ${ChatState.USER_REPLIED}
      AND
      botAccountName  = "${this.botAccountName}"
      AND
      groupId         = "${this.groupId}"`,
    (err, results, fields)=>{
      if (err) return callback(err);
      var steamIds = queryResultsToArray("steamId", results);
      return callback(null, steamIds);
    }
  );
}

// use only for debug purposes
// Получить steamId записей относящихся к текущему боту и группе
UserService.prototype.getSteamIds = function(callback) {
  connection.query(`
    SELECT
      steamId
    FROM
      users
    WHERE
      botAccountName  = "${this.botAccountName}"
      AND
      groupId         = "${this.groupId}"`,
    (err, results, fields)=>{
      if (err) return callback(err);                  
      var steamIds = queryResultsToArray("steamId", results);
      return callback(null, steamIds);
    }
  );
}

UserService.prototype.log = function(status, message){
  connection.query(`
    INSERT INTO
      log
         (status,
          timestamp,
          botAccountName,
          message)
    VALUES
        ("${status}",			
          NOW(),
          "${this.botAccountName}",
          "${message}")
    `,(err, results)=>{
      console.log('test');
      //ничего не делать...callback-и от log-ов не нужны
    }
  );
}

UserService.prototype.getFriends = function(callback){
  selectSteamIdsByField("friendState", FriendState.FRIEND, callback);
}

UserService.prototype.getInvited = function(callback){
  selectSteamIdsByField("friendState", FriendState.INVITED, callback);
}

UserService.prototype.setFriendState  = function(steamId, friendState, callback) {
  updateFieldBySteamId(steamId, "friendState", friendState, callback);
}

UserService.prototype.getFriendState  = function(steamId, callback) {
  selectFieldBySteamId(steamId, "friendState", callback);
}

UserService.prototype.setChatState  = function(steamId, chatState, callback) {
  updateFieldBySteamId(steamId, "chatState", chatState, callback);
}

UserService.prototype.getChatState  = function(steamId, callback) {
  selectFieldBySteamId(steamId, "chatState", callback);
}

UserService.prototype.setGroupState  = function(steamId, groupState, callback) {
  updateFieldBySteamId(steamId, "groupState", groupState, callback);
}

UserService.prototype.getGroupState  = function(steamId, callback) {
  selectFieldBySteamId(steamId, "groupState", callback);
}

UserService.prototype.setBotAccountName  = function(steamId, botAccountName, callback) {
  updateFieldBySteamId(steamId, "botAccountName", botAccountName, callback);
}

UserService.prototype.getBotAccountName  = function(steamId, callback) {
  selectFieldBySteamId(steamId, "botAccountName", callback);
}

UserService.prototype.setLastInvitationDate  = function(steamId, lastInvitationDate, callback) {
  updateFieldBySteamId(steamId, "lastInvitationDate", lastInvitationDate, callback);
}

UserService.prototype.getLastInvitationDate  = function(steamId, callback) {
  selectFieldBySteamId(steamId, "lastInvitationDate", callback);
}

UserService.prototype.getSendThanks  = function(steamId, callback) {
  selectFieldBySteamId(steamId, "sendThanks", callback);
}