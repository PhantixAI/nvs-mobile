/* @flow */
'use strict';

import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import FontAwesome5 from '@react-native-vector-icons/fontawesome5';
import { ThemeContext } from '../../ThemeContext';
import Common from '../CommonComponents';
import i18n from 'i18n-js';

const FILTERS = ['latest', 'hot', 'top'];

// RN's XHR defaults withCredentials=true which sends stale WebView cookies.
// Setting it false maps to HTTPShouldHandleCookies=NO on iOS and prevents 403s.
function apiGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.withCredentials = false;
    xhr.open('GET', url, true);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.onload = () => {
      const status = xhr.status;
      const responseText = xhr.responseText;
      resolve({
        status,
        ok: status >= 200 && status < 300,
        json: () => Promise.resolve(JSON.parse(responseText)),
      });
    };
    xhr.onerror = () => reject(new Error('Network request failed'));
    xhr.ontimeout = () => reject(new Error('Network request timed out'));
    xhr.timeout = 15000;
    xhr.send();
  });
}

function timeAgo(dateString) {
  if (!dateString) { return ''; }
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) { return `${seconds}s`; }
  if (seconds < 3600) { return `${Math.floor(seconds / 60)}m`; }
  if (seconds < 86400) { return `${Math.floor(seconds / 3600)}h`; }
  if (seconds < 604800) { return `${Math.floor(seconds / 86400)}d`; }
  return `${Math.floor(seconds / 604800)}w`;
}

const TopicFeed = ({ site, onClickTopic, onLogin, tabBarHeight = 0 }) => {
  const theme = useContext(ThemeContext);
  const [topics, setTopics] = useState([]);
  const [categories, setCategories] = useState({});
  const [filterIndex, setFilterIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const authHeaders = site?.authToken ? { 'User-Api-Key': site.authToken } : {};

  const apiGetWithFallback = useCallback(async (url) => {
    let res = await apiGet(url, authHeaders);
    // 403 with an auth key means the stored token is expired — retry without it
    if (res.status === 403 && authHeaders['User-Api-Key']) {
      res = await apiGet(url, {});
    }
    return res;
  }, [site?.authToken]);

  const loadCategories = useCallback(async () => {
    if (!site) { return; }
    try {
      const res = await apiGetWithFallback(`${site.url}/categories.json`);
      if (!res.ok) { return; }
      const json = await res.json();
      const list = json.category_list?.categories || [];
      const map = {};
      list.forEach(c => {
        map[c.id] = c;
        (c.subcategory_list || []).forEach(sub => { map[sub.id] = sub; });
      });
      setCategories(map);
    } catch (e) {
      console.log('TopicFeed: loadCategories error', e);
    }
  }, [site?.url, site?.authToken]);

  const loadTopics = useCallback(async (fi, pg, append = false) => {
    if (!site) { return; }
    try {
      const endpoint = FILTERS[fi];
      const res = await apiGetWithFallback(
        `${site.url}/${endpoint}.json?page=${pg}`,
      );
      if (!res.ok) { return; }
      const json = await res.json();
      const list = json.topic_list?.topics || [];
      setHasMore(!!json.topic_list?.more_topics_url);
      if (append) {
        setTopics(prev => [...prev, ...list]);
      } else {
        setTopics(list);
      }
    } catch (e) {
      console.log('TopicFeed: loadTopics error', e);
    }
  }, [site?.url, site?.authToken]);

  useEffect(() => {
    setLoading(true);
    setPage(0);
    Promise.all([loadCategories(), loadTopics(filterIndex, 0)]).finally(() =>
      setLoading(false),
    );
  }, [site?.url, site?.authToken]);

  const onFilterChange = async (index) => {
    setFilterIndex(index);
    setPage(0);
    setTopics([]);
    setLoading(true);
    await loadTopics(index, 0);
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setPage(0);
    await loadTopics(filterIndex, 0);
    setRefreshing(false);
  };

  const onEndReached = async () => {
    if (loadingMore || !hasMore || topics.length === 0) { return; }
    const next = page + 1;
    setPage(next);
    setLoadingMore(true);
    await loadTopics(filterIndex, next, true);
    setLoadingMore(false);
  };

  const renderCategoryBadge = (categoryId) => {
    const cat = categories[categoryId];
    if (!cat) { return <View style={styles.categoryPlaceholder} />; }
    return (
      <View style={styles.categoryBadge}>
        <View
          style={[styles.categoryDot, { backgroundColor: `#${cat.color}` }]}
        />
        <Text
          style={[styles.categoryName, { color: theme.grayUI }]}
          numberOfLines={1}
        >
          {cat.name}
        </Text>
      </View>
    );
  };

  const renderTopic = ({ item }) => {
    const url = `${site.url}/t/${item.slug}/${item.id}`;
    return (
      <TouchableOpacity
        onPress={() => onClickTopic(url)}
        activeOpacity={0.65}
        style={[styles.topicRow, { borderBottomColor: theme.grayBorder }]}
      >
        <View style={styles.topicMeta}>
          {renderCategoryBadge(item.category_id)}
          <Text style={[styles.timeAgo, { color: theme.grayUI }]}>
            {timeAgo(item.last_posted_at)}
          </Text>
        </View>
        <Text
          style={[styles.topicTitle, { color: theme.grayTitle }]}
          numberOfLines={2}
        >
          {item.unicode_title || item.title}
        </Text>
        <View style={styles.topicStats}>
          <FontAwesome5
            name="reply"
            size={11}
            color={theme.grayUI}
            iconStyle="solid"
          />
          <Text style={[styles.statNum, { color: theme.grayUI }]}>
            {Math.max(0, item.posts_count - 1)}
          </Text>
          <FontAwesome5
            name="heart"
            size={11}
            color={theme.grayUI}
            iconStyle="solid"
            style={styles.statIcon}
          />
          <Text style={[styles.statNum, { color: theme.grayUI }]}>
            {item.like_count || 0}
          </Text>
          <FontAwesome5
            name="eye"
            size={11}
            color={theme.grayUI}
            iconStyle="solid"
            style={styles.statIcon}
          />
          <Text style={[styles.statNum, { color: theme.grayUI }]}>
            {item.views || 0}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSkeleton = () => (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3, 4, 5, 6].map(i => (
        <View
          key={i}
          style={[styles.skeletonItem, { borderBottomColor: theme.grayBorder }]}
        >
          <View
            style={[
              styles.skeletonLine,
              styles.skeletonShort,
              { backgroundColor: theme.grayUILight },
            ]}
          />
          <View
            style={[
              styles.skeletonLine,
              styles.skeletonLong,
              { backgroundColor: theme.grayUILight },
            ]}
          />
          <View
            style={[
              styles.skeletonLine,
              styles.skeletonMedium,
              { backgroundColor: theme.grayUILight },
            ]}
          />
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.grayBackground }]}>
      <View
        style={[
          styles.filterBar,
          {
            backgroundColor: theme.background,
            borderBottomColor: theme.grayBorder,
          },
        ]}
      >
        <Common.Filter
          selectedIndex={filterIndex}
          tabs={['Latest', 'Hot', 'Top']}
          marginHorizontal={'20%'}
          onChange={onFilterChange}
        />
      </View>
      {loading ? (
        renderSkeleton()
      ) : (
        <FlatList
          data={topics}
          renderItem={renderTopic}
          keyExtractor={item => `tf-${item.id}`}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 20 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.grayUI}
              title={i18n.t('loading')}
              titleColor={theme.graySubtitle}
            />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                size="small"
                color={theme.grayUI}
                style={styles.footerSpinner}
              />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ color: theme.grayUI }}>No topics found</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flex: 0,
  },
  topicRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topicMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  categoryPlaceholder: {
    flex: 1,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  categoryName: {
    fontSize: 13,
    flex: 1,
  },
  timeAgo: {
    fontSize: 12,
  },
  topicTitle: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 8,
  },
  topicStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statNum: {
    fontSize: 13,
    marginLeft: 3,
  },
  statIcon: {
    marginLeft: 12,
  },
  footerSpinner: {
    padding: 20,
  },
  empty: {
    alignItems: 'center',
    padding: 40,
  },
  skeletonContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  skeletonItem: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  skeletonLine: {
    borderRadius: 6,
    marginBottom: 10,
    opacity: 0.35,
  },
  skeletonShort: {
    width: '35%',
    height: 11,
  },
  skeletonLong: {
    width: '92%',
    height: 17,
  },
  skeletonMedium: {
    width: '55%',
    height: 11,
  },
});

export default TopicFeed;
