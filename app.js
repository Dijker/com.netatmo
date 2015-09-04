"use strict";
  
function App() 
{
	setInterval(function(){
		console.log('netatmo says hi!');
	}, 1000);
}

module.exports = App;

App.prototype.init = function(){
	
}