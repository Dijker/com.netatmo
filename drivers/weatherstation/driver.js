"use strict";

var path			= require('path');

var request			= require('request');
var extend			= require('extend');

var api_url			= 'https://api.netatmo.net';
var redirect_uri	= 'https://callback.athom.com/oauth2/callback/';

var devices			= {};
	
var types_map = [
	{
		netatmo_name		: 'Temperature',
		homey_capability	:  'measure_temperature'
	},
	{
		netatmo_name		: 'Humidity',
		homey_capability	:  'measure_humidity'
	},
	{
		netatmo_name		: 'Co2',
		homey_capability	:  'measure_co2'
	},
	{
		netatmo_name		: 'Pressure',
		homey_capability	:  'measure_pressure'
	},
	{
		netatmo_name		: 'Noise',
		homey_capability	:  'measure_noise'
	},
	{
		netatmo_name		: 'Rain',
		homey_capability	:  'measure_rain'
	},
	{
		netatmo_name		: 'WindStrength',
		homey_capability	:  'measure_wind_strength'
	},
	{
		netatmo_name		: 'WindAngle',
		homey_capability	:  'measure_wind_angle'
	},
	{
		netatmo_name		: 'GustStrength',
		homey_capability	:  'measure_gust_strength'
	},
	{
		netatmo_name		: 'GustAngle',
		homey_capability	:  'measure_gust_angle'
	}
]

var self = module.exports = {
	
	init: function( devices_data, callback ){
		
		devices_data.forEach(function(device_data){			
			devices[ device_data.id ] = {
				data 	: device_data,
				state	: {}
			}
			refreshState( device_data.id );
		});
		
		// update info every 5 minutes
		setInterval(function(){
			
			for( var device_id in devices ) {
				refreshState( device_id );
			}
			
		}, 1000 * 60 * 5)
		
		// we're ready
		callback();
	},
	
	capabilities: {
		// below this is automatically generated
	},
	
	deleted: function( device_data ) {
		delete devices[ device_data.id ];
	},
	
	pair: function( socket ) {
		
		var access_token;
		var refresh_token;
				
		socket.on('start', function( data, callback ){
						
			Homey.log('NetAtmo pairing has started...');
			
			// request an authorization url, and forward it to the front-end
			Homey.manager('cloud').generateOAuth2Callback(
				
				// this is the app-specific authorize url
				api_url + "/oauth2/authorize?response_type=code&client_id=" + Homey.env.CLIENT_ID + "&redirect_uri=" + redirect_uri,
				
				// this function is executed when we got the url to redirect the user to
				function( err, url ){
					Homey.log('Got url!', url);
					socket.emit( 'url', url );
				},
				
				// this function is executed when the authorization code is received (or failed to do so)
				function( err, code ) {
					
					if( err ) {
						Homey.error(err);
						socket.emit( 'authorized', false )
						return;
					}
					
					Homey.log('Got authorization code!', code);
				
					// swap the authorization code for a token					
					request.post( api_url + '/oauth2/token', {
						form: {
							'client_id'		: Homey.env.CLIENT_ID,
							'client_secret'	: Homey.env.CLIENT_SECRET,
							'code'			: code,
							'redirect_uri'	: redirect_uri,
							'grant_type'	: 'authorization_code',
							'scope'			: 'read_station'
						},
						json: true
					}, function( err, response, body ){
						if( err || body.error ) {
							Homey.error(err, body.error);
							return socket.emit( 'authorized', false );
						}
						access_token	= body.access_token;
						refresh_token	= body.refresh_token;
						socket.emit( 'authorized', true );
					});
				}
			)
			
		})
	
		socket.on('list_devices', function( data, callback ) {
						
			call({
				path			: '/devicelist?app_type=app_station',
				access_token	: access_token,
				refresh_token	: refresh_token
			}, function(err, response, body){
				if( err ) return callback( err.message || err.toString(), null );
				
				var devices = [];
				
				if( typeof body.body != 'undefined' ) {
					
					body.body.devices.forEach(function(device){
						devices.push({
							data: {
								id				: device._id,
								access_token	: access_token,
								refresh_token	: refresh_token
							},
							name: device.station_name
						});
					});
					
				}
								
				callback( null, devices );
									
			});
							
		})
		
		socket.on('add_device', function( device, callback ) {
			devices[ device.data.id ] = {
				data: device.data,
				state: {}
			}
			refreshState( device.data.id );		
		})
		
	}
}

function call( options, callback ) {
			
	// create the options object
	options = extend({
		path			: '/',
		method			: 'GET',
		access_token	: false,
		refresh_token	: false,
		json			: true
	}, options);
	
	
	// remove the first trailing slash, to prevent `.nl//foo`
	if( options.path.charAt(0) === '/' ) options.path = options.path.substring(1);
	
	// make the request
	request({
		method	: options.method,
		url		: api_url + '/api/' + options.path,
		qs		: options.qs,
		json	: options.json,
		headers	: {
			'Authorization': 'Bearer ' + options.access_token
		}
	}, function( err, response, body ){
		if( err ) return callback( err );
		
		if( typeof body.error != 'undefined' ) {
			
			// token expired. refresh it!
			if( body.error.code == 2 ) {
							
				var form = {
					'client_id'		: Homey.env.CLIENT_ID,
					'client_secret'	: Homey.env.CLIENT_SECRET,
					'refresh_token'	: options.refresh_token,
					'grant_type'	: 'refresh_token'
				};
							
				request.post( api_url + '/oauth2/token', {
					form: form,
					json: true
				}, function( err, response, body ){
					if( err || body.error ) return callback( new Error("invalid refresh_token") );
					
					// retry the call with a new access token
					options.access_token = body.access_token;
					call( options, callback );
				});
			
			} else {
				return callback(body.error);
			}
			
			return;
		}
		
		if( typeof callback == 'function' ) {
			callback( err, response, body );
		}
		
	});
	
}

// dynamically generate capability get functions #lazy
types_map.forEach(function(type){
		
	self.capabilities[ type.homey_capability ] = {
		get: function( device_data, callback ){		
			var device = getDevice( device_data.id );
			if( device instanceof Error ) return callback(device);
			return callback( null, device.state[ type.homey_capability ] );
		}
	}
	
});

function getDevice( device_id ){
	return devices[ device_id ] || new Error("Invalid device ID");
}

function refreshState( device_id, callback ){
	
	callback = callback || function(){}
	
	var device = getDevice( device_id );
	if( device instanceof Error ) return callback(device);	
				
	var qs = {
		'device_id'	: device_id,
		'scale'		: 'max',
		'type'		: [],
		'date_end'	: 'last'
	}
	
	var types = [];
	types_map.forEach(function(type){
		types.push(type.netatmo_name);
	})
	qs.type = types.join(',');
	
	call({
		path			: '/getmeasure',
		qs				: qs,
		access_token	: device.data.access_token,
		refresh_token	: device.data.refresh_token
	}, function( err, result, body ){
		if( err ) return callback(err);
		if( body.error ) return callback( new Error(body.error) );
		if( !Array.isArray(body.body[0].value) ) return callback( new Error("invalid body") );
		if( !Array.isArray(body.body[0].value[0]) ) return callback( new Error("invalid body") );
				
		body.body[0].value[0].forEach(function(value, i){
			
			var homey_capability = types_map[i].homey_capability;
						
			// set state and if changed, emit to Homey
			if( device.state[ homey_capability ] != value ) {
				devices[ device_id ].state[ homey_capability ] = value;
				module.exports.realtime( device.data, homey_capability, value );
			}		
			
		});
				
		callback( null, true );
		
	});
}