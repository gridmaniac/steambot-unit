/*
Navicat MySQL Data Transfer

Source Server         : default
Source Server Version : 50718
Source Host           : localhost:3306
Source Database       : steam-bot

Target Server Type    : MYSQL
Target Server Version : 50718
File Encoding         : 65001

Date: 2017-07-13 04:54:06
*/

SET FOREIGN_KEY_CHECKS=0;

-- ----------------------------
-- Table structure for `users`
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `friendState` int(11) DEFAULT NULL,
  `steamId` text,
  `chatState` int(11) DEFAULT NULL,
  `groupState` int(11) DEFAULT NULL,
  `botAccountName` text,
  `lastInvitationDate` bigint(11) DEFAULT NULL,
  `sendThanks` tinyint(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=latin1;

-- ----------------------------
-- Records of users
-- ----------------------------
INSERT INTO `users` VALUES ('25', '2', '76561198015639477', '3', '0', 'djtaffy1', '1499906638124', null);
INSERT INTO `users` VALUES ('26', '2', '76561198350152333', '3', '0', 'djtaffy1', '1499906648127', null);
