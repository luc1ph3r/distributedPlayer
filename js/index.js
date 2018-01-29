var sockURL = 'http://' + document.location.hostname + '/echo';
var player;

function socketOpened(reconnectInterval, updateTimeInterval, sock) {
    $('#connectionState').text('connected');
    $('#connectionState').css('color', 'green');

    clearInterval(reconnectInterval);

    // sock.send({
    //     type: 'init'
    // });

    updateTimeInterval = setInterval(function() {
        sock.send({
            type  : 'updateTimeInfo',
            value : player.currentTime
        });
    }, 5000);
}

function LOG(info) {
    console.log(`>>> ${new Date()}  ${info}`);
};

var STATES = {
    PLAYER: {
        play: 'play',
        pause: 'pause',
        seeking: 'seeking',
        seeked: 'seeked',
    },
    SERVER: {
        play: 'play',
        pause: 'pause',
        setTime: 'setTime',
        ready: 'ready',
        init: 'init',
        updateTimeInfo: 'updateTimeInfo',
    },
};

var LISTENERS = {
    play: function(event) {
        LOG('Sending a play event');

        sock.send({
            type: 'play'
        });
    },
    pause: function(event) {
        LOG('Sending a pause event');

        sock.send({
            type: 'pause'
        });
    },
    seeking: function(event) {
        LOG('Sending a seeking event');

        sock.send({
            type  : STATES.SERVER.setTime,
            value : player.currentTime
        });

        player.pause();
    },
    seeked: function() {
        LOG('Sending a seeked event');

        sock.send({
            type: STATES.SERVER.ready,
        });
    },
};

var setTimeByServer = false;

function removeStateListener(state) {
    player.removeEventListener(state, LISTENERS[state]);
}

function addStateListener(state) {
    player.addEventListener(state, LISTENERS[state]);
}

function socketMessage(event) {
    if (event.type !== 'message')
        return;

    var action;
    try {
        action = JSON.parse(event.data);
    } catch(error) {
        console.error('Failed to parse action: ' + event.data);
        return;
    }

    if (STATES.SERVER.pause === action.type) {
        LOG('Got a pause event');

        removeStateListener(STATES.PLAYER.pause);
        player.pause();
        addStateListener(STATES.PLAYER.pause);
    }

    if (STATES.SERVER.play === action.type) {
        LOG('Got a play event');

        // TODO: WHY doesn't it work without sending all commands
        // to the end of the event loop?

        removeStateListener(STATES.PLAYER.play);
        player.play()
        .then(() => addStateListener(STATES.PLAYER.play))
        .catch(err => addStateListener(STATES.PLAYER.play));
    }

    if (STATES.SERVER.setTime === action.type) {
        LOG('Got a setTime event');

        removeStateListener(STATES.PLAYER.seeking);
        player.pause();
        player.currentTime = action.value;
        // TODO: place back on a ready event
        // setTimeout(() => addStateListener(STATES.PLAYER.seeking), 0);
    }

    if (STATES.SERVER.ready === action.type) {
        LOG('Got a ready event');

        player.play()
        .then(() => addStateListener(STATES.PLAYER.seeking))
        .catch(err => addStateListener(STATES.PLAYER.seeking));
    }
}

function socketClosed(reconnectInterval, updateTimeInterval, sock) {
    $('#connectionState').text('not connected');
    $('#connectionState').css('color', 'red');

    clearInterval(updateTimeInterval);
    setTimeout(socketLogic, 1000);
}

var sock;

function socketLogic() {
    sock = new SockJS(sockURL);

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

    removeStateListener(STATES.PLAYER.play);
    removeStateListener(STATES.PLAYER.pause);
    removeStateListener(STATES.PLAYER.seeking);
    removeStateListener(STATES.PLAYER.seeked);

    addStateListener(STATES.PLAYER.play);
    addStateListener(STATES.PLAYER.pause);
    addStateListener(STATES.PLAYER.seeking);
    addStateListener(STATES.PLAYER.seeked);
}

$(document).ready(function() {
    var playerObject = videojs(document.querySelector('.video-js'), {
        fluid: true
    }, function() {
        // video is initialized
    });

    var playlistArray = [];
    // for (var i = 3; i != 14; ++i) {
    //     playlistArray.push({
    //         name: 'Made In Abyss ' + i,
    //         duration: 0,
    //         sources: [{
    //             src: '/media/mia/' + i + '.mp4',
    //             type: 'video/mp4'
    //         }],
    //         textTracks:[{
    //             kind: 'captions',
    //             label: 'Russian',
    //             src: '/media/mia/' + i + '.vtt',
    //             default: true
    //         }],
    //         thumbnail: [{
    //             src: '/media/mia/abyssbanner.jpg'
    //         }]
    //     });
    // }
    playlistArray.push({
       name: 'Some video',
       duration: 0,
       sources: [{
           src: '/media/god.mp4',
           type: 'video/mp4'
       }],
    });

    playerObject.playlistUi({className: 'vjs-playlist'});
    playerObject.playlist(playlistArray);

    // Play through the playlist automatically.
    playerObject.playlist.autoadvance(0);

    player = document.querySelector('#player video');
    socketLogic();

    $('#player').keypress(function(e) {
        if (e.which === 32) { // space
            e.preventDefault();
            player.paused
                ? player.play()
                : player.pause();
        }
    });

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
});
