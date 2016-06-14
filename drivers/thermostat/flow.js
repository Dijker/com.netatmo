'use strict';

let driver;

module.exports.init = function init(driverMethods) {
	driver = driverMethods;

	Homey.manager('flow').on('action.set_mode', (callback, args) => {
		driver.capabilities.mode.set(args.device, args.mode, callback);
	});

	Homey.manager('flow').on('action.set_schedule.schedule.autocomplete', (callback, args) => {
		driver.capabilities.program_list.get(args.device, (err, scheduleList) => {
			if (err) return callback(err);

			callback(
				null,
				scheduleList
					.map(schedule => ({ name: schedule.name, program_id: schedule.program_id }))
					.filter(schedule => schedule.name.toLowerCase().indexOf(args.query.toLowerCase()) !== -1)
			);
		});
	});

	Homey.manager('flow').on('action.set_schedule', (callback, args) => {
		driver.capabilities.schedule.set(args.device, args.schedule.program_id, callback);
	});
};
