"use strict";

var path			= require('path');
var querystring		= require('querystring');

var request			= require('request');
var extend			= require('extend');

var api_url			= 'https://api.netatmo.net';

var config			= require( path.join(Homey.paths.root, 'config.json') );

var pairing			= {};

var self = {
	
	init: function( devices, callback ){
		
		// we're ready
		callback();
	},
	
	name: {
		set: function( device, name, callback ) {
			// NetAtmo doesn't allow names to be changed using the api. Too bad.
		}
	},
	
	capabilities: {
		measure_temperature: {
			get: function( device, name, callback ) {
				var query = {
					'device_id'	: device.id,
					'scale'		: 'max',
					'type'		: 'Temperature',
					'date_end'	: 'last'
				}
				
				call({
					path: '/getmeasure?' + querystring.stringify(query),
					refresh_token: device.refresh_token
				}, function( err, result, body ){
					
					if( err ) return callback(err);
					if( body.error ) return callback( new Error(body.error) );
					
					// TODO: cache this value
					
					callback(body.body[0].value[0]);
				});
			}
		}
	},
	
	pair: {
		start: function( callback, emit, data ){
			
			callback({
				client_id: config.client_id
			});
						
			Homey.log('NetAtmo pairing has started');
			
		},
		
		authorized: function( callback, emit, data ) {
			
			var form = {
				'client_id'		: config.client_id,
				'client_secret'	: config.client_secret,
				'code'			: data.code,
				'redirect_uri'	: data.redirect_uri,
				'grant_type'	: 'authorization_code',
				'scope'			: 'read_station'
			};
			
			request.post( api_url + '/oauth2/token', {
				form: form,
				json: true
			}, function( err, response, body ){
				if( body.error ) return callback( false );	
				pairing.access_token = body.access_token;
				pairing.refresh_token = body.refresh_token;
				callback( true );
			});
		},
	
		list_devices: function( callback, emit, data ) {
			call({
				path: '/devicelist?app_type=app_station',
				access_token: pairing.access_token,
				refresh_token: pairing.refresh_token
			}, function(err, response, body){
				
				var devices = [];
				
				if( typeof body.body != 'undefined' ) {
					
					body.body.devices.forEach(function(device){
						devices.push({
							data: {
								id				: device._id,
//								access_token	: pairing.access_token,
								refresh_token	: pairing.refresh_token
							},
							name: device.station_name
						});
					});
					
				}
				
				callback( devices );
				
				pairing = {};
									
			});
							
		},
		
		add_devices: function( callback, emit, data ) {
			console.log(arguments)
		}
		
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
		method: options.method,
		url: api_url + '/api/' + options.path,
		json: options.json,
		headers: {
			'Authorization': 'Bearer ' + options.access_token
		}
	}, function( err, response, body ){
				
		if( err ) return callback( err );
		
		if( typeof body.error != 'undefined' ) {
			
			// token expired. refresh it!
			if( body.error.code == 2 ) {
							
				var form = {
					'client_id'		: config.client_id,
					'client_secret'	: config.client_secret,
					'refresh_token'	: options.refresh_token,
					'grant_type'	: 'refresh_token'
				};
								
				request.post( api_url + '/oauth2/token', {
					form: form,
					json: true
				}, function( err, response, body ){
					if( body.error ) return callback( new Error("invalid refresh_token") );
					
					// retry the call with a new access token
					options.access_token = body.access_token;
					call( options, callback );
				});
			
			}
			
			return;
		}
		
		if( typeof callback == 'function' ) {
			callback( err, response, body );
		}
		
	});
	
}

module.exports = self;