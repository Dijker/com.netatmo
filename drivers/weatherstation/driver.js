'use strict';

const path = require('path');
const extend = require('util')._extend;

const request = require('request');

const devices = {};

const API_URL = 'https://api.netatmo.net';
const REDIRECT_URI = 'https://callback.athom.com/oauth2/callback/';
const TYPES_MAP = [
  {
    netatmo_name: 'Temperature',
    homey_capability: 'measure_temperature',
  },
  {
    netatmo_name: 'Humidity',
    homey_capability: 'measure_humidity',
  },
  {
    netatmo_name: 'CO2',
    homey_capability: 'measure_co2',
  },
  {
    netatmo_name: 'Pressure',
    homey_capability: 'measure_pressure',
  },
  {
    netatmo_name: 'Noise',
    homey_capability: 'measure_noise',
  },
  {
    netatmo_name: 'Rain',
    homey_capability: 'measure_rain',
  },
  {
    netatmo_name: 'WindStrength',
    homey_capability: 'measure_wind_strength',
  },
  {
    netatmo_name: 'WindAngle',
    homey_capability: 'measure_wind_angle',
  },
  {
    netatmo_name: 'GustStrength',
    homey_capability: 'measure_gust_strength',
  },
  {
    netatmo_name: 'GustAngle',
    homey_capability: 'measure_gust_angle',
  },
];

const self = module.exports = {

  init(devicesData, callback) {
    devicesData.forEach(deviceData => {
      devices[deviceData.id] = {
        data: deviceData,
        state: {},
      };
      refreshState(deviceData.id);
    });

    // update info every 5 minutes
    setInterval(() => {
      Object.keys(devices).forEach(deviceId => refreshState(deviceId));
    }, 1000 * 60 * 5);

    // we're ready
    callback();
  },

  capabilities: {
    // below this is automatically generated
  },

  deleted(deviceData) {
    delete devices[deviceData.id];
  },

  pair(socket) {
    let ACCESS_TOKEN;
    let REFRESH_TOKEN;

    socket.on('start', (data, callback) => {
      Homey.log('NetAtmo pairing has started...');

      // request an authorization url, and forward it to the front-end
      Homey.manager('cloud').generateOAuth2Callback(
        // this is the app-specific authorize url
        `${API_URL}/oauth2/authorize?response_type=code&client_id=${Homey.env.CLIENT_ID}&REDIRECT_URI=${REDIRECT_URI}`,

        // this function is executed when we got the url to redirect the user to
        (err, url) => {
          if (err) return;
          Homey.log('Got url!', url);
          socket.emit('url', url);
        },

        // this function is executed when the authorization code is received (or failed to do so)
        (err, code) => {
          if (err) {
            Homey.error(err);
            socket.emit('authorized', false);
            return;
          }

          Homey.log('Got authorization code!', code);

          // swap the authorization code for a token
          request.post(`${API_URL}/oauth2/token`, {
            form: {
              client_id: Homey.env.CLIENT_ID,
              client_secret: Homey.env.CLIENT_SECRET,
              code,
              redirect_uri: REDIRECT_URI,
              grant_type: 'authorization_code',
              scope: 'read_station',
            },
            json: true,
          }, (err, response, body) => {
            if (err || body.error) {
              Homey.error(err, body.error);
              return socket.emit('authorized', false);
            }
            ACCESS_TOKEN = body.access_token;
            REFRESH_TOKEN = body.refresh_token;
            socket.emit('authorized', true);
          });
        }
      );
    });

    socket.on('list_devices', (data, callback) => {
      call({
        path: '/devicelist?app_type=app_station',
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
      }, (err, response, body) => {
        if (err) return callback(err.message || err.toString(), null);

        const devices = [];

        if (typeof body.body !== 'undefined') {
          body.body.devices.forEach(device => {
            const capabilities = [];
            device.data_type.forEach(dataTypeItem => {
              TYPES_MAP.forEach(typeMap => {
                if (typeMap.netatmo_name.toLowerCase() === dataTypeItem.toLowerCase()) {
                  capabilities.push(typeMap.homey_capability);
                }
              });
            });

            devices.push({
              data: {
                id: device._id,
                access_token: ACCESS_TOKEN,
                refresh_token: REFRESH_TOKEN,
              },
              name: device.station_name,
              capabilities,
            });
          });
        }

        callback(null, devices);
      });
    });

    socket.on('add_device', (device, callback) => {
      devices[device.data.id] = {
        data: device.data,
        state: {},
      };
      refreshState(device.data.id);
    });
  },
};

function call(options, callback) {
  // create the options object
  options = extend({
    path: '/',
    method: 'GET',
    access_token: false,
    refresh_token: false,
    json: true,
  }, options);


  // remove the first trailing slash, to prevent `.nl//foo`
  if (options.path.charAt(0) === '/') options.path = options.path.substring(1);

  // make the request
  request({
    method: options.method,
    url: `${API_URL}/api/${options.path}`,
    qs: options.qs,
    json: options.json,
    headers: {
      Authorization: `Bearer ${options.access_token}`,
    },
  }, (err, response, body) => {
    if (err) return callback(err);

    if (typeof body.error !== 'undefined') {
      /*
       Error codes: https://dev.netatmo.com/doc/methods
       1  : No access token given to the API
       2  : The access token is not valid
       3  : The access token has expired
       4  : Internal error
       5  : The application has been deactivated
       9  : The device has not been found
       10 : A mandatory API parameter is missing
       11 : An unexpected error occured
       13 : Operation not allowed
       15 : Installation of the device has not been finalized
       21 : Invalid argument
       25 : Invalid date given
       26 : Maximum usage of the API has been reached by application
       36 : Your parameter was rejected for safety reasons
       */

      // token expired. refresh it!
      if (body.error.code === 2 || body.error.code === 3) {
        const form = {
          client_id: Homey.env.CLIENT_ID,
          client_secret: Homey.env.CLIENT_SECRET,
          refresh_token: options.refresh_token,
          grant_type: 'refresh_token',
        };

        request.post(`${API_URL}/oauth2/token`, {
          form,
          json: true,
        }, (err, response, body) => {
          if (err || body.error) return callback(new Error('invalid refresh_token'));

          // retry the call with a new access token
          options.access_token = body.access_token;
          call(options, callback);
        });
      } else {
        Homey.error(body.error);
        return callback(body.error);
      }

      return;
    }

    if (typeof callback === 'function') {
      callback(err, response, body);
    }
  });
}

// dynamically generate capability get functions #lazy
TYPES_MAP.forEach(type => {
  self.capabilities[type.homey_capability] = {
    get(deviceData, callback) {
      const device = getDevice(deviceData.id);
      if (device instanceof Error) return callback(device);
      return callback(null, device.state[type.homey_capability]);
    },
  };
});

function getDevice(deviceId) {
  return devices[deviceId] || new Error('Invalid device ID');
}

function refreshState(deviceId, callback) {
  callback = callback || new Function();

  const device = getDevice(deviceId);
  if (device instanceof Error) return callback(device);

  const qs = {
    device_id: deviceId,
    scale: 'max',
    type: [],
    date_end: 'last',
  };

  const types = [];
  TYPES_MAP.forEach(type => {
    types.push(type.netatmo_name);
  });
  qs.type = types.join(',');

  call({
    path: '/getmeasure',
    qs,
    access_token: device.data.access_token,
    refresh_token: device.data.refresh_token,
  }, (err, result, body) => {
    if (err) return callback(err);
    if (body.error) return callback(new Error(body.error));
    if (!Array.isArray(body.body[0].value)) return callback(new Error('invalid body'));
    if (!Array.isArray(body.body[0].value[0])) return callback(new Error('invalid body'));

    body.body[0].value[0].forEach((value, i) => {
      const homeyCapability = TYPES_MAP[i].homey_capability;

      // set state and if changed, emit to Homey
      if (device.state[homeyCapability] !== value) {
        devices[deviceId].state[homeyCapability] = value;
        module.exports.realtime(device.data, homeyCapability, value);
      }
    });

    callback(null, true);
  });
}
