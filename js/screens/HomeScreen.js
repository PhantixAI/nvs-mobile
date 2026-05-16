/* @flow */
'use strict';

import React from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import Components from './HomeScreenComponents';
import TopicFeed from './HomeScreenComponents/TopicFeed';
import Common from './CommonComponents';
import { ThemeContext } from '../ThemeContext';
import AppConfig from '../AppConfig';
import i18n from 'i18n-js';
import { donateShortcut } from 'react-native-siri-shortcut';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, {
  ScaleDecorator,
} from 'react-native-draggable-flatlist';

class HomeScreen extends React.Component {
  _autoOpened = false;

  constructor(props) {
    super(props);

    this._siteManager = this.props.screenProps.siteManager;

    this.state = {
      data: [],
      isRefreshing: false,
      lastRefreshTime: null,
      refreshingEnabled: true,
      loadingSites: this._siteManager.isLoading(),
      authProcessActive: false,
      showTopicList: false,
      selectedTabIndex: 0,
      hotTopicsHidden: false,
      siteURLsHidden: false,
    };

    this._onChangeSites = e => this.onChangeSites(e);
    this.onReordered = this.onReordered.bind(this);
    this._renderItem = this._renderItem.bind(this);
  }

  _tryAutoOpen() {
    if (AppConfig.siteURL) { return; } // native feed handles single-site mode
    if (this._autoOpened) return;
    if (this._siteManager.isLoading()) return;
    const site = this._siteManager.sites[0];
    if (site) {
      this._autoOpened = true;
      this.visitSite(site);
    }
  }

  async visitSite(site, connect = false, endpoint = '', options = {}) {
    this._siteManager.setActiveSite(site);
    this.donateShortcut(site);

    if (options.hotTopic) {
      this.props.screenProps.openUrl(`${site.url}${endpoint}`);
      return;
    }

    if (site.authToken) {
      if (site.oneTimePassword) {
        this.props.screenProps.openUrl(
          `${site.url}/session/otp/${site.oneTimePassword}`,
        );
      } else {
        if (Platform.OS === 'ios') {
          const params = await this._siteManager.generateURLParams(site);
          this.props.screenProps.openUrl(`${site.url}${endpoint}?${params}`);
        } else {
          this.props.screenProps.openUrl(
            `${site.url}${endpoint}?discourse_app=1`,
          );
        }
      }
      return;
    }

    if (connect || site.loginRequired) {
      const authUrl = await this._siteManager.generateAuthURL(site);
      if (Platform.OS === 'ios') {
        this.setState({ authProcessActive: true });
        const requestAuthURL = await this._siteManager.requestAuth(authUrl);

        if (requestAuthURL) {
          this.props.screenProps.openUrl(requestAuthURL);
        } else {
          // TODO: auth got cancelled or error, show a message?
        }
        this.setState({ authProcessActive: false });
      } else {
        this.props.screenProps.openUrl(authUrl);
      }
    } else {
      this.props.screenProps.openUrl(`${site.url}${endpoint}`);
    }
  }

  donateShortcut(site) {
    if (Platform.OS !== 'ios') {
      return;
    }

    const shortcutOptions = {
      // This activity type needs to be set in `NSUserActivityTypes` on the Info.plist
      activityType: 'org.discourse.DiscourseApp.SiriShortcut',
      keywords: ['discourse', 'forums', 'hub', 'discoursehub', site.title],
      persistentIdentifier: 'DiscourseHubShortcut',
      isEligibleForSearch: true,
      isEligibleForPrediction: true,
      suggestedInvocationPhrase: site.title,
      needsSave: true,
      title: `Open ${site.title}`,
      userInfo: {
        siteUrl: site.url,
      },
      requiredUserInfoKeys: ['siteUrl'],
    };

    donateShortcut(shortcutOptions);
  }

  componentDidMount() {
    this._siteManager.subscribe(this._onChangeSites);
    this._onChangeSites();
    if (AppConfig.siteURL) {
      this._tryAutoOpen();
    }
  }

  componentWillUnmount() {
    this._siteManager.unsubscribe(this._onChangeSites);
  }

  onChangeSites(e) {
    if (this._siteManager.isLoading() !== this.state.loadingSites) {
      this.setState({ loadingSites: this._siteManager.isLoading() });
    }
    if (e && e.event) {
      this.setState({
        data: this._siteManager.listSites(),
        hotTopicsHidden: this._siteManager.hotTopicsHidden,
        siteURLsHidden: this._siteManager.siteURLsHidden,
      });
    }
    if (AppConfig.siteURL) {
      this._tryAutoOpen();
    }
  }

  async pullDownToRefresh() {
    this.setState({ isRefreshing: true });
    try {
      await this._siteManager.refreshSites();
    } catch (e) {
      console.log(e);
    } finally {
      this.setState({ isRefreshing: false });
    }
  }

  shouldDisplayOnBoarding() {
    return (
      this._siteManager.sites.length === 0 &&
      !this.refreshing &&
      !this.state.isRefreshing
    );
  }

  _renderTopicListToggle() {
    if (this.state.hotTopicsHidden) {
      return;
    }

    const theme = this.context;

    const publicSiteCount = this._siteManager.sites.filter(
      site => site.loginRequired === false,
    ).length;

    if (publicSiteCount > 0) {
      return (
        <View
          style={{
            flex: 0,
            backgroundColor: theme.background,
            borderBottomColor: theme.grayBorder,
            borderBottomWidth: StyleSheet.hairlineWidth,
            width: '100%',
          }}
        >
          <Common.Filter
            selectedIndex={this.state.selectedTabIndex}
            tabs={[i18n.t('sites'), i18n.t('hot_topics')]}
            marginHorizontal={'20%'}
            onChange={index => {
              this.setState({
                showTopicList: Boolean(index),
                selectedTabIndex: index,
              });
              if (this.dragListRef) {
                this.dragListRef.scrollToOffset({ offset: 0, animated: true });
              }
            }}
          />
        </View>
      );
    }
  }

  _renderItem(row) {
    const { item, drag, isActive } = row;

    return (
      <ScaleDecorator>
        <Components.SiteRow
          site={item}
          siteManager={this._siteManager}
          onClick={(endpoint = '', options = {}) =>
            this.visitSite(item, false, endpoint, options)
          }
          onClickConnect={() => this.visitSite(item, true)}
          onDelete={() => this._siteManager.remove(item)}
          onLongPress={drag}
          disabled={isActive}
          keyExtractor={() => `site-row-${item.url}`}
          showTopicList={this.state.showTopicList}
          showSiteAddress={!this.state.siteURLsHidden}
        />
      </ScaleDecorator>
    );
  }

  onReordered(data) {
    this._siteManager.updateOrder(data);
    this.setState({ data: data, refreshingEnabled: true });
  }

  _renderSites() {
    const theme = this.context;
    if (this.state.loadingSites) {
      return <View style={{ flex: 1 }} />;
    }

    if (this.shouldDisplayOnBoarding()) {
      return (
        <BottomTabBarHeightContext.Consumer>
          {tabBarHeight => (
            <Components.OnBoardingView tabBarHeight={tabBarHeight} />
          )}
        </BottomTabBarHeightContext.Consumer>
      );
    } else {
      return (
        <BottomTabBarHeightContext.Consumer>
          {tabBarHeight => (
            <View style={{ flex: 1 }}>
              {this._renderTopicListToggle()}
              <DraggableFlatList
                ref={ref => {
                  this.dragListRef = ref;
                }}
                contentContainerStyle={{ paddingBottom: tabBarHeight + 20 }}
                activationDistance={20}
                data={this.state.data}
                renderItem={item => this._renderItem(item)}
                keyExtractor={item => `d-item-${item.url}`}
                onDragBegin={() => this.setState({ refreshingEnabled: false })}
                onDragEnd={({ data }) => this.onReordered(data)}
                refreshControl={
                  <RefreshControl
                    enabled={this.state.refreshingEnabled}
                    refreshing={this.state.isRefreshing}
                    onRefresh={() => this.pullDownToRefresh()}
                    title={i18n.t('loading')}
                    titleColor={theme.graySubtitle}
                  />
                }
              />
            </View>
          )}
        </BottomTabBarHeightContext.Consumer>
      );
    }
  }

  async onDidPressLogout() {
    const site = this._siteManager.sites[0];
    if (!site) { return; }
    try {
      await site.revokeApiKey().catch(() => {});
    } finally {
      site.logoff();
      this._siteManager.save();
      this._siteManager._onChange();
    }
  }

  onDidPressPlusIcon() {
    this.props.navigation.navigate('AddSite');
  }

  render() {
    const theme = this.context;

    if (AppConfig.siteURL) {
      const site = this._siteManager.sites[0];

      if (this.state.loadingSites || !site) {
        return (
          <SafeAreaView
            style={[styles.container, { backgroundColor: theme.background }]}
          >
            <ActivityIndicator
              style={{ flex: 1 }}
              size="large"
              color={theme.grayUI}
            />
          </SafeAreaView>
        );
      }

      return (
        <BottomTabBarHeightContext.Consumer>
          {tabBarHeight => (
            <SafeAreaView
              style={[styles.container, { backgroundColor: theme.grayBackground }]}
            >
              <Components.NavigationBar
                isLoggedIn={!!site?.authToken}
                onDidPressLogin={() => this.visitSite(site, true)}
                onDidPressLogout={() => this.onDidPressLogout()}
                onDidPressPlusIcon={null}
              />
              <TopicFeed
                site={site}
                onClickTopic={url => this.props.screenProps.openUrl(url)}
                onLogin={() => this.visitSite(site, true)}
                tabBarHeight={tabBarHeight}
              />
              {this.state.authProcessActive && (
                <View
                  style={{
                    ...styles.authenticatingOverlay,
                    backgroundColor: theme.background,
                  }}
                >
                  <ActivityIndicator size="large" color={theme.grayUI} />
                </View>
              )}
            </SafeAreaView>
          )}
        </BottomTabBarHeightContext.Consumer>
      );
    }

    return (
      <>
        <SafeAreaView
          style={[styles.container, { backgroundColor: theme.background }]}
        >
          <Components.NavigationBar
            isLoggedIn={false}
            onDidPressPlusIcon={() => this.onDidPressPlusIcon()}
          />
          <View
            style={[
              styles.sitesContainer,
              {
                backgroundColor: theme.grayBackground,
              },
            ]}
          >
            {this._renderSites()}
          </View>
          {this.state.authProcessActive && (
            <View
              style={{
                ...styles.authenticatingOverlay,
                backgroundColor: theme.background,
              }}
            >
              <ActivityIndicator size="large" color={theme.grayUI} />
            </View>
          )}
        </SafeAreaView>
      </>
    );
  }
}

HomeScreen.contextType = ThemeContext;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sitesContainer: {
    flex: 1,
  },
  authenticatingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    opacity: 0.75,
  },
});

export default HomeScreen;
