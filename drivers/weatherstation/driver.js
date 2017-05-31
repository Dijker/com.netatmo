'use strict';

const deviceMap = new Map();
const state = new Map();

const CAPABILITY_MAP = {
	battery: [{
		id: 'measure_battery',
		location: 'battery_percent',
	}],
	temperature: [{
		id: 'measure_temperature',
		location: 'dashboard_data.Temperature',
	}],
	humidity: [{
		id: 'measure_humidity',
		location: 'dashboard_data.Humidity',
	}],
	co2: [{
		id: 'measure_co2',
		location: 'dashboard_data.CO2',
	}],
	pressure: [{
		id: 'measure_pressure',
		location: 'dashboard_data.Pressure',
	}],
	noise: [{
		id: 'measure_noise',
		location: 'dashboard_data.Noise',
	}],
	rain: [
		{
			id: 'measure_rain.now',
			location: 'dashboard_data.Rain',
		},
		{
			id: 'measure_rain.1h',
			location: 'dashboard_data.sum_rain_1',
		},
		{
			id: 'measure_rain.24h',
			location: 'dashboard_data.sum_rain_24',
		}
	],
	wind: [
		{
			id: 'measure_wind_strength',
			location: 'dashboard_data.WindStrength',
		},
		{
			id: 'measure_wind_angle',
			location: 'dashboard_data.WindAngle',
		},
		{
			id: 'measure_gust_strength',
			location: 'dashboard_data.GustStrength',
		},
		{
			id: 'measure_gust_angle',
			location: 'dashboard_data.GustAngle',
		},
	],
};

module.exports = {
	init(deviceData, callback) {
		deviceData.forEach(device => {
			// Check if device is of the old data type
			if (!device.hasOwnProperty('accountId')) {
				module.exports.setUnavailable(device, __('update.incompatible'));
				return;
			}
			deviceMap.set(device.id, device);
			state.set(device.id, new Map());
		});
		refreshState();
		// we're ready
		callback();
	},
	capabilities: {
		// below this is automatically generated
	},
	deleted(deviceInfo) {
		deviceMap.delete(deviceInfo.id);
	},
	pair(socket) {
		let selectedAccountId;

		socket.on('start', () => {
			socket.emit('accounts', Homey.app.getAccountIds().map(id => ({ id, canLogout: Homey.app.canLogout(id) })));

			// request an authorization url, and forward it to the front-end
			Homey.manager('cloud').generateOAuth2Callback(
				// this is the app-specific authorize url
				`${Homey.app.API_URL}/oauth2/authorize?response_type=code&client_id=` +
				`${Homey.env.CLIENT_ID}&REDIRECT_URI=${Homey.app.REDIRECT_URI}&scope=${Homey.app.SCOPE.replace(/ /g, '%20')}`,

				// this function is executed when we got the url to redirect the user to
				(err, url) => {
					if (err) return;

					socket.emit('url', url);
				},

				// this function is executed when the authorization code is received (or failed to do so)
				(err, code) => {
					Homey.app.authenticate(err, { code }).then((api) => {
						selectedAccountId = api.accountId;
						socket.emit('authorized', true);
					}).catch(err => {
						Homey.error(err);
						return socket.emit('authorized', false);
					});
				}
			);

			socket.on('select_account', (accountId) => {
				selectedAccountId = accountId;
				socket.emit('authorized', true);
			});

			socket.on('logout', accountId => {
				Homey.app.logout(accountId);
			});
		});

		let devicesState;
		socket.on('list_devices', (data, callback) => {
			Homey.app.getApi(selectedAccountId).then(api => api.getStationsData((err, devices) => {
				if (err) {
					Homey.error(err);
					return callback(err);
				}

				devicesState = devices;
				const deviceList = [];

				// get station data
				devices.forEach(device => {
					if (!deviceMap.has(device._id)) {
						const capabilities = [];

						device.data_type.forEach(dataTypeItem => {
							if (CAPABILITY_MAP[dataTypeItem.toLowerCase()]) {
								CAPABILITY_MAP[dataTypeItem.toLowerCase()].forEach(capability => {
									capabilities.push(capability.id);
								});
							}
						});

						deviceList.push({
							name: device.station_name,
							data: {
								id: device._id,
								deviceId: device._id,
								accountId: selectedAccountId,
							},
							capabilities,
						});
					}
					// get module data
					if (device.modules !== undefined) {
						device.modules.forEach(module => {
							if (deviceMap.has(device._id + module._id)) return;

							const capabilities = [];

							if (module.battery_percent) {
								capabilities.push('measure_battery');
							}

							module.data_type.forEach(dataTypeItem => {
								if (CAPABILITY_MAP[dataTypeItem.toLowerCase()]) {
									CAPABILITY_MAP[dataTypeItem.toLowerCase()].forEach(capability => {
										capabilities.push(capability.id);
									});
								}
							});

							// push module to connectedDevices
							deviceList.push({
								name: `${device.station_name}:${module.module_name}`,
								data: {
									id: device._id + module._id, // create uniqueID based on station and module id
									deviceId: device._id,
									moduleId: module._id,
									accountId: selectedAccountId,
								},
								capabilities,
							});
						});
					}
				});
				callback(null, deviceList);
			})).catch(err => callback(err));
		});

		socket.on('add_device', (device, callback) => {
			deviceMap.set(device.data.id, device.data);
			state.set(device.data.id, new Map());
			if (devicesState) {
				let deviceState = devicesState.find(deviceStateCache => deviceStateCache._id === device.data.deviceId);
				if (device.data.moduleId) {
					if (!(deviceState && deviceState.modules)) return refreshAccountState(device.data.accountId);
					deviceState = deviceState.modules.find(moduleState => moduleState._id === device.data.moduleId);
				}
				if (deviceState) {
					updateState(
						deviceMap.get(device.data.id),
						deviceState
					);
				}
			} else {
				return refreshAccountState(device.data.accountId);
			}
			callback();
		});
	},
	getConnectedDevicesForAccount(accountId) {
		const result = [];
		deviceMap.forEach(device => {
			if (device.accountId === accountId) {
				result.push(device);
			}
		});
		return result;
	},
};

function getState(capability, deviceInfo, callback) {
	if (!deviceMap.has(deviceInfo.id) || !state.get(deviceInfo.id).has(capability)) {
		if (
			(deviceMap.has(deviceInfo.id) && state.get(deviceInfo.id).size) ||
			(this && this.retries > 3)
		) {
			return callback(new Error('Could not get data for device'));
		}
		const self = this && this.retries ? this : { retries: 0 };
		self.retries++;
		refreshAccountState(deviceInfo.accountId)
			.then(getState.bind(self, capability, deviceInfo, callback))
			.catch(err => {
				callback(err || true);
			});
	} else {
		callback(null, state.get(deviceInfo.id).get(capability));
	}
}

function updateState(device, newState) {
	if (newState.hasOwnProperty('battery_percent')) {
		const value = newState['battery_percent'];
		if (value && state.get(device.id).get('measure_battery') !== value) {
			state.get(device.id).set('measure_battery', value);
			module.exports.realtime(deviceMap.get(device.id), 'measure_battery', value);
		}
	}
	newState.data_type.forEach(dataType => {
		CAPABILITY_MAP[dataType.toLowerCase()].forEach(capability => {
			const value = capability.location.split('.').reduce(
				(prev, curr) => (prev.hasOwnProperty && prev.hasOwnProperty(curr) ? prev[curr] : { _notFound: true }),
				newState
			);
			if (!value._notFound && state.get(device.id).get(capability.id) !== value) {
				if (capability.id === 'measure_rain.now') Homey.manager('flow').triggerDevice('rain_now_changed', { rain: value }, null, deviceMap.get(device.id));
				if (capability.id === 'measure_rain.1h') Homey.manager('flow').triggerDevice('rain_hour_changed', { hour: value }, null, deviceMap.get(device.id));
				if (capability.id === 'measure_rain.24h') Homey.manager('flow').triggerDevice('rain_today_changed', { today: value }, null, deviceMap.get(device.id));
				state.get(device.id).set(capability.id, value);
				module.exports.realtime(deviceMap.get(device.id), capability.id, value);
			}
		});
	});
}

let refreshTimeout;
function refreshState() {
	const accountIds = new Set();
	deviceMap.forEach(device => accountIds.add(device.accountId));
	clearTimeout(refreshTimeout);
	refreshTimeout = setTimeout(refreshState, 5 * 60 * 1000);

	return Promise.all(Array.from(accountIds).map(accountId => refreshAccountState(accountId)));
}

const refreshDebounce = {};
const debounceTimeout = {};
function refreshAccountState(accountId) {
	if (!refreshDebounce[accountId] || (this && this.retries)) {
		clearTimeout(debounceTimeout[accountId]);
		debounceTimeout[accountId] = setTimeout(() => refreshDebounce[accountId] = null, 10000);
		refreshDebounce[accountId] = new Promise((resolve, reject) => {
			if (Homey.app.api[accountId]) {
				Homey.app.getApi(accountId).then(api => api.getStationsData((err, stations) => {
					if (err) {
						if (!(this && this.retries && this.retries > 3)) {
							const self = this || { retries: 0 };
							self.retries++;
							setTimeout(() => resolve(refreshAccountState.call(self, accountId)), self.retries * 30000);
						} else {
							reject(err);
						}
						return Homey.error(err);
					}

					stations.forEach(device => {
						if (deviceMap.has(device._id) && deviceMap.get(device._id).accountId === accountId) {
							updateState(deviceMap.get(device._id), device);
						}
						if (device.modules) {
							device.modules.forEach(module => {
								const combinedId = device._id + module._id;
								if (deviceMap.get(combinedId) && deviceMap.get(combinedId).accountId === accountId) {
									updateState(deviceMap.get(combinedId), module);
								}
							});
						}
					});

					resolve();
				})).catch(reject);
			} else {
				reject();
			}
		}).catch(err => {
			clearTimeout(debounceTimeout[accountId]);
			refreshDebounce[accountId] = null;
			throw err || new Error();
		});
	}
	return refreshDebounce[accountId];
}

// dynamically generate capability get functions
Object.keys(CAPABILITY_MAP).forEach(type => {
	CAPABILITY_MAP[type].forEach(capability => {
		if (capability.id) {
			module.exports.capabilities[capability.id] = {
				get: getState.bind(null, capability.id),
			};
		}
	});
});

module.exports.refreshState = refreshState;
module.exports.refreshAccountState = refreshAccountState;
