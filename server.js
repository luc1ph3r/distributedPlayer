const http   = require('http');
const sockjs = require('sockjs');
const uuid   = require('uuid');
const bunyan = require('bunyan');
const url = require('url');

const logger = bunyan.createLogger({
    name: 'DistributedPlayer',
    level: 10
});

let playlist = require('./media/playlist.json');

function playlistAdd(req, res) {
    let body = '';

    req.on('data', function (data) {
        body += data;

        // Too much POST data, kill the connection!
        if (body.length > 1e6) {
            return req.connection.destroy();
        }
    });

    req.on('end', function () {
        let obj;

        try {
            obj = JSON.parse(body);
        } catch (err) {
            console.log(`err while parsing json: ${err}`);

            res.writeHead(500);
            return res.end();
        }

        if (!('url' in obj)) {
            res.writeHead(400);
            return res.end();
        }

        let type;
        let hostname = url.parse(obj.url).hostname;

        if (!hostname) {
            res.writeHead(400);
            return res.end();
        }

        if (hostname.startsWith('www.')) {
            hostname = hostname.slice(4);
        }

        if (hostname === 'youtu.be' || hostname === 'youtube.com') {
            type = 'video/youtube';
        } else {
            type = 'video/mp4';
        }

        playlist.push({
            "name": ('idx_' + playlist.length),
            "sources": [
                {
                    "src": obj.url,
                    "type": "video/youtube"
                }
            ]
        });

        res.writeHead(200);
        res.end();
    });
}

function playlistGet(req, res) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(playlist));
}

function router(req, res) {
    const urlObj = url.parse(req.url, true);
    const path = urlObj.pathname.split('/');

    if (path.length < 3 ) {
        console.log('not found: ' + req.url);

        res.writeHead(404);
        return res.end();
    }

    if (path[2] === 'get') {
        return playlistGet(req, res);
    } else if (path[2] === 'add') {
        if (req.method.toLowerCase() !== 'post') {
            res.writeHead(400);
            return res.end();
        }

        return playlistAdd(req, res);
    } else {
        res.writeHead(404);
        return res.end();
    }
}

http.createServer(router)
    .listen(1235);
