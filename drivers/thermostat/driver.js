'use strict';

const querystring = require('querystring');

const request = require('request');
const extend = require('extend');

const API_URL = 'https://api.netatmo.net';

const self = {

  init(devices, callback) {
    // we're ready
    callback();
  },
};

module.exports = self;
