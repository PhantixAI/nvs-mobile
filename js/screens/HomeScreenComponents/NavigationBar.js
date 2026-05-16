/* @flow */
'use strict';

import React, { useContext } from 'react';
import {
  Image,
  Linking,
  Platform,
  StyleSheet,
  TouchableHighlight,
  View,
} from 'react-native';
import FontAwesome5 from '@react-native-vector-icons/fontawesome5';
import { ThemeContext } from '../../ThemeContext';
import AppConfig from '../../AppConfig';
import appLogo from '../../appLogo';

const NavigationBar = props => {
  const theme = useContext(ThemeContext);

  const renderAuthButton = () => {
    if (Platform.OS !== 'android') {
      return;
    }

    const isLoggedIn = props.isLoggedIn;
    return (
      <TouchableHighlight
        style={styles.androidAuthButton}
        underlayColor={'transparent'}
        onPress={isLoggedIn ? props.onDidPressLogout : props.onDidPressLogin}
      >
        <FontAwesome5
          name={isLoggedIn ? 'sign-out-alt' : 'sign-in-alt'}
          size={20}
          style={{ color: theme.grayUI }}
          iconStyle="solid"
        />
      </TouchableHighlight>
    );
  };

  const renderPlusButton = () => {
    if (!props.onDidPressPlusIcon) {
      return null;
    }
    return (
      <TouchableHighlight
        style={styles.plusButton}
        underlayColor={'transparent'}
        testID="nav-plus-icon"
        onPress={props.onDidPressPlusIcon}
      >
        <FontAwesome5
          name={'plus'}
          size={20}
          style={{ color: theme.grayUI }}
          iconStyle="solid"
        />
      </TouchableHighlight>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.titleContainer}>
        <TouchableHighlight
          underlayColor={'transparent'}
          onPress={() => Linking.openURL(AppConfig.siteURL)}
        >
          <Image
            source={appLogo}
            style={{ width: 26, height: 26 }}
            resizeMode="contain"
          />
        </TouchableHighlight>
      </View>
      {renderAuthButton()}
      {renderPlusButton()}
      <View
        style={[styles.separator, { backgroundColor: theme.grayBackground }]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: Platform.OS === 'ios' ? 50 : 60,
  },
  titleContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 0,
  },
  separator: {
    bottom: 0,
    height: 1,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  androidAuthButton: {
    position: 'absolute',
    right: 6,
    top: 6,
    backgroundColor: 'transparent',
    padding: 12,
  },
  plusButton: {
    position: 'absolute',
    left: 6,
    top: 6,
    backgroundColor: 'transparent',
    padding: 12,
  },
});

export default NavigationBar;
