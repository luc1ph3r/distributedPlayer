var sockURL = 'http://' + document.location.hostname + '/echo';
var player;

function socketOpened(reconnectInterval, updateTimeInterval, sock) {
    $('#connectionState').text('connected');
    $('#connectionState').css('color', 'green');

    clearInterval(reconnectInterval);

    sock.send({
        type: 'init'
    });

    updateTimeInterval = setInterval(function() {
        sock.send({
            type  : 'updateTimeInfo',
            value : player.currentTime
        });
    }, 5000);
}

function socketMessage(event) {
    if (event.type === 'message') {
        var action;
        try {
            action = JSON.parse(event.data);
        } catch(error) {
            console.error('Failed to parse action: ' + event.data);
            return;
        }

        if (action.type === 'pause') {
            player.pause();
        }

        if (action.type === 'play') {
            player.play();
        }

        if (action.type === 'setTime') {
            console.log('setTime: ' + action.value);

            player.currentTime = action.value;
        }
    }
}

function socketClosed(reconnectInterval, updateTimeInterval, sock) {
    $('#connectionState').text('not connected');
    $('#connectionState').css('color', 'red');

    clearInterval(updateTimeInterval);
    setTimeout(socketLogic, 1000);
}

var playListener;
var pauseListener;

function socketLogic() {
    var sock = new SockJS(sockURL);

    sock.oldSend = sock.send;
    sock.send = function(objToSend) { // stringify all sent objects
        sock.oldSend(JSON.stringify(objToSend));
    };
    var updateTimeInterval;
    var reconnectInterval;

    sock.onopen = function() {
        socketOpened(reconnectInterval, updateTimeInterval, sock);
    };
    sock.onmessage = function(event) {
        socketMessage(event);
    };
    sock.onclose = function() {
        socketClosed(reconnectInterval, updateTimeInterval, sock);
    };

    $('#goToTimeBtn').off('click');
    $('#goToTimeBtn').click(function() {
        var hms = $('#goToTimeInput').val().split(':');

        if (! (hms.length && hms.length === 3)) {
            alert('wrong time format!');
            return;
        }

        var nextTime = parseFloat(hms[0]) * 3600 + parseFloat(hms[1]) * 60 +
                       parseFloat(hms[2]);
        sock.send({
            type  : 'setTime',
            value : nextTime
        });
    });

    if (playListener) {
        player.removeEventListener('play', playListener);
    }
    if (pauseListener) {
        player.removeEventListener('pause', pauseListener);
    }

    playListener = function(event) {
        sock.send({
            type: 'play'
        });
    };
    pauseListener = function(event) {
        sock.send({
            type: 'pause'
        });
    };
    timeUpdateListener = function(event) {
        sock.send({
            type  : 'setTime',
            value : event.target.currentTime
        });
    };

    player.addEventListener('play',  playListener);
    player.addEventListener('pause', pauseListener);

    return sock;
}

$(document).ready(function() {
    var playerObject = videojs(document.querySelector('.video-js'), {
        fluid: true
    }, function() {
        // video is initialized
    });

    playerObject.playlistUi({className: 'vjs-playlist'});
    playerObject.playlist([
        {
            name: 'The Room',
            duration: 5975,
            sources: [{
                src: '/TheRoom.mp4',
                type: 'video/mp4'
            }],
            thumbnail: [{
                src: 'https://i.ytimg.com/vi/Nd5XpcKBCI8/maxresdefault.jpg'
            }]
        },
        {
            name: 'Barakamon 11',
            duration: 1372,
            sources: [{
                src: '/Barakamon/Barakamon11.mkv',
                type: 'video/mp4'
            }],
            textTracks:[{
                kind: 'captions',
                label: 'Russian',
                src: '/Barakamon/subs/vtt/Barakamon 11.vtt',
                default: true
            }],
            thumbnail: [{
                src: '/Barakamon/11.png'
            }]
        }
    ]);

    // Play through the playlist automatically.
    playerObject.playlist.autoadvance(0);

    player = document.querySelector('#player video');
    var sock = socketLogic();
});
