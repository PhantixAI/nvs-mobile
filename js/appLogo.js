/* @flow */
'use strict';

import AppConfig from './AppConfig';

const logos = {
  navodians: require('../img/logos/navodians.png'),
  nitians: require('../img/logos/nitians.png'),
  iitians: require('../img/logos/iitians.png'),
  discourse: require('../img/logos/discourse.png'),
};

export default logos[AppConfig.variant] || logos.discourse;
