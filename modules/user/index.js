var FriendState = require('../friendState');
var ChatState = require('../chatState');
var GroupState = require('../groupState');
var SQL = require('mysql');

function setSteamId(_steamId){  
  steamId = _steamId;
}

module.exports = User;
function User(steamId,
              botAccountName,
              friendState = FriendState.NOT_INVITED,
              chatState = ChatState.NOT_STARTED,
              groupState = GroupState.NOT_IN_GROUP,
              lastInvitationDate = null){
  this._steamId = steamId;    
  this._friendState = friendState;
  this._chatState = chatState;
  this._groupState = groupState;
  this._botAccountName  = botAccountName;
  this._lastInvitationDate = lastInvitationDate;
}

User.prototype.getSteamId = function(){
  return this._steamId;
}

User.prototype.setFriendState = function(friendState){    
  //write to DB
  this._friendState = friendState;
}

User.prototype.getFriendState = function(){
  //get from DB
  return this._friendState;
}

User.prototype.setChatState = function(chatState){    
  this._chatState = chatState;
}

User.prototype.getChatState = function(){
  return this._chatState;
}

User.prototype.setGroupState = function(groupState){    
  this._groupState = groupState;
}

User.prototype.getGroupState = function(){
  return this._groupState;
}

User.prototype.setBotAccountName = function(botAccountName){    
  this._botAccountName = botAccountName;
}

User.prototype.getBotAccountName = function(){
  return this._botAccountName;
}

User.prototype.setLastInvitationDate = function(lastInvitationDate){    
  this._lastInvitationDate = lastInvitationDate;
}

User.prototype.getLastInvitationDate = function(){
  return this._lastInvitationDate;
}