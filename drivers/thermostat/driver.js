'use strict';

const connectedDevices = {};
const CAPABILITY_MAP = {
	natherm1: [
		{
			id: 'measure_temperature',
			location: 'measured.temperature',
		},
		{
			id: 'target_temperature',
			location: 'setpoint.setpoint_temp',
		}],
};

function init(devices, callback) {
	devices.forEach(device => connectedDevices[device.id] = Object.assign(device, { state: {} }));
	refreshState();
	callback();
}

function pair(socket) {
	socket.on('start', (data, callback) => {
		Homey.log('NetAtmo pairing has started...');

		if (Homey.app.authenticated) {
			return socket.emit('authorized', true);
		}

		// request an authorization url, and forward it to the front-end
		Homey.manager('cloud').generateOAuth2Callback(
			// this is the app-specific authorize url
			`${Homey.app.API_URL}/oauth2/authorize?response_type=code&client_id=` +
			`${Homey.env.CLIENT_ID}&REDIRECT_URI=${Homey.app.REDIRECT_URI}&scope=${Homey.app.SCOPE}`,

			// this function is executed when we got the url to redirect the user to
			(err, url) => {
				if (err) return;

				socket.emit('url', url);
			},

			// this function is executed when the authorization code is received (or failed to do so)
			(err, code) => {
				Homey.app.authenticate(err, code).then(() => {
					socket.emit('authorized', true);
				}).catch(err => {
					Homey.error(err);
					return socket.emit('authorized', false);
				});
			}
		);
	});

	let devicesState;
	socket.on('list_devices', (data, callback) => {
		Homey.app.api.getThermostatsData(
			(err, devices) => {
				if (err) {
					Homey.error(err);
					return;
				}

				devicesState = devices;
				const result = [];

				devices.forEach(device => {
					if (connectedDevices[device._id]) return;

					const capabilities = [];

					device.capabilityMap = {};
					device.modules.forEach(module => {
						if (CAPABILITY_MAP[module.type.toLowerCase()]) {
							const capabilitieList = CAPABILITY_MAP[module.type.toLowerCase()];
							capabilitieList.forEach(capability => {
								capabilities.push(capability.id);
								device.capabilityMap[capability.id] = module._id;
							});
						}
					});

					result.push({
						name: device.station_name,
						data: {
							id: device._id,
							capabilityMap: device.capabilityMap,
						},
						capabilities,
					});
				});

				callback(null, result);
			});
	});

	socket.on('add_device', (device, callback) => {
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
function refreshState(callback) {
	if (Homey.app.authenticated) {
		Homey.app.api.getThermostatsData((err, devices) => {
			if (err) {
				if (!(this && this.retries && this.retries > 3)) {
					const self = this || { retries: 0 };
					self.retries++;
					setTimeout(refreshState.bind(self, callback), self.retries * 30000);
				}
				return Homey.error(err);
			}

			devices.forEach(device => {
				if (connectedDevices[device._id]) {
					updateState(connectedDevices[device._id], device);
				}
			});

			if (typeof callback === 'function') {
				callback();
			}
		});
		clearTimeout(refreshTimeout);
		refreshTimeout = setTimeout(refreshState, 10 * 60 * 1000);
	} else {
		Homey.app.api.once('authenticated', refreshState.bind(this, callback));
	}
}

function updateState(device, state) {
	state.modules.forEach(deviceModule => {
		CAPABILITY_MAP[deviceModule.type.toLowerCase()].forEach(capability => {
			const value = capability.location.split('.').reduce((prev, curr) => prev[curr] || {}, deviceModule);
			if (device.state[capability.id] !== value) {
				device.state[capability.id] = value;
				module.exports.realtime(device, capability.id, value);
			}
		});
	});
}

function getState(capability, deviceInfo, callback) {
	if (connectedDevices[deviceInfo.id].state[capability] === undefined) {
		refreshState(getState.bind(null, capability, deviceInfo, callback));
	} else {
		callback(null, connectedDevices[deviceInfo.id].state[capability]);
	}
}

function setTemperature(capability, deviceInfo, state, callback) {
	const device = connectedDevices[deviceInfo.id];
	Homey.app.api.setThermpoint(
		{
			device_id: device.id,
			module_id: device.capabilityMap[capability],
			setpoint_mode: 'manual',
			setpoint_endtime: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
			setpoint_temp: state,
		},
		(err, result) => {
			Homey.log(err, result);
			callback(err, result);
		}
	);
}

module.exports = {
	init,
	pair,
	deleted,
	capabilities: {
		measure_temperature: {
			get: getState.bind(null, 'measure_temperature'),
		},
		target_temperature: {
			get: getState.bind(null, 'target_temperature'),
			set: setTemperature.bind(null, 'target_temperature'),
		},
	},
};



