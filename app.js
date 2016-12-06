'use strict';

const Netatmo = require('netatmo-homey');
const logger = require('homey-log').Log;

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
				module.exports.api[accountId].authenticatePromise = authenticate(
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

function getApi(accountId) {
	if (!module.exports.api[accountId]) {
		return Promise.reject(new Error('No account exists with that id'));
	} else if (module.exports.api[accountId].authenticatePromise) {
		return module.exports.api[accountId].authenticatePromise;
	}
	return Promise.resolve(module.exports.api[accountId]);
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
		api.on('access_token', newAccessToken => accessToken = newAccessToken);
		api.on('refresh_token', newRefreshToken => refreshToken = newRefreshToken);
		api.once('error', err => {
			reject(err);
			Homey.error(err, err.stack);
		});

		api.authenticate(
			Object.assign({}, authConstants, auth),
			(err) => {
				if (err) return reject(err);

				api.getUser((err, user) => {
					if (err) return reject(err);

					const accountId = user.mail;

					const refreshDriverState = (driverName) => {
						const driver = Homey.manager('drivers').getDriver(driverName);
						if (!driver) {
							setTimeout(refreshDriverState.bind(driverName), 1000);
						} else {
							Homey.manager('drivers').getDriver(driverName).refreshAccountState(accountId);
						}
					};

					updateSettings(accountId, 'access_token', accessToken);
					updateSettings(accountId, 'refresh_token', refreshToken);

					module.exports.api[accountId] = api;
					module.exports.api[accountId].authenticated = true;
					module.exports.api[accountId].accountId = accountId;
					api.on('access_token', updateSettings.bind(null, accountId, 'access_token'));
					api.on('refresh_token', updateSettings.bind(null, accountId, 'refresh_token'));
					api.on('error', err => Homey.error('Error for account:', accountId, err, err.stack));

					DRIVER_NAMES.forEach(refreshDriverState);

					resolve(api);
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
			,
			[]
		).length === 0;
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
module.exports.getApi = getApi;
module.exports.getAccountIds = getAccountIds;
module.exports.authenticate = authenticate;
module.exports.logout = logout;
module.exports.canLogout = canLogout;
