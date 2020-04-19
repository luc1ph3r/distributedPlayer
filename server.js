const http   = require('http');
const sockjs = require('sockjs');
const uuid   = require('uuid');
const bunyan = require('bunyan');

const logger = bunyan.createLogger({
    name: 'DistributedPlayer',
    level: 10
});

function metricsHandlerFactory(provider) {
    function metricsHandler(req, res) {
        metrics = {
            connectionsCnt: provider.numberOfParticipants(),
        };

        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(metrics));
    }

    return metricsHandler;
}


http.createServer(metricsHandlerFactory(playerServer))
    .listen(1235);
