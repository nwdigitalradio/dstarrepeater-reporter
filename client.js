var io = require("socket.io-client");
var fs = require("fs");
var ini = require("ini");
var Tail = require('tail').Tail;
var rptlog = new Tail('/var/log/opendv/dstarrepeaterd_1.log');
var dstarrptrconfig = '/etc/opendv/dstarrepeater_' + '1';
var curConfStr = fs.readFileSync(dstarrptrconfig, { encoding : "UTF-8" });
var rptrconf = ini.parse(curConfStr);
var webserviceport = 3000;
var webservicehost = rptrconf.gatewayAddress.trim();
var repeatercall = rptrconf.callsign.trim();
var gwserver = "http://" + webservicehost + ":" + webserviceport;
var data = {"repeater":repeatercall};
var socket = io(gwserver);

console.log(gwserver);
console.log(data);

String.prototype.startsWith = function (str)
{
   return this.indexOf(str) == 0;
}

String.prototype.trimBetween = function (before,after) {
	var left = this.indexOf(before) + before.length;
	var right = this.indexOf(after);
	var target = this.substring(left, right).trim();
	return target;
}

function parseHDR(pl) {
	var x = {};
	x.my = pl.trimBetween("My:","/");
	x.comment1 = pl.trimBetween("/", "Your:");
	x.urcall = pl.trimBetween("Your:","Rpt1:");
	x.rpt1 = pl.trimBetween("Rpt1:","Rpt2:");
	x.rpt2 = pl.trimBetween("Rpt2:","Flags:");
	x.flags = pl.substring(pl.indexOf("Flags:") + 6).trim();
	return x;
}

function parseSTATS(stats) {
	var x = {};
	x.callsign = stats.trimBetween("Stats for","Frames:");
	x.frames = stats.trimBetween(" Frames:", ", ");
	x.loss = stats.trimBetween("Loss:", ", Packets:");
	x.packets = stats.substring(stats.indexOf("Packets:") + 8).trim();
	return x;
}

rptlog.on('line', function(line) {
	console.log(line);
	if (line.startsWith('M:')) {
		data['datestring'] = line.substr(3,19);
		var payload = line.substr(23).trim(); 
//		data['payload'] = payload;
		if (payload.startsWith('Transmitting to')) {
			data['transmit'] = parseHDR(payload.substr(payload.indexOf('My:')));
		}

		if (payload.startsWith('Network header')) {
			data['networkhdr'] = parseHDR(payload.substr(payload.indexOf('My:')));
		}

		if (payload.startsWith('Stats for')) {
			data['stats'] = parseSTATS(payload);
		}
		
		if (payload.startsWith('Slow data')) {
			data['slowdata'] = payload.substring(17);
		}
	}
	socket.emit('repeater', data);
});
socket.on('message', function(data) {
	console.log(data)
});
