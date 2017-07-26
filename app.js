var Steam       = require('steam');
var mysql       = require('mysql');
var SteamUser   = require('steam-user');
var async       = require('async');
var FriendState = require('./modules/friendState');
var ChatState   = require('./modules/chatState');
var GroupState  = require('./modules/groupState');
var userService = require('./modules/userService');
var config      = require('./modules/config');

function initDB(callback){
  userService.dropTable(()=>{
    var targetSteamIds = config.get("targetSteamIds");  
    userService.initDBRecords(targetSteamIds, callback);
  });  
}

function sendHelloMessage(steamId) {
  async.series([
    (callback) => {
        setTimeout(()=>{
          steamUser.chatTyping(steamId);
          callback(null);
        },5000);
    },
    (callback) => {
        setTimeout(()=>{
          steamUser.chatMessage(steamId, 'Привет');          
          userService.setChatState(steamId, ChatState.HELLO_MESSAGE_SENT);
          callback(null);
        },4000);
    }
  ]);
}

function handleMessage(steamId) {
  userService.getChatState(steamId, function(err, chatState) {
    switch (chatState) {
      case ChatState.NOT_STARTED:
        // TODO доделать после уточнения сценариев          
        //var msg = 'Привет';
        //steamUser.chatMessage(steamId, msg);        
        break;

      case ChatState.HELLO_MESSAGE_SENT:
        userService.setChatState(steamId, ChatState.USER_REPLIED_TO_HELLO);

        async.series([
          (callback) => {
            setTimeout(()=>{
              steamUser.chatTyping(steamId);
              callback(null);
            },5000);
          },
          (callback) => {
            setTimeout(()=>{
              // TODO replace message with config string
              var msg = 'Мы дарим призы. Чтобы получить подарок, вступи в группу TestRiders';
              steamUser.chatMessage(steamId, msg);
              callback(null);
            },8000);
          },
          (callback) => {
            setTimeout(()=>{
              // TODO replace groupId with config string
              var groupSteamId = "103582791459120719";
              steamUser.inviteToGroup(steamId, groupSteamId);
              userService.setChatState(steamId, ChatState.GROUP_INVINTATION_SENT,function(err, results) {
                if (err) console.log('NOOOO');
                console.log('HORRAY!');                
              });
              callback(null);
            },9000);
          }
        ]);
        break;
      case ChatState.USER_REPLIED_TO_HELLO:        
      case ChatState.GROUP_INVINTATION_SENT:
      default:
        console.log('User talking too much ' + chatState);
        // do nothing
        break;
    }
  });
}

var steamUser = new SteamUser();

initDB((err)=>{
  if (err) throw err;  
  steamUser.logOn({
    "accountName": "djtaffy1",
    "password": "mxi7mngs4"
  });
});

steamUser.on('loggedOn', function(details) {
	console.log("EVENT 'SteamUser: loggedOn' caught");
  console.log("Logged into Steam as " + steamUser.steamID.getSteam3RenderedID());
	steamUser.setPersona(SteamUser.EPersonaState.Online);
  steamUser.gamesPlayed(440);  
  var steamFriends = new Steam.SteamFriends(steamUser.client);  
  
  // Send bunch of friend requests.
  userService.getSteamIds((err, ids)=>{
    if (err) throw err;
    async.eachSeries(ids, (steamId, next) => {
      setTimeout(()=>{
        // TODO take current friendState into account
        steamFriends.addFriend(steamId);
        userService.setFriendState(steamId, FriendState.INVITED);
        var now = (new Date).getTime();
        userService.setLastInvitationDate(steamId, now);
        next();
      },10000);
    },(err)=>{
      if (err) throw err;
      return;
    });
  });
    
  steamUser.on('friendMessage',function(steamId, msg) {
    handleMessage(steamId.getSteamID64());
  });
  
  steamUser.on('offlineMessages',function(count, friends) {
    for (var i = 0; i < friends.length ;i++) {
      handleMessage(friends[i]);
    }
    console.log('');
  });
  
  steamFriends.on('friend', function(steamId, eFriendRelationship) {    
    console.log("EVENT 'steamFriends: friend' caught")
    console.log("----steamId:");
    console.log(steamId);
    console.log("----eFriendRelationship value:");
    console.log(eFriendRelationship);    
    
    if (eFriendRelationship == Steam.EFriendRelationship.None) {
      userService.getFriendState(steamId, function(err, friendState){
        if (friendState == FriendState.FRIEND) {
          console.log('Removed');
          userService.setFriendState(steamId, FriendState.REMOVED);
        } else {
          console.log('Declined');
          userService.setFriendState(steamId, FriendState.DECLINED);
        }
      });
      console.log('Steam.EFriendRelationship.None');
    }
    
    if (eFriendRelationship == Steam.EFriendRelationship.Blocked) {
      //console.log('Steam.EFriendRelationship.Blocked');
    }

    // ?
    if (eFriendRelationship == Steam.EFriendRelationship.PendingInvitee) {
      //console.log('Steam.EFriendRelationship.PendingInvitee');
    }

    if (eFriendRelationship == Steam.EFriendRelationship.RequestRecipient) {
      //console.log('Steam.EFriendRelationship.RequestRecipient');
    }
    if (eFriendRelationship == Steam.EFriendRelationship.RequestInitiator) {
      //console.log('Steam.EFriendRelationship.RequestInitiator');
    }

    // ?
    if (eFriendRelationship == Steam.EFriendRelationship.PendingInviter) {
      //console.log('Steam.EFriendRelationship.PendingInviter');
    }

    if (eFriendRelationship == Steam.EFriendRelationship.Friend) {
      userService.getFriendState(steamId, function(err, friendState) {
        if (friendState == FriendState.INVITED) {
          userService.setFriendState(steamId, FriendState.FRIEND);
          sendHelloMessage(steamId);
        }
      });
    }

    if (eFriendRelationship == Steam.EFriendRelationship.Ignored) {
      console.log('Steam.EFriendRelationship.Ignored');
    }

    if (eFriendRelationship == Steam.EFriendRelationship.IgnoredFriend) {
      console.log('Steam.EFriendRelationship.IgnoredFriend');
    }

    if (eFriendRelationship == Steam.EFriendRelationship.SuggestedFriend) {
      console.log('Steam.EFriendRelationship.SuggestedFriend');
    }
    
  });

  // TODO: is it better to use 'message' event to capture both 'friendMsg' and 'chatMsg' events? | https://github.com/seishun/node-steam/tree/master/lib/handlers/friends#friendmsg
  steamFriends.on('friendMsg',function(steamId,msg,chatEntryType) {
    console.log("---'friendMsg' event caught---");
    console.log("---steamId:");
    console.log(steamId);
    console.log("---msg:");
    console.log(msg);
    console.log("---chatEntryType value:");
    console.log(chatEntryType);
    console.log("---chatEntryType type:");
    console.log(Steam.EChatEntryType[chatEntryType]);
    console.log('_');
  });

});

steamUser.on('error', function(event) {
	// Some error occurred during logon
	console.log(event);
});