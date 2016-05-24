'use strict';

const request = require('request');
const Netatmo = require('netatmo');

module.exports.API_URL = 'https://api.netatmo.net';
const REDIRECT_URI = module.exports.REDIRECT_URI = 'https://callback.athom.com/oauth2/callback/';
const SCOPE = module.exports.SCOPE = 'read_station%20read_thermostat%20write_thermostat%20read_camera';

const auth = {
	client_id: Homey.env.CLIENT_ID,
	client_secret: Homey.env.CLIENT_SECRET,
};

const api = module.exports.api = new Netatmo();

module.exports.authenticated = false;
api.on('authenticated', () => module.exports.authenticated = true);
api.on('error', err => Homey.error(err, err.stack));

module.exports.init = function () {
	const accessToken = Homey.manager('settings').get('access_token');
	if (accessToken) {
		const refreshToken = Homey.manager('settings').get('refresh_token');
		api.authenticate(Object.assign({}, auth, { access_token: accessToken, refresh_token: refreshToken }));

		api.getThermostatsData(Homey.log);
	}
};

module.exports.authenticate = function (err, code) {
	return new Promise((resolve, reject) => {
		if (err) {
			reject(err);
			return;
		}

		module.exports.authenticated = false;
		api.on('error', reject);

		api.authenticate(Object.assign({}, auth, { code, redirect_uri: REDIRECT_URI, scope: SCOPE.replace(/%20/g, ' ') }),
			response => {
				Homey.manager('settings').set('access_token', response.access_token);
				Homey.manager('settings').set('refresh_token', response.refresh_token);
				if (response.expires_in) {
					Homey.manager('settings').set('refresh_time', Date.now() + response.expires_in * 1000);
				}
				resolve();
			}
		);
	});
};
