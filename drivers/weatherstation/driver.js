"use strict";

var request			= require('request');

var client_id		= '54c3fa84485a88cc0867d14e';
var client_secret	= 'hiVkuWXf7xfoJBGVh8Ld9M8nruClhkhVd4';

var self = {
	
	init: function( callback ){						
		
	},
	
	pair: {
		start: function( callback, emit, data ){
						
			Homey.log('Hue bridge pairing has started');
			
		},
		
		authorized: function( callback, emit, data ) {
			
			var form = {
				'grant_type': 'authorization_code',
				'client_id': client_id,
				'client_secret': client_secret,
				'code': data.code,
				'redirect_uri': data.redirect_uri,
				'scope': 'read_station'
			};
			
			request.post('https://api.netatmo.net/oauth2/token', {
				form: form
			}, function( err, response, body ){
				
				body = JSON.parse(body);
				
				if( body.error ) {
					callback( false );
				} else {
					console.log( body );
					callback( true );
				}
				
			});
			
		}
	}
	
}

module.exports = self;