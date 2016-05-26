'use strict';

const Netatmo = require('netatmo');

module.exports.API_URL = 'https://api.netatmo.net';
const REDIRECT_URI = module.exports.REDIRECT_URI = 'https://callback.athom.com/oauth2/callback/';
const SCOPE = module.exports.SCOPE = 'read_station read_thermostat write_thermostat';

const auth = {
	client_id: Homey.env.CLIENT_ID,
	client_secret: Homey.env.CLIENT_SECRET,
};

const api = module.exports.api = new Netatmo();

module.exports.authenticated = false;
api.on('access_token', accessToken => Homey.manager('settings').set('access_token', accessToken));
api.on('refresh_token', refreshToken => Homey.manager('settings').set('refresh_token', refreshToken));
api.on('authenticated', () => module.exports.authenticated = true);
api.on('error', err => Homey.error(err, err.stack));

module.exports.init = function init() {
	const accessToken = Homey.manager('settings').get('access_token');
	if (accessToken) {
		const refreshToken = Homey.manager('settings').get('refresh_token');
		api.authenticate(Object.assign({}, auth, { access_token: accessToken, refresh_token: refreshToken }));
	}
};

module.exports.authenticate = function authenticate(err, code) {
	return new Promise((resolve, reject) => {
		if (err) {
			reject(err);
			return;
		}

		module.exports.authenticated = false;
		api.on('error', reject);

		api.authenticate(
			Object.assign({}, auth, { code, redirect_uri: REDIRECT_URI, scope: SCOPE }),
			resolve
		);
	});
};
