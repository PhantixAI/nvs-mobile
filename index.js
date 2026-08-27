/**
 * @format
 */

import {AppRegistry} from 'react-native';
import * as Sentry from '@sentry/react-native';
import Discourse from './js/Discourse';
import AppConfig from './js/AppConfig';

// Performance/timing monitoring only (see js/screens/SingleSiteWebView.js) —
// not used for crash reporting in this pass, so no Sentry.wrap()/ErrorBoundary.
Sentry.init({
  dsn: AppConfig.sentryDsn,
  enabled: !__DEV__ && !!AppConfig.sentryDsn,
  environment: 'production',
  tracesSampleRate: 0.2,
  initialScope: {
    tags: {app_variant: AppConfig.variant, surface: 'mobile-webview'},
  },
});

AppRegistry.registerComponent('Discourse', () => Discourse);
