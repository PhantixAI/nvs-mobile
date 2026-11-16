/* @flow */
'use strict';

import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome5 from '@react-native-vector-icons/fontawesome5';
import { ThemeContext } from '../../ThemeContext';
import MessageBubble from './MessageBubble';

// XHR helper — withCredentials=false avoids stale WebView cookies (same pattern as TopicFeed)
function apiXhr(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.withCredentials = false;
    xhr.open(method, url, true);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.timeout = 30000;
    xhr.onload = () => resolve({
      status: xhr.status,
      ok: xhr.status >= 200 && xhr.status < 300,
      json: () => Promise.resolve(JSON.parse(xhr.responseText)),
      text: () => Promise.resolve(xhr.responseText),
    });
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.ontimeout = () => reject(new Error('Timeout'));
    xhr.send(body);
  });
}

const PAGE_SIZE = 50;

const MessageThread = ({ channel, site, siteManager, onBack }) => {
  const theme = useContext(ThemeContext);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [canLoadOlder, setCanLoadOlder] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  const flatListRef = useRef(null);
  const isMounted = useRef(true);
  const lastMsgBusId = useRef(-1);
  const msgBusActive = useRef(false);

  const authHeaders = {
    'User-Api-Key': site.authToken,
    'User-Api-Client-Id': siteManager?.clientId || '',
  };

  // ── Initial message load ──────────────────────────────────────────────────

  const loadMessages = useCallback(async () => {
    try {
      const res = await apiXhr(
        'GET',
        `${site.url}/chat/api/channels/${channel.id}/messages.json?page_size=${PAGE_SIZE}`,
        authHeaders,
      );
      if (!res.ok || !isMounted.current) { return; }
      const json = await res.json();
      const list = json.messages || [];
      setMessages(list);
      setCanLoadOlder(json.meta?.can_load_more_past ?? false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
    } catch (e) {
      console.log('MessageThread: loadMessages error', e);
    } finally {
      if (isMounted.current) { setLoading(false); }
    }
  }, [channel.id, site.url]);

  // ── Load older messages ───────────────────────────────────────────────────

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !canLoadOlder || messages.length === 0) { return; }
    const firstId = messages[0]?.id;
    if (!firstId) { return; }
    setLoadingOlder(true);
    try {
      const res = await apiXhr(
        'GET',
        `${site.url}/chat/api/channels/${channel.id}/messages.json?page_size=${PAGE_SIZE}&before_message_id=${firstId}`,
        authHeaders,
      );
      if (!res.ok || !isMounted.current) { return; }
      const json = await res.json();
      const older = json.messages || [];
      setMessages(prev => [...older, ...prev]);
      setCanLoadOlder(json.meta?.can_load_more_past ?? false);
    } catch (e) {
      console.log('MessageThread: loadOlder error', e);
    } finally {
      if (isMounted.current) { setLoadingOlder(false); }
    }
  }, [loadingOlder, canLoadOlder, messages, channel.id, site.url]);

  // ── MessageBus long-poll ──────────────────────────────────────────────────

  const messageBusPoll = useCallback(async () => {
    if (!isMounted.current || !msgBusActive.current || !site.authToken) { return; }
    try {
      const clientId = siteManager?.clientId || 'rn-client';
      const busChannels = {
        [`/chat/${channel.id}`]: lastMsgBusId.current,
        '/chat/__seq': 0,
      };
      const res = await apiXhr(
        'POST',
        `${site.url}/message-bus/${clientId}/poll`,
        {
          ...authHeaders,
          'Content-Type': 'application/json; charset=utf-8',
          'X-Silence-Logger': 'true',
        },
        JSON.stringify(busChannels),
      );

      if (!isMounted.current || !msgBusActive.current) { return; }

      if (res.ok) {
        const events = await res.json();
        if (Array.isArray(events)) {
          let hasNew = false;
          events.forEach(event => {
            if (event.message_id > lastMsgBusId.current) {
              lastMsgBusId.current = event.message_id;
            }
            const data = event.data;
            if (!data) { return; }
            if (data.type === 'sent' && data.chat_message) {
              setMessages(prev => {
                if (prev.find(m => m.id === data.chat_message.id)) { return prev; }
                return [...prev, data.chat_message];
              });
              hasNew = true;
            }
            if (data.type === 'delete' && data.deleted_id) {
              setMessages(prev => prev.filter(m => m.id !== data.deleted_id));
            }
          });
          if (hasNew) {
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
          }
        }
      }
    } catch (_) {
      await new Promise(r => setTimeout(r, 3000));
    }
    if (isMounted.current && msgBusActive.current) {
      messageBusPoll();
    }
  }, [channel.id, site.url, site.authToken]);

  // ── Mark read ─────────────────────────────────────────────────────────────

  const markRead = useCallback(async (lastMsgId) => {
    if (!site.authToken || !lastMsgId) { return; }
    try {
      await apiXhr(
        'PUT',
        `${site.url}/chat/api/channels/${channel.id}/read/${lastMsgId}`,
        authHeaders,
      );
    } catch (_) {}
  }, [channel.id, site.url, site.authToken]);

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) { return; }
    setSending(true);
    setInputText('');

    const optimistic = {
      id: `opt-${Date.now()}`,
      message: text,
      created_at: new Date().toISOString(),
      user: { username: site.username || 'me', avatar_template: null },
      _optimistic: true,
    };
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const res = await apiXhr(
        'POST',
        `${site.url}/chat/api/channels/${channel.id}/messages`,
        { ...authHeaders, 'Content-Type': 'application/json' },
        JSON.stringify({ message: text }),
      );
      if (!res.ok) {
        setMessages(prev => prev.filter(m => m.id !== optimistic.id));
        setInputText(text);
      }
    } catch (_) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setInputText(text);
    } finally {
      if (isMounted.current) { setSending(false); }
    }
  }, [inputText, sending, channel.id, site.url, site.authToken]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    isMounted.current = true;
    msgBusActive.current = true;
    loadMessages().then(() => {
      if (isMounted.current) { messageBusPoll(); }
    });
    return () => {
      isMounted.current = false;
      msgBusActive.current = false;
    };
  }, []);

  // Android hardware back button — intercept before React Navigation
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  // Mark read after messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      const real = messages.filter(m => !m._optimistic);
      if (real.length > 0) { markRead(real[real.length - 1].id); }
    }
  }, [messages.length]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const currentUsername = site.username || '';

  const dmTitle = () => {
    const users = channel.chatable?.users || [];
    const others = users.filter(u => u.username !== currentUsername);
    const display = others.length > 0 ? others : users;
    return display.map(u => u.username).join(', ') || 'Direct Message';
  };

  const isDM = channel.chatable_type === 'DirectMessage' || channel.chatable_type === 'direct_message';

  const headerTitle = channel.name || channel.title || (isDM ? dmTitle() : 'Chat');

  const renderItem = useCallback(({ item, index }) => {
    const prev = messages[index - 1];
    const showHeader = !prev || prev.user?.username !== item.user?.username;
    const isOwn = item.user?.username === currentUsername;
    return (
      <MessageBubble
        message={item}
        siteUrl={site.url}
        showHeader={showHeader}
        isOwn={isOwn}
      />
    );
  }, [messages, currentUsername, site.url]);

  // ── Layout ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.grayBackground }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.grayBorder }]}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <FontAwesome5 name="chevron-left" size={18} color={theme.blueCallToAction} iconStyle="solid" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.grayTitle }]} numberOfLines={1}>
          {headerTitle}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
      >
        {loading ? (
          <ActivityIndicator style={{ flex: 1 }} size="large" color={theme.grayUI} />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={styles.list}
            onScrollToIndexFailed={() => {}}
            ListHeaderComponent={
              canLoadOlder ? (
                <TouchableOpacity onPress={loadOlder} style={styles.loadOlderBtn}>
                  {loadingOlder
                    ? <ActivityIndicator size="small" color={theme.grayUI} />
                    : <Text style={{ color: theme.blueCallToAction, fontSize: 13 }}>Load older messages</Text>}
                </TouchableOpacity>
              ) : null
            }
          />
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: theme.background, borderTopColor: theme.grayBorder }]}>
          <TextInput
            style={[styles.input, { color: theme.grayTitle, backgroundColor: theme.grayBackground }]}
            placeholder="Message..."
            placeholderTextColor={theme.grayUI}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={4000}
            onSubmitEditing={sendMessage}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            onPress={sendMessage}
            disabled={!inputText.trim() || sending}
            style={[styles.sendBtn, { opacity: inputText.trim() && !sending ? 1 : 0.35 }]}
          >
            <FontAwesome5 name="paper-plane" size={18} color={theme.blueCallToAction} iconStyle="solid" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  list: {
    paddingVertical: 12,
    paddingBottom: 4,
  },
  loadOlderBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: {
    marginLeft: 8,
    padding: 8,
  },
});

export default MessageThread;
