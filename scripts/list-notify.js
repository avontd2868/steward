var http        = require('http')
  , os          = require('os')
  , url         = require('url')
  , SSDP        = require('../steward/node_modules/node-ssdp')
  , netmask     = require('../steward/node_modules/netmask')  
  , xml2json    = require('../steward/node_modules/xml2json')  
  ;


SSDP.prototype.notify = function(ipaddr, portno, signature, vars) {/* jshint unused: false */
  var out;

  var self = this;

  if (!this.sock) return;

  Object.keys(self.usns).forEach(function (usn) {
    var bcast, mask, quad0;

    var udn   = self.usns[usn]
      , heads =
        { HOST            : '239.255.255.250:1900'
        , 'CACHE-CONTROL' : 'max-age=20'
        , SERVER          : signature

// comment out these lines, if need be...
        , NT              : usn
        , NTS             : 'ssdp:alive'
        , USN             : udn
        , LOCATION        : 'http://' + ipaddr + '/' + self.description
        }
      ;

    out = self.getSSDPHeader('NOTIFY', heads);
    Object.keys(vars).forEach(function (n) { out += n + ': ' + vars[n] + '\r\n'; });

    quad0 = parseInt(ipaddr.split('.')[0], 10);
    mask = ((quad0 & 0x80) === 0) ? 8 : ((quad0 & 0xc0) === 0xf0) ? 16 : 24;

// TBD: use the (obsolete) class A/B/C netmasks
    bcast = new netmask.Netmask(ipaddr + '/' + mask).broadcast;
    console.log();
    console.log('multicasting to ' + bcast + ':1900 from ' + ipaddr + ':' + portno);
    console.log(out);
    out = new Buffer(out);
    self.sock.send(out, 0, out.length, 1900, bcast);
  });
};

var listen = function(ipaddr, portno) {
  var ssdp;

  ssdp = new SSDP().on('response', function(msg, rinfo) {
    var f, i, info, j, lines;

    lines = msg.toString().split("\r\n");
    info = {};
    for (i = 1; i < lines.length; i++) {
      j = lines[i].indexOf(':');
      if (j <= 0) break;
      info[lines[i].substring(0, j)] = lines[i].substring(j + 1).trim();
    }

    f = function() {
      console.log('');
      console.log(rinfo);
      console.log(info);
    };

    http.request(url.parse(info.LOCATION || info.Location), function(response) {
      var data = '';

      response.on('data', function(chunk) {
        data += chunk.toString();
      }).on('end', function() {
        f();
        console.log(xml2json.toJson(data));
      }).on('close', function() {
        f();
        console.log('socket premature eof');
      }).setEncoding('utf8');
    }).on('error', function(err) {
      f();
      console.log('socket error: ' + err.message);
    }).end();
  });

  ssdp.server('192.168.1.72', null, portno);
  setTimeout(function() {
    ssdp.notify(ipaddr, portno, 'AIR CONDITIONER',
                { SPEC_VER: 'MSpec-1.00', SERVICE_NAME: 'ControlServer-MLib', MESSAGE_TYPE: 'CONTROLLER_START' });
  }, 1000);
};


var ifa, ifaces, ifaddrs, ifname;

ifaces = os.networkInterfaces();
for (ifname in ifaces) {
  if ((!ifaces.hasOwnProperty(ifname))
        || (ifname.indexOf('vmnet') === 0)
        || (ifname.indexOf('vnic') === 0)
        || (ifname.indexOf('tun') !== -1)) continue;

  ifaddrs = ifaces[ifname];
  if (ifaddrs.length === 0) continue;

  for (ifa = 0; ifa < ifaddrs.length; ifa++) {
    if ((ifaddrs[ifa].internal) || (ifaddrs[ifa].family !== 'IPv4')) continue;

    console.log('listening ' + ifname + ' on ' + ifaddrs[ifa].address + ' udp port ' + 10293);
    listen(ifaddrs[ifa].address, 10293);
  }
}
