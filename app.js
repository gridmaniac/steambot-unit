var Steam               = require('steam');
var mysql               = require('mysql');
var SteamUser           = require('steam-user');
var EFriendRelationship = require('steam-user/enums/EFriendRelationship');
var async               = require('async');
var commandLineArgs     = require('command-line-args');
var fs                  = require('fs');
var xml2js              = require('xml2js');
var join                = require('path').join;
var moment              = require('moment');
    moment.locale('ru');
var FriendState         = require('./modules/friendState');
var ChatState           = require('./modules/chatState');
var GroupState          = require('./modules/groupState');
var SendThanksState     = require('./modules/sendThanksState');
var UserService         = require('./modules/userService');
var LogStatus           = require('./modules/logStatus');

const optionDefinitions = [
  { name: 'login',                      type: String },
  { name: 'password',                   type: String },
  { name: 'chat_config',                type: String },
  { name: 'repeat_invitation_timeout',  type: Number },
  { name: 'online_action_timeout',      type: Number },
  { name: 'handle_new_user_timeout',    type: Number },
  { name: 'thanksgiving_timeout',       type: Number },  
  
  { name: 'groupId',                    type: String },
  { name: 'dbHost',                     type: String },
  { name: 'dbUser',                     type: String },
  { name: 'dbPassword',                 type: String },
  { name: 'dbDatabase',                 type: String }
];

// Параметры запуска бота. В обычном режиме получаются через командную строку  
var options = {};

// Проверить был ли запущен код через childProcess.fork | https://coderwall.com/p/_gvaoa/detect-if-a-script-has-been-forked-in-nodejs
if (process.send) {
  options = commandLineArgs(optionDefinitions);  
  console.log(options);
} else {
  log(LogStatus.LOG, `Запуск в режиме отладки...`);
  // Если код запущен в режиме отладки параметры командной строки игнорируются
  options = {
    "login": "pimgik",
    "password": "VFVekbxrf49",
    "groupId":"103582791459120719",
    "chat_config":"TestRiders.xml",
    "repeat_invitation_timeout": 60000,
    "online_action_timeout": 60000,
    "handle_new_user_timeout": 120000,
    "thanksgiving_timeout": 30000,
    "dbHost":"localhost",
    "dbUser":"root",
    "dbPassword":"123",
    "dbDatabase":"steam-bot"
  };
}

var userService = new UserService(options);
var steamUser = new SteamUser();
var config = {};
log(LogStatus.LOG, `Получение конфига...`);
// Инициализация
getConfig(options.chat_config, (err, result)=>{  
  if (err) {
    var errMsg = `Не удалось получить конфигурацию.\n    Причина: ${err.message}`;
    log(LogStatus.ERR, errMsg);
    throw new Error(errMsg);
  }

  config = result;
  log(LogStatus.LOG, `Конфиг получен.`);
  log(LogStatus.LOG, `Вход в Steam...`);

  steamUser.logOn({
    accountName: options.login,
    password: options.password,
    dontRememberMachine: true
  });
});

function logon(type, code){
  if (type=="auth"){
    log(LogStatus.LOG, `Получен код auth`);
    steamUser.logOn({
      accountName: options.login,
      password: options.password,
      dontRememberMachine: true,
      authCode: code      
    });
  }

  if (type=="two-factor"){
    log(LogStatus.LOG, `Получен код two-factor`);
    steamUser.logOn({
      accountName: options.login,
      password: options.password,
      dontRememberMachine: true,  
      twoFactorCode: code
    });
  }
}

function getConfig(configName, callback){
  var path = join(__dirname, `chat_configs/${configName}`);
  async.waterfall([
    (callback)=>{
      fs.exists(path, (exists)=>{
        if (!exists) return callback(new Error(`Неверный путь к файлу конфигурации. Путь: ${path}`));
        return callback(null);
      });      
    },
    (callback)=>{
      fs.readFile(path,"utf8",(err, data)=>{
        if (err) return callback(new Error(`Не удалось прочитать содержимое файла конфигурации. Путь: ${path} \n    Причина: ${err.message}`));
        return callback(null, data);
      });
    },
    (data, callback)=>{
      var parser = new xml2js.Parser();
      parser.parseString(data, (err, jsObject)=>{
        if (err) return callback(new Error(`Не удалось преобразовать xml конфигурацию в js-объект. \n    Причина:${err.message}`));
        return callback(null, jsObject.config);
      });
    }
  ],
  (err, result)=>{
    if (err) return callback(err);
    return callback(null, result);
  });
}

/*
  Записать сообщение msg в лог со статусом status
*/
function log(status, msg, debug){
  console.log(`${LogStatus[status]} ${msg}`);  
  if (userService)
    userService.log(LogStatus[status], msg);
}

/*
  Вернуть рандомное значение исходя из timeout
  в диапазоне 0.8 до 1.2 от переданного значения
*/
function blurTimeout(timeout){
  var maxBlur = 1.2;
  var minBlur = 0.8;
  return Math.floor(Math.random() * (timeout*maxBlur - timeout*minBlur)) + timeout*minBlur;
}

/*
  Отправить пользователю приглашение в друзья
*/
function addFriend(steamId, callback){
  // Проверить является ли callback функцией
  callback = typeof callback === 'function' ? callback : function(){};
  
  steamUser.addFriend(steamId, (err)=>{
    if (err) {
      log(LogStatus.WRN, `Не смог отправить приглашение в друзья Пользователю ${steamId}. \n    Причина: ${err.message}`);
      return callback(null);
    }
    log(LogStatus.LOG, `Отправил приглашение в друзья Пользователю ${steamId}`);
    userService.setFriendState(steamId, FriendState.INVITED);
    var now = moment().format('x');
    userService.setLastInvitationDate(steamId, now);
    return callback(null);
  });
}

/*
  1. "Притвориться", что бот печатает сообщение
  2. Отправить пользователю приветственное сообщение
*/
function sendHelloMessage(steamId) {
  async.series([
    (callback)=>{
        setTimeout(()=>{
          // "Притвориться", что бот печатает сообщение
          steamUser.chatTyping(steamId);
          return callback(null);
        }, config.sendHelloMessage[0].readingTimeout[0]);
    },
    (callback)=>{
        setTimeout(()=>{
          var msg = config.sendHelloMessage[0].helloMessage[0];
          steamUser.chatMessage(steamId, msg);
          userService.setChatState(steamId, ChatState.HELLO_MESSAGE_SENT);
          log(LogStatus.LOG, `Отправил приветствие пользователю ${steamId}`);
          return callback(null);
        }, config.sendHelloMessage[0].typingTimeout[0]);
    }
  ]);
}

/*
  1. "Притвориться", что бот печатает сообщение
  2. Отправить пользователю сообщение перед отправкой приглашения
  3. Отправить приглашение
*/
function inviteToGroup(steamId) {
  // TODO fix test hack
  userService.setChatState(steamId, ChatState.GROUP_INVITATION_SENT);
  async.series([
    (callback)=>{
      setTimeout(()=>{
        // "Притвориться", что бот печатает сообщение
        steamUser.chatTyping(steamId);
        return callback(null);
      }, config.inviteToGroup[0].readingTimeout[0]);
    },
    (callback)=>{
      setTimeout(()=>{        
        var msg = config.inviteToGroup[0].responseMessage[0];
        log(LogStatus.LOG, `Отправил Пользователю ${steamId} сообщение о необходимости вступления в группу`);
        steamUser.chatMessage(steamId, msg);
        return callback(null);
      }, config.inviteToGroup[0].typingTimeout[0]);
    },
    (callback)=>{
      setTimeout(()=>{
        steamUser.inviteToGroup(steamId, options.groupId);
        log(LogStatus.LOG, `Пригласил Пользователя ${steamId} в группу ${options.groupId}`);
        // TODO fix test hack
        //userService.setChatState(steamId, ChatState.GROUP_INVITATION_SENT);
        return callback(null);
      }, config.inviteToGroup[0].invitationTimeout[0]);
    }
  ]);
}

/*
  Отправить сообщение с благодарностью за вступление в группу
*/
function sendThanksMessage(steamId) {
  async.series([
    (callback)=>{
      setTimeout(()=>{
        // "Притвориться", что бот печатает сообщение
        steamUser.chatTyping(steamId);
        return callback(null);
      }, config.sendThanksMessage[0].readingTimeout[0]);
    },
    (callback)=>{
      setTimeout(()=>{
        var msg = config.sendThanksMessage[0].thanksMessage[0];
        steamUser.chatMessage(steamId, msg);
        userService.setSendThanksState(steamId, SendThanksState.DONE);
        log(LogStatus.LOG, `Отправил благодарность за вступление в группу Пользователю ${steamId}`);
        return callback(null);
      }, config.sendThanksMessage[0].typingTimeout[0]);
    }
  ]);
}

/*
  Обработать сообщение полученное в онлайне

  ВНИМАНИЕ: вызывать только для обработки сообщений полученных онлайн
            т.к. методы steamUser.chatMessage и steamUser.inviteToGroup не предоставляют callback-ов
            возможно заспамить пользователя одинаковыми соощениями
*/
function handleMessage(steamId) {
  userService.getChatState(steamId, function(err, chatState) {
    if (err) {
      log(LogStatus.WRN, `Не удалось получить chatState Пользователя ${steamId}. \n    Причина: ${err.message}`);
      return;
    }
    switch (chatState) {
      
      // Пользователь отправил сообщение первым - до того, как ему было отправлено приветственное сообщение
      // Пользователь что-то ответил на приветственное сообщение
      case ChatState.NOT_STARTED:        
      case ChatState.HELLO_MESSAGE_SENT:
        userService.setChatState(steamId, ChatState.USER_REPLIED);
        inviteToGroup(steamId);
        break;

      // Пользователь ответил на приветствие, но по какой-то причине не был приглашен в группу
      case ChatState.USER_REPLIED:                
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

/*
  Проверить какие пользователи удалили бота из друзей, пока бот был в оффлайне
*/ 
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

  if (unfriendedIds.length == 0) log(LogStatus.LOG, `Ни один пользователь не удалил бота из друзей, пока бот был в оффлайне.`);

  async.each(unfriendedIds, (steamId, callback)=>{
    userService.setFriendState(steamId, FriendState.REMOVED, callback);
  },(err)=>{    
    if (err) return callback(new Error(`Возникла ошибка при установке friendState для пользователей удаливших бота в оффлайне. \n    Причина: ${err.message}`));
    return callback(null);
  });  
}

/*
  Проверить какие пользователи приняли приглашение в друзья, пока бот был в оффлайне
*/ 
function checkAccepted(oldInvitedList, callback){  
  var newFriendsList = steamUser.myFriends;  
  
  var acceptedList = [];
  for (var i = 0; i < oldInvitedList.length; i++) {
    var steamId = oldInvitedList[i];
    if (newFriendsList[steamId] == EFriendRelationship.Friend){
      log(LogStatus.LOG, `Пользователь ${steamId} принял приглашение в друзья, пока бот был в оффлайне.`);
      acceptedList.push(steamId);
    }
  }

  if (acceptedList.length == 0) log(LogStatus.LOG, `Ни один пользователь не принял приглашение в друзья, пока бот был в оффлайне.`);

  async.each(acceptedList, (steamId, callback)=>{
    userService.setFriendState(steamId, FriendState.FRIEND, callback);
  },(err)=>{
    if (err) return callback(new Error(`Возникла ошибка при установке friendState для пользователей принявших приглашение в друзья в оффлайне. \n    Причина: ${err.message}`));
    return callback(null);
  });    
}

/*
  Проверить добавления-в и удаления-из друзей, произошедшие пока бот был в оффлайне
  
  ВНИМАНИЕ: Вызывать, только внутри steamUser.on('friendsList', ()=>{}),
            т.к. до события 'friendsList' steamUser.myFriends пуст
*/
function checkRelationshipsAfterOffline(callback){
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
      if (err) {
        var errMsg = `Возникла ошибка при обработке изменений в списке друзей произошедших в оффлайне. \n    Причина: ${err.message}`;
        return callback(new Error(errMsg));
      }
      return callback(null);
    });    

  });
}

/*
  Проверить какие пользователи присылали сообщения, пока бот был в оффлайне
  и установить соответствующие статусы в БД

  // TODO протестировать
*/
function checkMessagesAfterOffline(sendersIds, callback){
      
  async.each(sendersIds,(senderId,callback)=>{
    log(LogStatus.LOG, `Пользователь ${senderId} прислал сообщение, пока бот был в оффлайне`);
    userService.getChatState(senderId,(err,chatState)=>{
      if (err) return callback(err);

      switch(chatState){
        // Пользователь ответил на приветствие/написал первым
        case ChatState.NOT_STARTED:
        case ChatState.HELLO_MESSAGE_SENT:
          // TODO протестировать
          userService.setChatState(senderId, ChatState.USER_REPLIED, callback);
          break;
        
        // Пользователь уже что-то отвечал
        // Ничего не делать, так как обработчик userService.getRepliedToHello его подберет        
        case ChatState.USER_REPLIED:
        
        // Пользователь уже получил приглашение в группу/сообщение о подарке
        // Ничего не делать, работа с Пользователем закончена...
        case ChatState.GROUP_INVITATION_SENT:
        case ChatState.GIFT_MESSAGE_SENT:                    

        // chatState будет undefined если пользователь приславший сообщение не записан в БД соответствующей парой steamId-groupId
        // можно игнорировать...
        default:
          return callback(null);
          break;
      }
      // TODO закоментированно т.к. callback передается в setChatState. Убрать после теста
      //return callback(null);
    });
  },(err)=>{
    if (err) {
      var errMsg = `Возникла ошибка при обработке сообщений полученных в оффлайне. \n    Причина: ${err.message}`;
      return callback(new Error(errMsg));
    }
    return callback(null);
  });    
}

/*
  Обработать записи пользователей, которые еще не были приглашены в группу по каким-то причинам
  
  // TODO протестировать
*/
function handleUnfinishedFriends(callback){
    
  async.parallel({
    // Получить записи пользователей, которые
    // давно не отвечают на приглашение в друзья
    invitedList: (callback) => {
      userService.getInvited((err, ids)=>{
        if (err) return callback(err);
        return callback(null, ids);
      });
    },
    // Получить записи пользователей, которые
    // отклонили приглашение в друзья
    declinedList: (callback)=>{
      userService.getDeclined((err, declinedList)=>{
        if (err) return callback(err);
        return callback(null, declinedList);
      });
    },
    // Получить записи пользователей, которые
    // удалили бота из друзей & приглашение в группу не отправлено
    removedList: (callback)=>{
      userService.getRemoved((err, removedList)=>{
        if (err) return callback(err);
        return callback(null, removedList);
      });
    },
    // Получить записи пользователей, которые
    // являются друзьями & переписка не начата
    chatNotStartedList: (callback)=>{
      userService.getChatNotStarted((err, chatNotStartedList)=>{
        if (err) return callback(err);
        return callback(null, chatNotStartedList);
      });
    },
    // Получить записи пользователей, которые
    // являются друзьями & пользователь ответил на приветственное сообщение
    repliedToHelloList: (callback)=>{
      userService.getRepliedToHello((err, repliedToHelloList)=>{
        if (err) return callback(err);        
        return callback(null, repliedToHelloList);
      });
    },
  }, (err, results)=>{
    if (err) return callback(new Error(`Возникла ошибка при получении записей пользователей работа с которыми начата но незавершена. \n    Причина: ${err.message}`));
    
    var invitedList = results.invitedList;
    var removedList = results.removedList;
    var declinedList = results.declinedList;
    var chatNotStartedList = results.chatNotStartedList;
    var repliedToHelloList = results.repliedToHelloList;  
    // invitedList,  removedList, declinedList логично объединить, т.к. к ним
    // применимо единое правило - если пользователя приглашали достаточно давно - пригласить еще раз
    var invitedRemovedDeclinedList = invitedList.concat(removedList.concat(declinedList));
    
    async.parallel([
      // всем давно приглашенным, удалившимся и отказавшимся попытаться отправить приглашение в друзья еще раз
      (callback)=>{        
        async.each(invitedRemovedDeclinedList,(steamId, callback)=>{
          userService.getLastInvitationDate(steamId,(err, lastInvitationDate)=>{
            if (err) return callback(err);
            var now = moment().format('x');
            // Если приглашение в друзья было отправлено достаточно давно - отправить еще раз
            if (now - lastInvitationDate > options.repeat_invitation_timeout) {
              // TODO протестировать
              // timeout против одновременной рассылки
              setTimeout(()=>{
                addFriend(steamId, callback);
              }, blurTimeout(options.online_action_timeout));
            }
            // TODO закомментировано т.к. callback теперь передается в addFriend. Убрать после тестирования
            //return callback(null);
          });     
        },(err)=>{
          if (err) return callback(err);
          return callback(null);
        });        
      },
      // Всем друзьям, с которыми общение не начато, отправить приветственное сообщение
      (callback)=>{
        for (var i = 0; i < chatNotStartedList.length; i++) {          
          // timeout против одновременной рассылки
          setTimeout(()=>{
            sendHelloMessage(chatNotStartedList[i]);
          }, blurTimeout(options.online_action_timeout));
        }
        return callback(null);
      },
      // Всем друзьям, ответившим на приветственное сообщение, отправить приглашение в группу
      (callback)=>{
        for (var i = 0; i < repliedToHelloList.length; i++) {          
          // timeout против одновременной рассылки
          setTimeout(()=>{
            inviteToGroup(repliedToHelloList[i]);
          }, blurTimeout(options.online_action_timeout));          
        }
        return callback(null);            
      }
    ],    
    (err, results)=>{
      if (err) return callback(new Error(`Возникла ошибка при обработке записей пользователей работа с которыми начата но незавершена. \n    Причина: ${err.message}`));
      return callback(null);
    });                      
  });      
}

/*
  Получить из БД steamId и обработать нового пользователя
*/
function handleNewUser(){
  
  userService.pickNewUser((err, steamId)=>{
    if (err) {
      log(LogStatus.WRN, `Произошла ошибка при попытке получения steamId нового пользователя для обработки. \n Сообщение: ${err.message}`);
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

/*
  Получить из БД steamId одного пользователя вступившего в группу и отправить ему сообщение с благодарностью  
*/
function handleThanksgiving(){
  userService.getThankworthyUserSteamId((err, steamId)=>{        
    if (err) {
      log(LogStatus.ERR, err.message);
      return;
    };
    // Если steamId undefined, значит новых вступивших в группу не появилось...
    if (!steamId)
      return;
    // timeout не обязателен, так метод вызывается внутри setInterval и только для одной записи
    sendThanksMessage(steamId);
  });
}

/*
  Обработка изменения состояния дружбы с пользователем, во время онлайна

  ВНИМАНИЕ: вызывать только внутри steamUser.on('friendRelationship')            
            обрабатывать события произошедшие в оффлайне необходимо отдельно
            иначе возможен спам одного пользователя несколькими обработчиками
*/
function handleFriendRelationship(steamId, eFriendRelationship){
  
  switch (eFriendRelationship) {
    // Пользователь удалил бота из друзей
    //              либо отклонил приглашение в друзья
    case EFriendRelationship.None:      
      userService.getFriendState(steamId, function(err, friendState){
        if (err) {
          log(`Возникла ошибка при попытке получения friendState записи Пользователя ${steamId} \n    Причина: ${err.message}`);
          return;
        }
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
}

// EVENT LISTENERS

/*
  Точка входа в логику работы со Steam
  Обработка события входа в Steam
*/ 
steamUser.on('loggedOn', function(details) {
  log(LogStatus.LOG, "Зашел в Steam");  
  
  // TODO протестировать  
  // Установка статуса Offline, чтобы пользователи писали сообщения, прежде чем бот будет готов их обработать
  steamUser.setPersona(SteamUser.EPersonaState.Offline);
    
  // Обработка события получения списка друзей
  steamUser.on('friendsList', ()=>{
    // Обработка события получения списка сообщений полученных в оффлайне    
    // 'offlineMessages' обрабатывается внутри обработчика 'friendsList'
    // т.к. впоследствии необходимы данные из обоих событий
    steamUser.on('offlineMessages',(count, sendersIds)=>{
      
      async.series([        
        (callback)=>{
          checkRelationshipsAfterOffline((err)=>{
            if (err) return callback(err);
            return callback(null);
          });
        },
        (callback)=>{
          checkMessagesAfterOffline(sendersIds, (err)=>{            
            if (err) return callback(err);
            log(LogStatus.LOG, `Завершил процедуру проверки событий, произошедших в оффлайне...`);
            return callback(null);
          });
        },
        (callback)=>{
          handleUnfinishedFriends((err)=>{
            if (err) return callback(err);
            log(LogStatus.LOG, `Завершил обработку ранее добавленных пользователей, работа с которыми не была завершена...`);
            return callback(null);
          });
        },
        ],
        (err,results)=>{
          if (err) {
            var errMsg = `Не удалось запустить основной цикл обработки пользователей. \n    Причина: ${err.message}`;
            log(LogStatus.ERR, errMsg);
            return;
          }
          
          log(LogStatus.LOG, `Запустил основной цикл обработки пользователей...`);

          // Начало обработки онлайн событий и работы с новыми пользователями
          steamUser.setPersona(SteamUser.EPersonaState.Online);

          /*
            Обработка события получения сообщения
            // TODO протестировать
          */ 
          steamUser.on('friendMessage',function(steamId, msg) {
            log(LogStatus.LOG, `Получил сообщение от Пользователя ${steamId}: "${msg}"`);
            handleMessage(steamId.getSteamID64());
          });

          /*
            Обработка события изменения состояния дружбы с пользователем
            // TODO протестировать
          */
          steamUser.on('friendRelationship', function(sid, eFriendRelationship) {
            var steamId = sid.getSteamID64();
            handleFriendRelationship(steamId, eFriendRelationship);
          });
          
          // TODO решить убрать или оставить этот вызов
          // Взять нового пользователя из БД. Последующие будут обработаны через setInterval
          handleNewUser();

          /*
            С периочностью timeout миллисекунд вызывать метод обрабатывающий нового Пользователя из БД            
          */
          setInterval(handleNewUser, blurTimeout(options.handle_new_user_timeout));
          
          /*
            С периочностью timeout миллисекунд вызывать метод благодарящий одного пользователя вступившего в группу
          */
          setInterval(handleThanksgiving, blurTimeout(options.thanksgiving_timeout));
        }
      );

    });  
  }); 
});

/*
  Обработка события ошибки входа в Steam / фатального дисконнекта
*/
steamUser.on('error', function(err) {
  // Some error occurred during logon
  log(LogStatus.ERR, `Попытка входа в Steam провалилась, либо произошел фатальный дисконнект (Проверь включен ли autoRelogin). Значение события: ${err.eresult}. Смотри https://github.com/SteamRE/SteamKit/blob/SteamKit_1.6.3/Resources/SteamLanguage/eresult.steamd для расшифровки причины.`);	
});

/*
  Обработка события отключения от Steam
*/
steamUser.on('disconnected', function(eresult, msg){
  if (eresult == 0){
    log(LogStatus.ERR, `Отключен от Steam без отправки сообщения о разрыве соединения на сервер. \n    Причина отключения (может быть неопределенной): ${msg}`);
  }
  log(LogStatus.ERR, `Отключен от Steam. \n    Причина отключения (может быть неопределенной): ${msg}`);
});

// /*
//   Обработка события запроса кода аутентификации SteamGuard
// */ 
// steamUser.on('steamGuard', function(email, callback, lastCodeWrong){
//   log(LogStatus.ERR, `Требуется SteamGuard код`);
//   //process.on('getSteamGuardCode',(code)=>{callback(code)});  
// });

process.on('message', (data) => {
  log(LogStatus.LOG,`Получил message от parent...`);  
  if (data.type && (data.type == "auth" || data.type == "two-factor")){
    logon(data.type, data.code);
  }
});