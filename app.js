var Steam               = require('steam');
var mysql               = require('mysql');
var SteamUser           = require('steam-user');
var EFriendRelationship = require('steam-user/enums/EFriendRelationship');
var async               = require('async');
var commandLineArgs     = require('command-line-args');
var moment              = require('moment');
    moment.locale('ru');
var FriendState         = require('./modules/friendState');
var ChatState           = require('./modules/chatState');
var GroupState          = require('./modules/groupState');
var UserService         = require('./modules/userService');
var config              = require('./modules/config');
var LogStatus           = require('./modules/logStatus');

const optionDefinitions = [
  { name: 'login',                      alias: 'l',   type: String },
  { name: 'password',                   alias: 'p',   type: String },
  { name: 'mail',                       alias: 'm',   type: String },
  { name: 'groupId',                    alias: 'g',   type: String },
  { name: 'chat_config',                alias: 'c',   type: String },  
  { name: 'friend_invitation_timeout',  alias: 'f',   type: String },
  { name: 'dbHost',                     alias: 'dbh', type: String },
  { name: 'dbUser',                     alias: 'dbu', type: String },
  { name: 'dbPassword',                 alias: 'dbp', type: String },
  { name: 'dbDatabase',                 alias: 'dbd', type: String }
];

//const options = commandLineArgs(optionDefinitions);
var options = {
  "login": "djtaffy1",
  "password": "mxi7mngs4",
  "mail":"",
  "groupId":"103582791459120719",
  "chat_config":"chat_config.xml",
  "friend_invitation_timeout": "60000",
  "dbHost":"localhost",
  "dbUser":"root",
  "dbPassword":"123",
  "dbDatabase":"steam-bot"
};

var userService = new UserService(options);
var steamUser = new SteamUser();

steamUser.logOn({
  "accountName": options.login,
  "password": options.password
});

// // initDB debug sequence
// initDB((err)=>{
//   if (err) throw err;
//   steamUser.logOn({
//     "accountName": options.login,
//     "password": options.password
//   });
// });

// function initDB(callback){
//   userService.dropTable(()=>{
//     var targetSteamIds = config.get("targetSteamIds");  
//     userService.initDBRecords(targetSteamIds, callback);
//   });  
// }
// // =================================================================


function pickAllUsersFromDB(callback){
    // Получить steamId пользователей из БД  
  userService.getSteamIds((err, ids)=>{
    if (err) return callback(err);
    
    async.eachSeries(ids, (steamId, next)=>{

      // Для каждого полученного steamId проверить состояние дружбы
      userService.getFriendState(steamId, (err, friendState)=>{
        if (err) {
          log(LogStatus.WRN, `Не удалось получить из БД friendState для Пользователя ${steamId}`);
          return next();
        }
        switch (friendState) {
          
          // ВОТ ЭТО БУДЕТ ВНИЗУ В ЛУПЕ
          // Пользователь не был приглашен в друзья
          case FriendState.NOT_INVITED:
            // Добавить пользователя в друзья
            // timeout нужен, чтобы бот не спамил
            // выставлять timeout перед switch нет смысла, т.к. некоторые действия timeout не требуют
            setTimeout(()=>{
              addFriend(steamId);            
              return next();
            },10000);
            break;
                    
          // Пользователь находится в друзьях, но переписка с ним еще не началась
          case FriendState.FRIEND:
            // Отправить приветственное сообщение
            // timeout нужен, чтобы бот не спамил
            // выставлять timeout перед switch нет смысла, т.к. некоторые действия timeout не требуют
            setTimeout(()=>{
              sendHelloMessage(steamId);
              return next();
            },10000);
            break;
          
          // Пользователь удалил бота из друзей
          //              либо отклонил приглашение в друзья          
          case FriendState.REMOVED:
          case FriendState.DECLINED:
            // Проверить как давно было отправлено последнее приглашение в друзья
              userService.getLastInvitationDate(steamId, (lastInvitationDate)=>{
                var now = moment().format('x');
                // Если приглашение было отправлено достаточно давно - отправить еще раз
                if (now - lastInvitationDate > options.friend_invitation_timeout) {
                  addFriend(steamId);
                }
              });
              return next();
            break;
          
          // Пользователь приглашен, но еще не принял приглашение в друзья
          case FriendState.INVITED:
          default:            
            return next();
            break;
        }
      });

    },(err)=>{
      if (err) return callback(err);
      return callback(null);
    });
  });
}

function log(status,msg){
  // TODO write log to SQL DB instead
  // TODO separate timestamp, login and message to different fields
  var string = `\n${LogStatus[status]} ${moment().format('L')} ${moment().format('LTS')} : ${options.login} : ${msg}`;  
  var fs = require('fs');
  fs.appendFile(`${options.login}-LOG.txt`, string, function (err) {
    if (err) throw err;    
  });  
}

function addFriend(steamId, callback){
  // check if callback is function
  callback = typeof callback === 'function' ? callback : function(){};
  
  steamUser.addFriend(steamId, (err)=>{
    if (err) {
      log(LogStatus.WRN, `Не смог отправить приглашение в друзья Пользователю ${steamId}`);
      return callback(err);
    }
    log(LogStatus.LOG, `Отправил приглашение в друзья Пользователю ${steamId}`);
    userService.setFriendState(steamId, FriendState.INVITED);
    var now = moment().format('x');
    userService.setLastInvitationDate(steamId, now);
    return callback(null);
  });
}

function sendHelloMessage(steamId) {
  async.series([
    (callback)=>{
        setTimeout(()=>{
          // "Притвориться", что бот печатает сообщение
          steamUser.chatTyping(steamId);
          return callback(null);
        },5000);
    },
    (callback)=>{
        setTimeout(()=>{
          // TODO replace message with config string
          steamUser.chatMessage(steamId, 'Привет');
          userService.setChatState(steamId, ChatState.HELLO_MESSAGE_SENT);
          log(LogStatus.LOG, `Отправил приветствие пользователю ${steamId}`);
          return callback(null);
        },4000);
    }
  ]);
}

function inviteToGroup(steamId) {
  //test hack
  userService.setChatState(steamId, ChatState.GROUP_INVITATION_SENT);
  async.series([
    (callback)=>{
      setTimeout(()=>{
        // "Притвориться", что бот печатает сообщение
        steamUser.chatTyping(steamId);
        return callback(null);
      },5000);
    },
    (callback)=>{
      setTimeout(()=>{
        // TODO replace message with config string
        var msg = 'Мы дарим призы. Чтобы получить подарок, вступи в группу TestRiders';
        steamUser.chatMessage(steamId, msg);
        return callback(null);
      },8000);
    },
    (callback)=>{
      setTimeout(()=>{
        steamUser.inviteToGroup(steamId, options.groupId);
        log(LogStatus.LOG, `Пригласил Пользователя ${steamId} в группу ${options.groupId}`);
        //test hack
        //userService.setChatState(steamId, ChatState.GROUP_INVITATION_SENT);
        return callback(null);
      },9000);
    }
  ]);
}

function handleMessage(steamId) {
  userService.getChatState(steamId, function(err, chatState) {
    switch (chatState) {
      
      // Пользователь отправил сообщение первым - до того, как ему было отправлено приветственное сообщение
      case ChatState.NOT_STARTED:
        //test hack
        //inviteToGroup(steamId);
        break;

      // Пользователь ответил на приветственное сообщение
      case ChatState.HELLO_MESSAGE_SENT:
        userService.setChatState(steamId, ChatState.USER_REPLIED_TO_HELLO);
        inviteToGroup(steamId);
        break;

      // Пользователь ответил на приветствие, но по какой-то причине не был приглашен в группу
      case ChatState.USER_REPLIED_TO_HELLO:                
        // Пригласить в группу
        inviteToGroup(steamId);
        break;
      
      // Пользователь приглашен в группу
      case ChatState.GROUP_INVITATION_SENT:
      default:
        log(LogStatus.LOG, `Получил неожиданное сообщение от Пользователя ${steamId} при состоянии записи ChatState ${ChatState[chatState]}`);
        // Игнорировать пользователя
        break;
    }
  });
}

// Проверить какие пользователи удалили бота из друзей, пока бот был в оффлайне
function checkUnfriended(oldFriendsList, callback){
  var newFriendsList = steamUser.myFriends;  

  var unfriendedIds = [];
  for (var i = 0; i < oldFriendsList.length; i++) {
    var steamId = oldFriendsList[i];
    if (newFriendsList[steamId] == undefined) {
      log(LogStatus.LOG, `Удален из друзей Пользователем ${steamId}, пока был в оффлайне.`);
      unfriendedIds.push(steamId);
    }
  }

  if (unfriendedIds.length == 0) log(LogStatus.LOG, `Ни один пользователь не удалил бота, пока бот был в оффлайне.`);

  async.each(unfriendedIds, (steamId, callback)=>{
    // TODO
    //    если chatState != ChatState.GROUP_INVITATION_SENT (приглашение не высылалось)
    //      обнулить все поля записи с соответствующим steamId кроме lastInvitationDate
    //    иначе установить FriendState.REMOVED
    userService.setFriendState(steamId, FriendState.REMOVED, callback);
  },(err)=>{
    if (err) return callback(err);
    return callback(null);
  });  
}

// Проверить какие пользователи приняли приглашение в друзья, пока бот был в оффлайне
function checkAccepted(oldInvitedList, callback){  
  var newFriendsList = steamUser.myFriends;  
  
  var acceptedList = [];
  for (var i = 0; i < oldInvitedList.length; i++) {
    var steamId = oldInvitedList[i];
    if (newFriendsList[steamId] == EFriendRelationship.Friend){
      log(LogStatus.LOG, `Пользователь ${steamId} принял приглашение в друзья, пока бот был в оффлайне.`);
      acceptedList.push();
    }
  }

  if (acceptedList.length == 0) log(LogStatus.LOG, `Ни один пользователь принял приглашение в друзья, пока бот был в оффлайне.`);

  async.each(acceptedList, (steamId, callback)=>{
    userService.setFriendState(steamId, FriendState.FRIEND, callback);
  },(err)=>{
    if (err) return callback(err);
    return callback(null);
  });    
}

// Проверить добавления-в и удаления-из друзей, произошедшие пока бот был в оффлайне
//  !!!
//  Вызывать, только внутри steamUser.on('friendsList', ()=>{}),
//  т.к. до события 'friendsList' steamUser.myFriends пуст
function checkFriendsAfterOffline(callback){
  //var newFriendsList = steamUser.myFriends;
  
  async.parallel({
    oldFriendsList: function(callback) {
      // Получить список steamId, где FriendState.FRIEND
      userService.getFriends((err, ids)=>{
        if (err) return callback(err);
        return callback(null, ids);
      });
    },
    oldInvitedList: function(callback) {
      // Получить список steamId, где FriendState.INVITED
      userService.getInvited((err, ids)=>{
        if (err) return callback(err);
        return callback(null, ids);
      });
    }
  }, function(err, results) {
    if (err) return callback(err);

    async.series([
      (callback)=>{
        checkUnfriended(results.oldFriendsList, callback);
      },
      (callback)=>{
        checkAccepted(results.oldInvitedList, callback);
      }
    ],function(err,results) {
      if (err) return callback(err);      
      return callback(null);
    });    

  });
}

// Проверить какие пользователи присылали сообщения, пока бот был в оффлайне
// и установить соответствующие статусы в БД
function checkMessagesAfterOffline(sendersIds, callback){
  
  // TODO Установить правильный chatState в зависимости от предыдущего chatState
  for (var i = 0; i < sendersIds.length ;i++) {
    var steamId = sendersIds[i];
    log(LogStatus.LOG, `Пользователь ${steamId} прислал сообщение, пока бот был в оффлайне`);    
  }
    
  return callback(null);  
}

// Обработать записи тех пользователей, которые были добавлены в друзья
// но по какой-то причине которым не было отправлено приветственное сообщение/приглашение в группу
function dispatchOldFriends(callback){
  
  // TODO
  // Выбрать из БД steamId "своих" записей (где botAccountName = options.login)
      //  работа с которыми еще не закончена
      //    chatState != ChatState.GROUP_INVITATION_SENT
      //    chatState != ChatState.GIFT_MESSAGE_SENT
      //      if (FriendState.REMOVED||FriendState.DECLINED){
      //        check lastInvitationDate 
      //      }
  
  return callback(null);
}

function dispatchNewUser(){
  
  userService.pickNewUser((err, steamId)=>{
    if (err) {
      log(LogStatus.WRN, `Произошла ошибка при попытке получения steamId нового пользователя для обработки. Сообщение: ${err.msg}`);
      return;
    }
    // Если пользователь уже находится в друзьях, то по его steamId массив steamUser.myFriends
    // вернет значение из enum EFriendRelationship (Friend либо RequestInitiator)    
    switch(steamUser.myFriends[steamId]){
      case undefined:
        addFriend(steamId);
        break;

      case EFriendRelationship.Friend:
        sendHelloMessage(steamId);
        break;

      // Пользователю был отправлен запрос в друзья, но он его еще не принял
      case EFriendRelationship.RequestInitiator:
        userService.setFriendState(steamId, FriendState.INVITED);
        break;
      
      default:
        log(LogStatus.WRN, `Обнаружено необрабатываемое состояние EFriendRelationship из steamUser.myFriends`);
        break;
    }

    return;
  });  
}

// EVENT LISTENERS

// Обработка события входа в Steam
steamUser.on('loggedOn', function(details) {
  log(LogStatus.LOG, "Зашел в Steam");  
	steamUser.setPersona(SteamUser.EPersonaState.Online);
    
  // Обработка события получения списка друзей
  steamUser.on('friendsList', ()=>{
    // Обработка события получения списка сообщений полученных в оффлайне    
    // 'offlineMessages' обрабатывается внутри обработчика 'friendsList'
    // т.к. впоследствии необходимы данные из обоих событий
    steamUser.on('offlineMessages',(count, sendersIds)=>{
      
      async.series([
        (callback)=>{
          checkFriendsAfterOffline((err)=>{
            if (err) return callback(err);
            return callback(null);
          });
        },
        (callback)=>{
          checkMessagesAfterOffline(sendersIds, (err)=>{
            log(LogStatus.LOG, `Завершил проверки событий, произошедших в оффлайне: изменения в списке друзей, получение сообщений.`);
            if (err) return callback(err);
            return callback(null);
          });
        },
        (callback)=>{
          dispatchOldFriends((err)=>{
            if (err) return callback(err);
            return callback(null);
          });
        },
        ],
        (err,results)=>{
          if (err) throw err;
                    
          // TODO
          // Вычислять timeout по 24часа/кол-во пользователей надо добавить в сутки
          // 86400000/ 125  + (random(-1) * random(0, 60*1000))
          // Главный loop, инициирующий работу с новыми пользователями
          var timeout = 5000;
          setInterval(dispatchNewUser, timeout);          
        }
      );

    });  
  });
});

//TODO Переместить .on('friendMessage') и .on('friendRelationship') перед spamLoop, но проверить, 
//      срабатывают ли события, если пользователь совершил действие, до создания listeners

// Обработка события получения сообщения
steamUser.on('friendMessage',function(steamId, msg) {
  log(LogStatus.LOG, `Получил сообщение от Пользователя ${steamId}: "${msg}"`);
  handleMessage(steamId.getSteamID64());
});

// Обработка события изменения состояния дружбы с пользователем
steamUser.on('friendRelationship', function(sid, eFriendRelationship) {
  var steamId = sid.getSteamID64();
  switch (eFriendRelationship) {

    // Пользователь удалил бота из друзей
    //              либо отклонил приглашение в друзья
    case EFriendRelationship.None:
        userService.getFriendState(steamId, function(err, friendState){
          if (friendState == FriendState.FRIEND) {
            log(LogStatus.LOG, `Удалён из друзей Пользователем ${steamId}`);
            userService.setFriendState(steamId, FriendState.REMOVED);
          } else {
            log(LogStatus.LOG, `Пользователь ${steamId} отклонил приглашение в друзья`);              
            userService.setFriendState(steamId, FriendState.DECLINED);
          }
        });
      break;

    // Пользователь заблокировал бота?
    case EFriendRelationship.Blocked:
      break;

    // Получено пришлашение в друзья от Пользователя
    case EFriendRelationship.RequestRecipient:      
      break;

    // Пользователь принял приглашение в друзья
    case EFriendRelationship.Friend:
      log(LogStatus.LOG, `Пользователь ${steamId} принял приглашение в друзья`);
      userService.setFriendState(steamId, FriendState.FRIEND);
      sendHelloMessage(steamId);
      break;

    // Пользователю отправлено приглашение в друзья
    case EFriendRelationship.RequestInitiator:      
      break;
    case EFriendRelationship.Ignored:
      break;
    case EFriendRelationship.IgnoredFriend:
      break;
    case EFriendRelationship.SuggestedFriend:
      break;
        
    default:
      break;
  }
});

// Обработка события ошибки входа в Steam / фатального дисконнекта
steamUser.on('error', function(err) {
  // Some error occurred during logon
  log(LogStatus.ERR, `Попытка входа в Steam провалилась, либо произошел фатальный дисконнект (Проверь включен ли autoRelogin). Значение события: ${err.eresult}. Смотри https://github.com/SteamRE/SteamKit/blob/SteamKit_1.6.3/Resources/SteamLanguage/eresult.steamd для расшифровки причины.`);	
});

// Обработка события отключения от Steam
steamUser.on('disconnected', function(eresult, msg){
  if (eresult == 0){
    log(LogStatus.ERR, `Отключен от Steam без отправки сообщения о разрыве соединения на сервер. Причина отключения (может быть неопределенной): ${msg}`);
  }
  log(LogStatus.ERR, `Отключен от Steam. Причина отключения (может быть неопределенной): ${msg}`);
});

// Обработка события запроса кода аутентификации SteamGuard
// steamUser.on('steamGuard', function(email, callback, lastCodeWrong){
//   // что-то типа
//   process.on('codeReceived', ()=>{
//     callback(code)
//   });  
// });