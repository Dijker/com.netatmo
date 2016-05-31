'use strict';

const connectedDevices = {};

const CAPABILITY_MAP = {
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
	rain: [{
		id: 'measure_rain',
		location: 'dashboard_data.Rain',
	}],
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
		deviceData.forEach(device => connectedDevices[device.id] = Object.assign(device, { state: {} }));
		// we're ready
		callback();
	},
	capabilities: {
		// below this is automatically generated
	},
	deleted(deviceInfo) {
		delete connectedDevices[deviceInfo.id];
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
					Homey.app.authenticate(err, { code }).then((accountId) => {
						selectedAccountId = accountId;
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
			Homey.app.api[selectedAccountId].getStationsData((err, devices) => {
				if (err) {
					Homey.error(err);
					return callback(err);
				}

				devicesState = devices;
				const deviceList = [];

				// get station data
				devices.forEach(device => {
					if (!connectedDevices[device._id]) {
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
							if (connectedDevices[device._id + module._id]) return;

							const capabilities = [];

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
			});
		});

		socket.on('add_device', (device, callback) => {
			connectedDevices[device.data.id] = Object.assign(device.data, { state: {} });
			if (devicesState) {
				let state = devicesState.find(deviceState => deviceState._id === device.data.deviceId);
				if (device.data.moduleId) {
					if (!(state && state.modules)) return refreshAccountState(device.data.accountId);
					state = state.modules.find(moduleState => moduleState._id === device.data.moduleId);
				}
				if (state) {
					updateState(
						connectedDevices[device.data.id],
						state
					);
				}
			} else {
				return refreshAccountState(device.data.accountId);
			}
			callback();
		});
	},
	getConnectedDevicesForAccount(accountId) {
		return Object.keys(connectedDevices).filter(deviceId => connectedDevices[deviceId].accountId === accountId);
	},
};

function getState(capability, deviceInfo, callback) {
	if (!connectedDevices[deviceInfo.id] || connectedDevices[deviceInfo.id].state[capability] === undefined) {
		if (
			(connectedDevices[deviceInfo.id] && Object.keys(connectedDevices[deviceInfo.id].state).length) ||
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
		callback(null, connectedDevices[deviceInfo.id].state[capability]);
	}
}

function updateState(device, state) {
	state.data_type.forEach(dataType => {
		CAPABILITY_MAP[dataType.toLowerCase()].forEach(capability => {
			const value = capability.location.split('.').reduce(
				(prev, curr) => prev.hasOwnProperty && prev.hasOwnProperty(curr) ? prev[curr] : { _notFound: true },
				state
			);
			if (!value._notFound && device.state[capability.id] !== value) {
				device.state[capability.id] = value;
				module.exports.realtime(device, capability.id, value);
			}
		});
	});
}

let refreshTimeout;
function refreshState() {
	const accountIds = new Set(Object.keys(connectedDevices).map(deviceId => connectedDevices[deviceId].accountId));
	clearTimeout(refreshTimeout);
	refreshTimeout = setTimeout(refreshState, 5 * 60 * 1000);

	return Promise.all(accountIds.map(accountId => refreshAccountState(accountId)));
}

const refreshDebounce = {};
const debounceTimeout = {};
function refreshAccountState(accountId) {
	if (!refreshDebounce[accountId] || (this && this.retries)) {
		clearTimeout(debounceTimeout[accountId]);
		debounceTimeout[accountId] = setTimeout(() => refreshDebounce[accountId] = null, 10000);
		refreshDebounce[accountId] = new Promise((resolve, reject) => {
			if (Homey.app.api[accountId] && Homey.app.api[accountId].authenticated) {
				Homey.app.api[accountId].getStationsData((err, stations) => {
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
						if (connectedDevices[device._id] && connectedDevices[device._id].accountId === accountId) {
							updateState(connectedDevices[device._id], device);
						}
						if (device.modules) {
							device.modules.forEach(module => {
								const combinedId = device._id + module._id;
								if (connectedDevices[combinedId] && connectedDevices[combinedId].accountId === accountId) {
									updateState(connectedDevices[combinedId], module);
								}
							});
						}
					});

					resolve();
				});
			} else if (Homey.app.api[accountId]) {
				Homey.app.api[accountId].once(
					'authenticated',
					() => {
						resolve(refreshAccountState.call({ retries: 0 }, accountId));
					}
				);
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

