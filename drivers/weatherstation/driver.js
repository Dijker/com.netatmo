"use strict";

var request			= require('request');
var extend			= require('extend');

var api_url			= 'https://api.netatmo.net';

var client_id		= '54c3fa84485a88cc0867d14e';
var client_secret	= 'hiVkuWXf7xfoJBGVh8Ld9M8nruClhkhVd4';

var pairing			= {};

var self = {
	
	init: function( callback ){
		
		// we're ready
		callback();
	},
	
	name: {
		set: function( device, name, callback ) {
			console.log(arguments)
		}
	},
	
	pair: {
		start: function( callback, emit, data ){
			
			callback({
				client_id: client_id
			});
						
			Homey.log('NetAtmo pairing has started');
			
		},
		
		authorized: function( callback, emit, data ) {
			
			var form = {
				'client_id'		: client_id,
				'client_secret'	: client_secret,
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
								access_token	: pairing.access_token,
								refresh_token	: pairing.refresh_token
							},
							name: device.station_name
						});
					});
					
				}
				
				callback( devices );
									
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
		
		if( response.statusCode == 401 ) {
			
			// token expired. refresh it!
			console.log('refresh token!');
			
			return;
		}
		
		if( typeof callback == 'function' ) {
			callback( null, response, body );
		}
		
	});
	
}

module.exports = self;