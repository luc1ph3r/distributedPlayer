var sockURL = 'http://'
            + document.location.hostname
            + (document.location.port ? (':' + document.location.port) : '')
            + '/echo';
var player;
var playerObj;
var nickname;
var isDebug = false;
var currentState;

function socketOpened(reconnectInterval, updateTimeInterval) {
    $('#connectionState').text('connected');

    clearInterval(reconnectInterval);

    sock.send({
        type: STATES.PLAYER.init,
    });

    updateTimeInterval = setInterval(function() {
        sock.send({
            type  : 'updateTimeInfo',
            value : playerObj.currentTime(),
        });
    }, 5000);
}

function LOG(info) {
    if (isDebug) {
        console.log(`>>> ${Date.now()}  ${info}`);
    }
};

function isPlaying() {
    return !playerObj.paused && !playerObj.ended() && playerObj.readyState() > 2;
}

function pauseVideo() {
    playerObj.pause();
    while (isPlaying())
        ;
}

var STATES = {
    PLAYER: {
        play: 'play',
        pause: 'pause',
        seeked: 'seeked',
        init: 'init',
        playlistitem: 'playlistitem',
        setTime: 'setTime',
    },
    SERVER: {
        play: 'play',
        pause: 'pause',
        setTime: 'setTime',
        ready: 'ready',
        init: 'init',
        updateTimeInfo: 'updateTimeInfo',
        updatePlaylist: 'updatePlaylist',
        getMetrics: 'getMetrics',
        newIdx: 'newIdx',
        message: 'message',
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
    seeked: function() {
        if (STATES.PLAYER.init === currentState) {
            LOG('Init, seeked');
            currentState = null;
            return;
        } else if (STATES.PLAYER.setTime === currentState) {
            LOG('Sending a seeked event');

            sock.send({
                type: STATES.SERVER.ready,
            });
        } else {
            removeStateListener(STATES.PLAYER.pause);
            removeStateListener(STATES.PLAYER.play);

            LOG('Sending a setTime event');

            pauseVideo();
            currentState = STATES.PLAYER.setTime;

            sock.send({
                type  : STATES.SERVER.setTime,
                value : playerObj.currentTime(),
            });
        }
    },
    playlistitem: function() {
        // fix for Yandex Browser
        // otherwise currentItem() returns a value before a change
        setTimeout(() => {
            const idx = playerObj.playlist.currentItem();

            sock.send({
                type: 'newIdx',
                value: idx,
            });
        }, 0);
    },
};

var setTimeByServer = false;

function removeStateListener(state) {
    LOG('Removing ' + state + ' listener');

    playerObj.off(state, LISTENERS[state]);
}

function addStateListener(state) {
    LOG('Adding ' + state + ' listener');

    playerObj.on(state, LISTENERS[state]);
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
        playerObj.pause();
        addStateListener(STATES.PLAYER.pause);
    }

    if (STATES.SERVER.play === action.type) {
        LOG('Got a play event');

        removeStateListener(STATES.PLAYER.play);
        playerObj.play();
        addStateListener(STATES.PLAYER.play);
    }

    if (STATES.SERVER.setTime === action.type) {
        LOG('Got a setTime event');

        currentState = STATES.PLAYER.setTime;

        removeStateListener(STATES.PLAYER.pause);
        removeStateListener(STATES.PLAYER.play);

        pauseVideo();
        playerObj.currentTime(action.value);
    }

    if (STATES.SERVER.ready === action.type) {
        LOG('Got a ready event');

        currentState = null;

        playerObj.play();
        addStateListener(STATES.PLAYER.play);
        addStateListener(STATES.PLAYER.pause);
    }

    if (STATES.SERVER.init === action.type) {
        LOG('Got an init event');

        removeStateListener(STATES.PLAYER.seeked);

        playerObj.currentTime(action.value);
        addStateListener(STATES.PLAYER.seeked);
    }

    if (STATES.SERVER.updatePlaylist === action.type) {
        LOG('Got an updatePlaylist event');

        updatePlaylist();
    }

    if (STATES.SERVER.getMetrics === action.type) {
        LOG('Got a getMetrics event');

        updateMetrics(action.value);
    }

    if (STATES.SERVER.newIdx === action.type) {
        LOG('Got a newIdx event');

        removeStateListener(STATES.PLAYER.playlistitem);

        playerObj.playlist.currentItem(action.value);

        setTimeout(() => {
            addStateListener(STATES.PLAYER.playlistitem);
        });
    }

    if (STATES.SERVER.message === action.type) {
        LOG('Got a message event');

        const msg = action.value;
        addMessage(msg.author, msg.text, msg.ts);
    }
}

function socketClosed(reconnectInterval, updateTimeInterval) {
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
        socketOpened(reconnectInterval, updateTimeInterval);
    };
    sock.onmessage = function(event) {
        socketMessage(event);
    };
    sock.onclose = function() {
        socketClosed(reconnectInterval, updateTimeInterval);
    };

    removeStateListener(STATES.PLAYER.play);
    removeStateListener(STATES.PLAYER.pause);
    removeStateListener(STATES.PLAYER.seeked);

    addStateListener(STATES.PLAYER.play);
    addStateListener(STATES.PLAYER.pause);
    addStateListener(STATES.PLAYER.seeked);
}

function makeLocalUrl(path) {
    return String(document.location) + path;
}

function updatePlaylist(callback) {
    fetch('/playlist/get')
    .then(res => {
        if (res.ok) {
            return res.json();
        } else {
            throw new Error(`${res.status} (${res.statusText})`);
        }
    })
    .then(playlistArray => {
        for (let item of playlistArray) {
            for (let source of item.sources) {
                if (!source.src.startsWith('http')) {
                    source.src = makeLocalUrl(source.src);
                }
            }
        }

        playerObj.playlist(playlistArray);
        playerObj.playlist.currentItem(0);

        if (callback) {
            callback();
        }
    })
    .catch(err => {
        $('.vjs-playlist').text(`Failed to get the playlist: ${err}`)
    });
}

function updateMetrics(metrics) {
    if (metrics.cnt) {
        $('#connectionsCnt').text(metrics.cnt);
    }
}

// TODO: probably not for production purposes
function initiatePlaylistUpdate() {
    sock.send({
        type  : 'updatePlaylist',
    });
}

function createMessage(author, text, time) {
    let message = $('<div class="message"></div>');
    // TODO: prevent injections!
    $('<p class="message-author">' + author + '</p>').appendTo(message);
    $('<p class="message-text">' + text + '</p>').appendTo(message);
    $('<p class="message-time">' + time + '</p>').appendTo(message);

    return message;
}

function addMessage(author, text, ts) {
    if (0 === $('#messages>ul>li').length) {
        $('#no-messages').css('display', 'none');
    }

    const dt = new Date(ts);
    const tzOffset = dt.getTimezoneOffset() * 60000;
    const time = (new Date(ts - tzOffset)).toISOString();

    createMessage(author, text, time).appendTo('#messages>ul');
}

function sendMessage(text) {
    const ts = Date.now();

    addMessage(nickname, text, ts);

    sock.send({
        type: 'message',
        value: {
            author: nickname,
            text: text,
            ts: ts,
        }
    });
}

$(document).ready(function() {
    playerObj = videojs(document.querySelector('.video-js'), {
        fluid: true,
        techOrder: ['html5', 'youtube'],
        youtube: {
            cc_lang_pref: 'en',
            cc_load_policy: 1,
            ytControls: 0,
        },
    }, function() {
        // video is initialized
    });

    playerObj.playlistUi({className: 'vjs-playlist', playOnSelect: false});

    // Play through the playlist automatically.
    playerObj.playlist.autoadvance(1);

    updatePlaylist(() => {
        addStateListener(STATES.PLAYER.playlistitem);
    });

    player = document.querySelector('#player video');
    socketLogic();

    $('#player').keypress(function(e) {
        if (e.which === 32) { // space
            e.preventDefault();
            playerObj.paused()
                ? playerObj.play()
                : playerObj.pause();
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

    $('#message-typing').keydown(function (e) {
        const isEnter = event.keyCode == 10 || event.keyCode == 13;
        const isCtrlOrCommand = event.metaKey || event.ctrlKey;

        if (isCtrlOrCommand && isEnter) {
            if (undefined === nickname
             || null === nickname
             || 0 === nickname.length
            ) {
                nickname = prompt('Type your nickname: ');

                if (null === nickname) {
                    return;
                }

                if (0 === nickname.length) {
                    alert('nickname cannot be empty');
                    return;
                }
            }

            let textarea = document.getElementById('message-typing');
            const text = textarea.value;

            sendMessage(text);

            textarea.value = '';
        }
    });

    $('#add-url-button').click(() => {
        // TODO: validate!
        const urlVal = $('#add-url-input').val();

        fetch("/playlist/add", {
            method: "POST",
            body: JSON.stringify({url: urlVal})
        }).then(res => {
            if (res.ok) {
                updatePlaylist();
                initiatePlaylistUpdate();
            }
        });
    });

    (function getMetrics() {
        setTimeout(() => {
            try {
                sock.send({
                    type: 'getMetrics',
                });
            } catch (err) {
                $('#connectionsCnt').text('error');
                console.log(err);
            }

            getMetrics();
        }, 3000);
    })();
});
