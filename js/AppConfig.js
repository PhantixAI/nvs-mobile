/* @flow */
'use strict';

import Config from 'react-native-config';

export default {
  appName:      Config.APP_NAME      || 'Discourse',
  variant:      Config.APP_VARIANT   || 'discourse',
  siteURL:      Config.APP_SITE_URL  || null,
  urlScheme:    Config.APP_URL_SCHEME || 'discourse',
  primaryColor: Config.APP_PRIMARY_COLOR || '#08c',
  devicePrefix: Config.APP_DEVICE_PREFIX || 'Discourse',
  loginMessage: Config.APP_LOGIN_MESSAGE || 'Welcome! Please log in to continue.',
  sentryDsn: Config.SENTRY_DSN || null,
};
