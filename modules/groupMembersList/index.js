var async = require('async');
var request = require('request');
var xml2js = require('xml2js');
var fs = require('fs');
var Memcached = require('memcached');
var memcached = new Memcached('127.0.0.1:11211');

// TODO get options from to config.json
var options = {
  cacheLifeTimeSeconds: 3600,
  groupName: 'SuperiorServers'
}

function downloadList(callback){
  var list = [
    'value1',
    'value2',
    'value3',
    'value4',
    'value5'
  ];
  return callback(null,list);
}

module.exports = groupMembersList;
function groupMembersList() {}

groupMembersList.prototype.get = function(callback) {
  memcached.get('data', function (err, data) {
    if (err ||
        !data ||        
        !data.membersList ) {      
      // Attempt to download member list if cache is unavailable or corrupted
      downloadList(function(err, membersList) {
        if (err) {
          //TODO dispatch error
          console.log('Unable to download data');
        }
        memcached.set('data', memberList, 60, function (err) {
          if (err) {
            //TODO dispatch error
            console.log('Unable to write data to memcached storage');
          }
        });
        return callback(err, membersList);
      });
    }
  });
}

// function downloadList(callback) {
//   var parser = new xml2js.Parser();
//   // TODO Rewrite callback hell to async
//   request({
//       url: encodeURI(`http://steamcommunity.com/groups/${options.groupName}/memberslistxml?xml=1`)
//     },
//     function(err, response, body) {
//       // TODO dispatch error
//       parser.parseString(body, function(err, result) {
//         // TODO dispatch error
//         var totalPages = result.memberList.totalPages[0];
//         var IDs = [];
//         async.timesSeries(totalPages, function(n, next) {
//           setTimeout(() => {
//             var pageNumber = n + 1;                        
//             console.log('Page:'+pageNumber);
//             request({
//               url: `http://steamcommunity.com/groups/${options.groupName}/memberslistxml?xml=1&p=${pageNumber}`
//             },
//             function(err, response, body) {
//               // TODO dispatch error
//               parser.parseString(body, function(err, result) {
//                 // TODO dispatch error
//                 var chunkLength = result.memberList.members[0].steamID64.length;
//                 var membersListChunk = result.memberList.members[0].steamID64;
                
//                 for (var i = 0;i < chunkLength; i++) {
//                   // if (membersListChunk[i]=='76561198073408854') {
//                   //   console.log('FOUND');
//                   // }
//                   IDs.push(membersListChunk[i]);
//                 }
//                 next(err);
//               });
//             });
//           }, 5000);          
//         },
//         function(err, info) {
          
//           if (err) {
//             // TODO enhance error format
//             return callback({
//               code: 2,
//               msg: err
//             });
//           }

//           if (IDs.length == 0) {
//             // TODO enhance error format
//             return callback({
//               code:1,
//               msg: "Can't get any group member ID's."
//             });
//           }
   
//           return callback(null, IDs);
//         });
//       });
//     }
//   );
// }

