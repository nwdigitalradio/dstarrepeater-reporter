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
var data = {"repeater":repeatercall,"started":new Date().getTime()};
var socket = io(gwserver);
var cpustats = {};
var cpustatseconds = 60 * 1000; // in milliseconds

console.log(gwserver);

function trimNull(a) {
  var c = a.indexOf('\0');
  if (c>-1) {
    return a.substr(0, c);
  }
  return a;
}

function getModel() {
	var mod = 'unknown';
	var modelfile = "/proc/device-tree/model";
	if (fs.existsSync(modelfile)) {
		var model = fs.readFileSync(modelfile).toString();
		mod = trimNull(model);
	}
	return mod;
}

function hatRead() {
	var path = "/proc/device-tree/hat";
	var hat = {};
        if (fs.existsSync(path)) {
                var items = fs.readdirSync(path);
                for (var i=0; i<items.length; i++) {
                        var filename = path + "/" + items[i];
                        var value = fs.readFileSync(filename).toString().trim();
                        hat[items[i]] = trimNull(value);
                }
        }
        return hat;
}

data['model'] = getModel();
data['hat'] = hatRead();
socket.emit("repeater",data);
// console.log(data);

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
	x.xmitlength = stats.trimBetween(" Frames:", ", ");
	x.loss = stats.trimBetween("Loss:", ", Packets:");
	x.packets = stats.substring(stats.indexOf("Packets:") + 8).trim();
	return x;
}


function parseAMBE(stats) {
	var x = {};
	x.callsign = stats.trimBetween("AMBE for","Frames:");
	x.xmitlength = stats.trimBetween(" Frames:", ", ");
	x.silence = stats.trimBetween("Silence:", ", BER:");
	x.ber = stats.substring(stats.indexOf("BER:") + 4).trim();
	return x;
}

rptlog.on('line', function(line) {
	// console.log(line);
	var data = {repeater:repeatercall};
	if (line.startsWith('M:')) {
		data['datestring'] = line.substr(3,19);
		var payload = line.substr(23).trim(); 
		data['payload'] = payload;
		if (payload.startsWith('Transmitting to')) {
			data['transmit'] = parseHDR(payload.substr(payload.indexOf('My:')));
		}

		if (payload.startsWith('Network header')) {
			data['networkhdr'] = parseHDR(payload.substr(payload.indexOf('My:')));
		}

		if (payload.startsWith('Stats for')) {
			data['stats'] = parseSTATS(payload);
		}
		

		if (payload.startsWith('AMBE for')) {
			data['ambe'] = parseAMBE(payload);
		}
		
		if (payload.startsWith('Slow data')) {
			data['slowdata'] = payload.substring(17);
		}
	}
	data['timestamp'] = new Date().getTime();
	socket.emit('repeater', data);
});

var SecondsTohhmmss = function(totalSeconds) {
        var days = Math.floor(totalSeconds / 86400);
        var used = days * 86400;
        var hours = Math.floor((totalSeconds - used) / 3600);
        used += hours * 3600;
        var minutes = Math.floor((totalSeconds - used) / 60);
        used += minutes * 60;
        var seconds = totalSeconds - used;

        seconds = Math.floor(seconds);
	var result = {}
        result['days'] = days;
	var hms = (hours < 10 ? "0" + hours : hours);
        hms += ":" + (minutes < 10 ? "0" + minutes : minutes);
        hms += ":" + (seconds < 10 ? "0" + seconds : seconds);
	result['hms'] = hms;
        return result;
}

setInterval(
	function() {
		cpustats['repeater'] = repeatercall;
		fs.readFileSync("/proc/uptime").toString().split('\n').forEach(
			function(line) {
				if (line.trim().length > 0) {
					var timex = line.split(" ");
					cpustats['uptime'] = SecondsTohhmmss(timex[0]);
				}
			});
		fs.readFileSync("/proc/loadavg").toString().split('\n').forEach(
			function(line) {
				if (line.trim().length > 0) {
					var la = line.split(" ");
					var loadavg = {};
					loadavg["1m"] = la[0];
					loadavg["5m"] = la[0];
					loadavg["15m"] = la[0];
					cpustats['loadavg'] = loadavg;
				}
			});
		fs.readFileSync("/sys/class/thermal/thermal_zone0/temp").toString().split('\n').forEach(
			function(line) {
				if (line.trim().length > 0) {
					var cputemp = {};
					var temps = line.split(" ");
					var centigrade = temps[0] / 1000;
					var fahrenheit = (centigrade * 1.8) + 32;
					cputemp['c'] = Math.round(centigrade * 100) / 100;
					cputemp['f'] = Math.round(fahrenheit * 100) / 100;
					cpustats['cputemp'] = cputemp;
				}
			});
		cpustats['timestamp'] = new Date().getTime();
		socket.emit("repeater", cpustats);
}, cpustatseconds);

