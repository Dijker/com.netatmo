'use strict';

const flow = require('./flow');

const connectedDevices = {};
const CAPABILITY_MAP = {
	natherm1: [
		{
			id: 'measure_temperature',
			capability_id: 'measure_temperature',
			location: 'measured.temperature',
		},
		{
			id: 'target_temperature',
			capability_id: 'target_temperature',
			location: 'measured.setpoint_temp',
		},
		{
			id: 'program_list',
			location: 'therm_program_list',
		},
		{
			id: 'mode',
			location: 'setpoint.setpoint_mode',
		},
	],
};

function init(devices, callback) {
	devices.forEach(device => connectedDevices[device.id] = Object.assign(device, { state: {} }));
	flow.init(module.exports);
	callback();
}

function pair(socket) {
	let selectedAccountId;

	socket.on('start', () => {
		Homey.log('NetAtmo pairing has started...');

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

		socket.on('select_account', accountId => {
			selectedAccountId = accountId;
			socket.emit('authorized', true);
		});

		socket.on('logout', accountId => {
			Homey.app.logout(accountId);
		});
	});

	let devicesState;
	socket.on('list_devices', (data, callback) => {
		Homey.app.api[selectedAccountId].getThermostatsData(
			(err, devices) => {
				if (err) {
					Homey.error(err);
					return callback(err);
				}

				devicesState = devices;
				const result = [];

				devices.forEach(device => {
					if (connectedDevices[device._id]) return;

					const capabilities = [];

					device.capabilityMap = {};
					device.modules.forEach(module => {
						if (CAPABILITY_MAP[module.type.toLowerCase()]) {
							const capabilityList = CAPABILITY_MAP[module.type.toLowerCase()];
							capabilityList.forEach(capability => {
								if (capability.capability_id) {
									capabilities.push(capability.capability_id);
								}
								device.capabilityMap[capability.id] = module._id;
							});
						}
					});

					result.push({
						name: device.station_name,
						data: {
							id: device._id,
							capabilityMap: device.capabilityMap,
							accountId: selectedAccountId,
						},
						capabilities,
					});
				});

				callback(null, result);
			});
	});

	socket.on('add_device', (device) => {
		connectedDevices[device.data.id] = Object.assign(device.data, { state: {} });
		if (devicesState) {
			updateState(
				connectedDevices[device.data.id],
				devicesState.find(deviceState => deviceState._id === device.data.id)
			);
		}
	});
}

function deleted(deviceInfo) {
	delete connectedDevices[deviceInfo.id];
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
				Homey.app.api[accountId].getThermostatsData((err, devices) => {
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

					devices.forEach(device => {
						if (connectedDevices[device._id] && connectedDevices[device._id].accountId === accountId) {
							updateState(connectedDevices[device._id], device);
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
function updateState(device, state) {
	state.modules.forEach(deviceModule => {
		CAPABILITY_MAP[deviceModule.type.toLowerCase()].forEach(capability => {
			const value = capability.location.split('.').reduce(
				(prev, curr) => prev.hasOwnProperty && prev.hasOwnProperty(curr) ? prev[curr] : { _notFound: true },
				deviceModule
			);
			if (device.state[capability.id] !== value) {
				device.state[capability.id] = value;
				module.exports.realtime(device, capability.id, value);
			}
		});
	});
}

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

function setTemperature(capability, deviceInfo, temperature, callback) {
	const device = connectedDevices[deviceInfo.id];
	setMode(capability, deviceInfo, 'manual', { endTime: Math.floor(Date.now() / 1000) + 2 * 60 * 60, temp: temperature },
		err => {
			callback(err, !err);

			if (err) return Homey.error(err);

			if (device.state[capability] !== temperature) {
				device.state[capability] = temperature;
				module.exports.realtime(device, capability, temperature);
			}
		}
	);
}

function setMode(capability, deviceInfo, mode, options, callback) {
	if (!callback) {
		callback = options;
		options = {};
	}
	options = options || {};

	const device = connectedDevices[deviceInfo.id];
	Homey.app.api[device.accountId].setThermpoint(
		{
			device_id: device.id,
			module_id: device.capabilityMap[capability],
			setpoint_mode: mode,
			setpoint_endtime: options.endTime,
			setpoint_temp: options.temp,
		},
		(err) => {
			callback(err, !err);

			if (err) return Homey.error(err);

			if (device.state.mode !== mode) {
				device.state.mode = mode;
				module.exports.realtime(device, 'mode', mode);
			}
		}
	);
}

function getSchedule(capability, deviceInfo, scheduleId, callback) {
	if (!callback) {
		callback = scheduleId;
		scheduleId = null;
	}

	getState(capability, deviceInfo, (err, result) => {
		if (err) return callback(err);

		const program = result.find(prog => (scheduleId ? prog.program_id === scheduleId : prog.selected));
		callback(!program, program);
	});
}

function setSchedule(capability, deviceInfo, scheduleId, callback) {
	const device = connectedDevices[deviceInfo.id];
	getSchedule(capability, deviceInfo, scheduleId.program_id || scheduleId,
		(err, schedule) => {
			if (err) return callback('Could not find schedule');

			Homey.app.api[device.accountId].switchSchedule(
				{
					device_id: device.id,
					module_id: device.capabilityMap[capability],
					schedule_id: schedule.program_id,
				},
				(err) => {
					callback(err, !err);

					if (err) return Homey.error(err);
				}
			);
		}
	);
}

function getConnectedDevicesForAccount(accountId) {
	return Object.keys(connectedDevices).filter(deviceId => connectedDevices[deviceId].accountId === accountId);
}

module.exports = {
	init,
	pair,
	deleted,
	refreshState,
	refreshAccountState,
	getConnectedDevicesForAccount,
	capabilities: {
		measure_temperature: {
			get: getState.bind(null, 'measure_temperature'),
		},
		target_temperature: {
			get: getState.bind(null, 'target_temperature'),
			set: setTemperature.bind(null, 'target_temperature'),
		},
		mode: {
			get: getState.bind(null, 'mode'),
			set: setMode.bind(null, 'mode'),
		},
		program_list: {
			get: getState.bind(null, 'program_list'),
		},
		schedule: {
			get: getSchedule.bind(null, 'program_list'),
			set: setSchedule.bind(null, 'program_list'),
		},
	},
};
