'use strict';

const Netatmo = require('netatmo-homey');

module.exports.API_URL = 'https://api.netatmo.net';
const REDIRECT_URI = module.exports.REDIRECT_URI = 'https://callback.athom.com/oauth2/callback/';
const SCOPE = module.exports.SCOPE = 'read_station read_thermostat write_thermostat';
const DRIVER_NAMES = ['thermostat', 'weatherstation'];

const authConstants = {
	client_id: Homey.env.CLIENT_ID,
	client_secret: Homey.env.CLIENT_SECRET,
	redirect_uri: REDIRECT_URI,
	scope: SCOPE,
};

module.exports.api = {};

function init() {
	// const accessToken = Homey.manager('settings').get('access_token');
	const accounts = Homey.manager('settings').get('accounts');
	if (accounts && Object.keys(accounts).length) {
		Object.keys(accounts).forEach(accountId => {
			module.exports.api[accountId] = {};
			if (accounts[accountId].access_token) {
				authenticate(
					null,
					{
						access_token: accounts[accountId].access_token,
						refresh_token: accounts[accountId].refresh_token,
					}
				);
			}
		});
	}
}

function getAccountIds() {
	return Object.keys(Homey.manager('settings').get('accounts') || {})
		.filter(accountId => module.exports.api[accountId].authenticated);
}

function authenticate(err, auth) {
	return new Promise((resolve, reject) => {
		if (err) {
			reject(err);
			return;
		}

		let accessToken;
		let refreshToken;
		const api = new Netatmo();
		api.once('access_token', newAccessToken => accessToken = newAccessToken);
		api.once('refresh_token', newRefreshToken => refreshToken = newRefreshToken);
		api.once('error', err => {
			reject(err);
			Homey.error(err, err.stack);
		});

		api.authenticate(
			Object.assign({}, authConstants, auth),
			() => {
				api.getUser((err, user) => {
					if (err) return reject(err);

					const accountId = user.mail;

					updateSettings(accountId, 'access_token', accessToken);
					updateSettings(accountId, 'refresh_token', refreshToken);

					module.exports.api[accountId] = api;
					module.exports.api[accountId].authenticated = true;
					api.on('access_token', updateSettings.bind(null, accountId, 'access_token'));
					api.on('refresh_token', updateSettings.bind(null, accountId, 'refresh_token'));
					api.on('authenticated', () => module.exports.api[accountId].authenticated = true);
					api.on('error', err => Homey.error('Error for account:', accountId, err, err.stack));
					DRIVER_NAMES.forEach(
						driverName => Homey.manager('drivers').getDriver(driverName).refreshAccountState(accountId)
					);

					resolve(accountId, api);
				});
			}
		);
	}).catch(err => {
		Homey.error(err);
		throw err;
	});
}

function updateSettings(accountId, code, value) {
	const accounts = Homey.manager('settings').get('accounts') || {};
	accounts[accountId] = accounts[accountId] || {};
	accounts[accountId][code] = value;
	Homey.manager('settings').set('accounts', accounts);
}

function canLogout(accountId) {
	return DRIVER_NAMES.reduce(
		(result, driverName) =>
			result.concat(Homey.manager('drivers').getDriver(driverName).getConnectedDevicesForAccount(accountId))
		, []).length === 0;
}

function logout(accountId) {
	if (canLogout(accountId)) {
		const accounts = Homey.manager('settings').get('accounts') || {};
		delete accounts[accountId];
		Homey.manager('settings').set('accounts', accounts);
		return true;
	}
	return false;
}

module.exports.init = init;
module.exports.getAccountIds = getAccountIds;
module.exports.authenticate = authenticate;
module.exports.logout = logout;
module.exports.canLogout = canLogout;
