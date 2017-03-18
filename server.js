const http   = require('http');
const sockjs = require('sockjs');
const uuid   = require('uuid');
const bunyan = require('bunyan');

const logger = bunyan.createLogger({
    name: 'DistributedPlayer',
    level: 10
});

let currentTime = 0;
let times = [];
let connections = {};

function sendToAll(data) {
    for (let id in connections) {
        connections[id].write(JSON.stringify(data));
    }
}

function sendToOthers(sourceId, data) {
    for (let id in connections) {
        if (id != sourceId) {
            connections[id].write(JSON.stringify(data));
        }
    }
}

function send(connection, data) {
    connection.write(JSON.stringify(data));
}

// function updateTimes(newTime) {
//     times.push(newTime + 5);
//     times = times.slice(-3); // last 3 elements

//     if (times.length === 3) {
//         const variance12 = Math.abs(times[0] - times[1]);
//         const variance23 = Math.abs(times[1] - times[2]);
//         const variance13 = Math.abs(times[0] - times[2]);

//         const maxVariance = Math.max(variance12, variance23, variance13);
//         const minVariance = Math.min(variance12, variance23, variance13);

//         if (maxVariance > 2) {
//             // leave only times with minimum variance
//             if (minVariance === variance12) {
//                 times = [times[0], times[1]];
//             };
//             if (minVariance === variance23) {
//                 times = [times[1], times[2]];
//             };
//             if (minVariance === variance13) {
//                 times = [times[0], times[2]];
//             };
//         }
//     }

//     currentTime = times.reduce((acc, val) => acc + val, 0) / times.length;

//     logger.info({times, currentTime}, 'update times info');
// }

function updateTimes(newTime) {
    currentTime = newTime + 5;
}

const sockServer = sockjs.createServer({ sockjs_url: 'http://theroom.luc1ph3r.com/js/sockjs.min.js' });
sockServer.on('connection', conn => {
    const connectionId = uuid.v4();
    connections[connectionId] = conn;

    conn.on('data', message => {
        try {
            message = JSON.parse(message);
        } catch(err) {
            logger.error('Failed to parse message: ' + message);
            return;
        }

        if (message.type === 'updateTimeInfo') {
            updateTimes(message.value);
        }

        if (message.type === 'play' || message.type === 'pause') {
            sendToOthers(connectionId, {
                type: message.type
            });
        }

        if (message.type === 'setTime') {
            currentTime = message.value;
            times = [message.value];

            sendToAll({
                type  :  'setTime',
                value : message.value
            });
        }

        if (message.type === 'init') {
            logger.info({connectionId}, 'init');

            send(conn, {
                type  : 'setTime',
                value : currentTime
            });
        }
    });

    conn.on('close', () => {
        delete connections[connectionId];
    });
});

const server = http.createServer();
sockServer.installHandlers(server, { prefix: '/echo' });
server.listen(1234, '127.0.0.1');
