const http   = require('http');
const sockjs = require('sockjs');
const uuid   = require('uuid');
const bunyan = require('bunyan');

const logger = bunyan.createLogger({
    name: 'DistributedPlayer',
    level: 10
});

class PlayerServer {
    constructor() {
        this.STATES = {
            PLAYER: {
                play: 'play',
                pause: 'pause',
                seeked: 'seeked',
                ready: 'ready',
            },
            SERVER: {
                play: 'play',
                pause: 'pause',
                setTime: 'setTime',
                ready: 'ready',
                init: 'init',
                updateTimeInfo: 'updateTimeInfo',
                waiting: 'waiting',
                updatePlaylist: 'updatePlaylist',
                getMetrics: 'getMetrics',
                playlistItem: 'playlistItem',
                message: 'message',
            },
        };

        this.currentTime = 0;
        this.currentPlaylistIdx = 0;
        this.times = [];
        this.connections = {};
        this.connectionsInfo = {};
        this.currentState = 'pause';
        this.numberOfReadyParticipants = 0;
    }

    waitForParticipants() {
        this.numberOfReadyParticipants = 0;
    }

    registerParticipant(connectionId) {
        if (this.STATES.SERVER.waiting !== this.currentState) {
            return;
        }

        logger.info({name: 'registerParticipant', connectionId});

        if (!this.connectionsInfo[connectionId].ready) {
            ++this.numberOfReadyParticipants;
            this.connectionsInfo[connectionId].ready = true;
        }

        const participantsCnt = this.numberOfParticipants();

        logger.info({
            participantsCnt,
            numberOfReadyParticipants: this.numberOfReadyParticipants,
        });

        if (this.numberOfReadyParticipants >= participantsCnt) {
            logger.info('Sending a ready event to clients');

            this.sendToAll({
                type: this.STATES.PLAYER.ready,
            });

            this.currentState = null;
            this.numberOfReadyParticipants = 0;
            for (let id in this.connectionsInfo) {
                this.connectionsInfo[id].ready = false;
            }
        }
    }

    numberOfParticipants() {
        return Object.keys(this.connections).length;
    }

    addConnection(conn) {
        const connectionId = uuid.v4();
        this.connections[connectionId] = conn;
        this.connectionsInfo[connectionId] = { ready: false };

        conn.on('data', message => {
            try {
                message = JSON.parse(message);
            } catch(err) {
                logger.error('Failed to parse message: ' + message);
                return;
            }

            if (this.STATES.SERVER.init === message.type) {
                logger.info({connectionId}, 'Got an init event');

                this.send(connectionId, {
                    type  : this.STATES.SERVER.init,
                    value : {
                        time: this.currentTime,
                        playlistIdx: this.currentPlaylistIdx,
                    },
                });
            }

            if (this.STATES.SERVER.play === message.type ||
                this.STATES.SERVER.pause === message.type
            ) {
                logger.info({connectionId}, 'Got a play/pause event');

                this.sendToOthers(connectionId, {
                    type: message.type
                });
            }

            if (this.STATES.SERVER.updateTimeInfo === message.type) {
                // logger.info({connectionId}, 'Got an updateTimeInfo event');

                this.updateTimes(message.value);
            }

            if (this.STATES.SERVER.setTime === message.type) {
                logger.info({connectionId}, 'Got a setTime event');

                this.currentState = this.STATES.SERVER.waiting;
                this.registerParticipant(connectionId);

                this.sendToOthers(connectionId, {
                    type  : this.STATES.SERVER.setTime,
                    value : message.value
                });
            }

            if (this.STATES.SERVER.ready === message.type) {
                logger.info({connectionId}, 'Got a ready event');

                this.registerParticipant(connectionId);
            }

            if (this.STATES.SERVER.updatePlaylist === message.type) {
                logger.info({connectionId}, 'Got an updatePlaylist event');

                this.sendToOthers(connectionId, {
                    type: this.STATES.SERVER.updatePlaylist,
                });
            }

            if (this.STATES.SERVER.getMetrics === message.type) {
                logger.info({connectionId}, 'Got an getMetrics event');

                this.send(connectionId, {
                    type: this.STATES.SERVER.getMetrics,
                    value: {
                        cnt: this.numberOfParticipants(),
                    }
                });
            }

            if (this.STATES.SERVER.playlistItem === message.type) {
                logger.info({connectionId}, 'Got a playlistItem event');

                this.currentPlaylistIdx = message.value;

                this.sendToOthers(connectionId, {
                    type: this.STATES.SERVER.playlistItem,
                    value: message.value,
                });
            }

            if (this.STATES.SERVER.message === message.type) {
                logger.info({connectionId}, 'Got a message event');

                this.sendToOthers(connectionId, {
                    type: this.STATES.SERVER.message,
                    value: message.value,
                });
            }
        });

        conn.on('close', () => {
            delete this.connections[connectionId];
            delete this.connectionsInfo[connectionId];
        });
    }

    sendToAll(data) {
        logger.info({name: 'sendToAll'}, data);

        for (let id in this.connections) {
            this.connections[id].write(JSON.stringify(data));
        }
    }

    sendToOthers(sourceId, data) {
        logger.info({name: 'sendToOthers', sourceId}, data);

        for (let id in this.connections) {
            if (id !== sourceId) {
                // console.log(this.connections[id]);
                this.connections[id].write(JSON.stringify(data));
            }
        }
    }

    send(connectionId, data) {
        logger.info({name: 'send', connectionId}, data);

        this.connections[connectionId].write(JSON.stringify(data));
    }

    updateTimes(newTime) {
        this.currentTime = newTime + 5;
    }
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

const sockServer = sockjs.createServer();
const playerServer = new PlayerServer();
sockServer.on('connection', conn => {
    playerServer.addConnection(conn);
});

const httpServer = http.createServer();
sockServer.installHandlers(httpServer, { prefix: '/echo' });
httpServer.listen(1234, '127.0.0.1');
