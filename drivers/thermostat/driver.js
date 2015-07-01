"use strict";

var querystring		= require('querystring');

var request			= require('request');
var extend			= require('extend');

var api_url			= 'https://api.netatmo.net';

var self = {
	
	init: function( devices, callback ){
		
		// we're ready
		callback();
	}
}

module.exports = self;