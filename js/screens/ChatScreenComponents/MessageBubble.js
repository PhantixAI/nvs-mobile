/* @flow */
'use strict';

import React, { useContext } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { ThemeContext } from '../../ThemeContext';

function timeAgo(dateString) {
  if (!dateString) { return ''; }
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) { return `${seconds}s`; }
  if (seconds < 3600) { return `${Math.floor(seconds / 60)}m`; }
  if (seconds < 86400) { return `${Math.floor(seconds / 3600)}h`; }
  if (seconds < 604800) { return `${Math.floor(seconds / 86400)}d`; }
  return `${Math.floor(seconds / 604800)}w`;
}

const MessageBubble = ({ message, siteUrl, showHeader, isOwn }) => {
  const theme = useContext(ThemeContext);

  const avatarUrl = message.user?.avatar_template
    ? siteUrl + message.user.avatar_template.replace('{size}', '40')
    : null;

  return (
    <View style={[styles.row, isOwn && styles.rowOwn]}>
      {!isOwn && (
        <View style={styles.avatarSlot}>
          {showHeader && avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarSpacer} />
          )}
        </View>
      )}
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther, {
        backgroundColor: isOwn ? theme.blueCallToAction : theme.background,
      }]}>
        {showHeader && !isOwn && (
          <Text style={[styles.username, { color: theme.purpleChat }]}>
            {message.user?.username || ''}
          </Text>
        )}
        <Text style={[styles.messageText, { color: isOwn ? '#fff' : theme.grayTitle }]}>
          {message.message || ''}
        </Text>
        <Text style={[styles.timestamp, { color: isOwn ? 'rgba(255,255,255,0.65)' : theme.grayUI }]}>
          {timeAgo(message.created_at)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: 2,
    paddingHorizontal: 12,
  },
  rowOwn: {
    justifyContent: 'flex-end',
  },
  avatarSlot: {
    width: 36,
    marginRight: 8,
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarSpacer: {
    width: 32,
    height: 32,
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleOther: {
    borderBottomLeftRadius: 4,
  },
  bubbleOwn: {
    borderBottomRightRadius: 4,
  },
  username: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 3,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
});

export default MessageBubble;
