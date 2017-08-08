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
var LogStatus           = require('./modules/logStatus');

/*
  DEBUG ONLY
*/
var config              = require('./modules/config');

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

// TODO uncomment
//const options = commandLineArgs(optionDefinitions);

/*
  DEBUG ONLY
*/
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

/*
  DEBUG ONLY
*/
// initDB((err)=>{
//   if (err) throw err;
//   steamUser.logOn({
//     "accountName": options.login,
//     "password": options.password
//   });
// });

/*
  DEBUG ONLY
*/
// function initDB(callback){
//   userService.dropTable(()=>{
//     var targetSteamIds = config.get("targetSteamIds");  
//     userService.initDBRecords(targetSteamIds, callback);
//   });  
// }
// // =================================================================

/*
  DEBUG ONLY
*/
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
              userService.getLastInvitationDate(steamId, (err, lastInvitationDate)=>{
                if (err) return next(err);
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

/*
  Записать сообщение msg в лог со статусом status

  // TODO писать лог в БД
*/
function log(status,msg){  
  var string = `\n${LogStatus[status]} ${moment().format('L')} ${moment().format('LTS')} : ${options.login} : ${msg}`;  
  var fs = require('fs');
  fs.appendFile(`${options.login}-LOG.txt`, string, function (err) {
    if (err) throw err;    
  });  
}

/*
  Отправить пользователю приглашение в друзья
*/
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

/*
  1. "Притвориться", что бот печатает сообщение
  2. Отправить пользователю приветственное сообщение
  
  // TODO заменить константы timeout-ов числами из конфига
*/
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
          // TODO заменить строковые константы строками из конфига
          steamUser.chatMessage(steamId, 'Привет');
          userService.setChatState(steamId, ChatState.HELLO_MESSAGE_SENT);
          log(LogStatus.LOG, `Отправил приветствие пользователю ${steamId}`);
          return callback(null);
        },4000);
    }
  ]);
}

/*
  1. "Притвориться", что бот печатает сообщение
  2. Отправить пользователю сообщение перед отправкой приглашения
  3. Отправить приглашение

  // TODO заменить константы timeout-ов числами из конфига
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
      },5000);
    },
    (callback)=>{
      setTimeout(()=>{
        // TODO заменить строковые константы строками из конфига
        var msg = 'Мы дарим призы. Чтобы получить подарок, вступи в группу TestRiders';
        steamUser.chatMessage(steamId, msg);
        return callback(null);
      },8000);
    },
    (callback)=>{
      setTimeout(()=>{
        steamUser.inviteToGroup(steamId, options.groupId);
        log(LogStatus.LOG, `Пригласил Пользователя ${steamId} в группу ${options.groupId}`);
        // TODO fix test hack
        //userService.setChatState(steamId, ChatState.GROUP_INVITATION_SENT);
        return callback(null);
      },9000);
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
    if (err) return callback(err);
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
      if (err) return callback(err);      
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
    log(LogStatus.LOG, `Пользователь ${steamId} прислал сообщение, пока бот был в оффлайне`);
    userService.getChatState(senderId,(err,chatState)=>{
      if (err) return callback(err);

      switch(chatState){
        // Пользователь ответил на приветствие/написал первым
        case ChatState.NOT_STARTED:
        case ChatState.HELLO_MESSAGE_SENT:
          // TODO передать сюда callback!
          userService.setChatState(senderId,ChatState.USER_REPLIED);
          break;
        // Пользователь уже что-то отвечал
        case ChatState.USER_REPLIED:
          // Ничего не делать, так как обработчик userService.getRepliedToHello его подберет
          break;
        case ChatState.GROUP_INVITATION_SENT:
        case ChatState.GIFT_MESSAGE_SENT:
          // Ничего не делать, так как приглашение в группу/сообщение о подарке уже выслано
          break;
      }
      // TODO пофиксить, у сеттеров есть callback
      // Есть риск, что сеттеры ChatState вызванные выше не успеют обновить состояние записи
      // но в таком случае пользователь будет обработан при последующем запуске бота      
      return callback(null);
    });
  },(err)=>{
    if (err) return callback(err);
    return callback(null);
  });    
}

/*
  Обработать записи пользователей, которые еще не были приглашены в группу по каким-то причинам
  
  // TODO протестировать
*/
function handleUnfinishedFriends(callback){
  
  // TODO возможно необходимо добавить функцию getInvited, и проверять, как давно отправлялось приглашение
  async.parallel({
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
    if (err) return callback(err);
    
    var removedList = results.removedList;
    var declinedList = results.declinedList;
    var chatNotStartedList = results.chatNotStartedList;
    var repliedToHelloList = results.repliedToHelloList;  
    // removedList и declinedList логично объединить, т.к. к ним
    // применимо единое правило - если пользователя приглашали достаточно давно - пригласить еще раз
    var removedAndDeclinedList = removedList.concat(declinedList);
    
    async.parallel([
      // всем удалившимся и отказавшимся попытаться отправить приглашение в друзья еще раз
      (callback)=>{        
        async.each(removedAndDeclinedList,(steamId, callback)=>{
          userService.getLastInvitationDate(steamId,(err, lastInvitationDate)=>{
            if (err) return callback(err);
            var now = moment().format('x');
            // Если приглашение в друзья было отправлено достаточно давно - отправить еще раз
            if (now - lastInvitationDate > options.friend_invitation_timeout) {
              // TODO проверить на нескольких пользователях
              addFriend(steamId, callback);
            }
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
          sendHelloMessage(chatNotStartedList[i]);
        }
        return callback(null);
      },
      // Всем друзьям, ответившим на приветственное сообщение, отправить приглашение в группу
      (callback)=>{
        for (var i = 0; i < repliedToHelloList.length; i++) {
          inviteToGroup(repliedToHelloList[i]);
        }
        return callback(null);            
      }
    ],    
    (err, results)=>{
      if (err) return callback(err);
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
  steamUser.setPersona(SteamUser.EPersonaState.Online);
  
  // DEBUG
  /* handleUnfinishedFriends((err)=>{
    console.log(err);
  }); */

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
            log(LogStatus.LOG, `Завершил проверки событий, произошедших в оффлайне: изменения в списке друзей, получение сообщений.`);
            if (err) return callback(err);
            return callback(null);
          });
        },
        (callback)=>{
          handleUnfinishedFriends((err)=>{
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
          setInterval(handleNewUser, timeout);          
        }
      );

    });  
  }); 
});

// TODO Переместить .on('friendMessage') и .on('friendRelationship') перед spamLoop, но проверить, 
//      срабатывают ли события, если пользователь совершил действие, до создания listeners

/*
  Обработка события получения сообщения
*/ 
steamUser.on('friendMessage',function(steamId, msg) {
  log(LogStatus.LOG, `Получил сообщение от Пользователя ${steamId}: "${msg}"`);
  handleMessage(steamId.getSteamID64());
});

/*
  Обработка события изменения состояния дружбы с пользователем
*/
steamUser.on('friendRelationship', function(sid, eFriendRelationship) {
  var steamId = sid.getSteamID64();
  handleFriendRelationship(steamId, eFriendRelationship);
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
    log(LogStatus.ERR, `Отключен от Steam без отправки сообщения о разрыве соединения на сервер. Причина отключения (может быть неопределенной): ${msg}`);
  }
  log(LogStatus.ERR, `Отключен от Steam. Причина отключения (может быть неопределенной): ${msg}`);
});

/*
  Обработка события запроса кода аутентификации SteamGuard
*/ 
// steamUser.on('steamGuard', function(email, callback, lastCodeWrong){
//   // что-то типа
//   process.on('codeReceived', ()=>{
//     callback(code)
//   });  
// });