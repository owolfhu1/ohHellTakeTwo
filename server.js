/**
 * Created by Orion Wolf_Hubbard on 4/10/2017.
 */
let app = require('express')();
let http = require('http').Server(app);
let io = require('socket.io')(http);
let port = process.env.PORT || 3000;

app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

http.listen(port, function(){
    console.log('listening on *:' + port);
});

let userMap = new Map();
let gameMap = new Map();
let idArray = [];
let nameArray = [];

let emptyGame = {
    player1Id: null,
    player2Id: null,
    round: 1,
    player1Score: 0,
    player2Score: 0,
    player1Goal: null,
    player2Goal: null,
    player1Hand: [],
    player2Hand: [],
    gameDeck: null,
    trump: null,
    player1Turn: null,
    player2Turn :null,
    player1Tricks: null,
    player2Tricks: null,
    inPlay: null,
    player1Picked: null,
    player2Picked: null,
    plusMinus: 1,
    player1TricksWon: null,
    player2TricksWon: null,
    aceValue: 1
};

io.on('connection', function(socket){
    let connectedUserId = socket.id;
    idArray.push(connectedUserId);

    userMap.set(socket.id, { status: 'online', name: 'none', gameId: 'none' });

    socket.on('setName', function(name) {
        let user = userMap.get(connectedUserId);
        user.name = name;
        nameArray.push(user.name);
        updateLobby();
    });

    socket.on('disconnect', function () {
        if (idArray.indexOf(connectedUserId)>-1){
            removeFromLobby(connectedUserId);
            updateLobby();
        }
        io.sockets.emit('receiveMessage', userMap.get(socket.id).name + ' has left the server');
        userMap.delete(socket.id);
    });

    socket.on('message', function (msg) {
        io.sockets.emit('receiveMessage', msg);
    });

    socket.on('pair', function(userId) {
        let user = userMap.get(connectedUserId);
        io.to(userId).emit('rePair', [connectedUserId, userId, user.name]);
    });

    socket.on('finalPair', function (users){
        console.log(userMap.get(users[0]).name + ' and ' + userMap.get(users[1]).name + ' want to play a game.');

        let game = emptyGame;
        let gameId = Math.random().toString(36).substr(2, 5);
        game.player1Id = users[0];
        game.player2Id = users[1];
        removeFromLobby(users[0]);
        removeFromLobby(users[1]);
        updateLobby();
        gameMap.set(gameId, game);
        userMap.get(users[0]).gameId = gameId;
        userMap.get(users[1]).gameId = gameId;
        io.sockets.connected[users[0]].emit('newGame');
        io.sockets.connected[users[1]].emit('newGame');
        deal(gameId);
    });

    socket.on('pick', function(pick){
        let gameId = userMap.get(socket.id).gameId;

        if (gameMap.get(gameId).player1Id === socket.id) {
            gameMap.get(gameId).player1Goal = pick;
            gameMap.get(gameId).player1Turn = false;
            gameMap.get(gameId).player2Turn = true;
            gameMap.get(gameId).player1Picked = true;
            //io.sockets.emit('log', `${player1name} guesses ${pick} tricks`);
        }
        if (gameMap.get(gameId).player2Id === socket.id) {
            gameMap.get(gameId).player2Goal = pick;
            gameMap.get(gameId).player2Turn = false;
            gameMap.get(gameId).player1Turn = true;
            gameMap.get(gameId).player2Picked= true;
            //io.sockets.emit('log', `${player2name} guesses ${pick} tricks`);
        }

        if (gameMap.get(gameId).player1Picked&&gameMap.get(gameId).player2Picked){
            sendInfo(gameId);
        } else sendPick(gameId);

    });

    socket.on('play_card', function (i) {
        gameId = userMap.get(socket.id).gameId;

        if (gameMap.get(gameId).inPlay[1] === 20) {
            if (gameMap.get(gameId).player1Id === socket.id) {
                if (gameMap.get(gameId).player1Hand[i][0] === 1) {
                    let holderSuit = gameMap.get(gameId).player1Hand[i][1];
                    gameMap.get(gameId).player1Hand[i] = card(gameMap.get(gameId).aceValue, holderSuit);
                }
                gameMap.get(gameId).inPlay = gameMap.get(gameId).player1Hand[i];
                //io.sockets.emit('log', `${player1name} plays ${player1Hand[i][0]} of ${player1Hand[i][1]}`);
                gameMap.get(gameId).player1Hand.splice(i, 1);
                gameMap.get(gameId).player1Turn = false;
                gameMap.get(gameId).player2Turn = true;
            }
            if (gameMap.get(gameId).player2Id === socket.id) {
                if (gameMap.get(gameId).player2Hand[i][0] === 1) {
                    let holderSuit = gameMap.get(gameId).player2Hand[i][1];
                    gameMap.get(gameId).player2Hand[i] = card(gameMap.get(gameId).aceValue, holderSuit);
                }
                gameMap.get(gameId).inPlay = gameMap.get(gameId).player2Hand[i];
                //io.sockets.emit('log', `${player2name} plays ${player2Hand[i][0]} of ${player2Hand[i][1]}`);
                gameMap.get(gameId).player2Hand.splice(i, 1);
                gameMap.get(gameId).player2Turn = false;
                gameMap.get(gameId).player1Turn = true;
            }
            sendInfo(gameId);
        } else {
            if (gameMap.get(gameId).player1Id === socket.id) {
                if (gameMap.get(gameId).player1Hand[i][0] === 1) {
                    let holderSuit = gameMap.get(gameId).player1Hand[i][1];
                    gameMap.get(gameId).player1Hand[i] = card(gameMap.get(gameId).aceValue, holderSuit);
                }
                //io.sockets.emit('log', `${player1name} plays ${player1Hand[i][0]} of ${player1Hand[i][1]}`);
                if (isTrick([gameMap.get(gameId).player1Hand[i], gameId])){
                    gameMap.get(gameId).player1Tricks++;
                    //io.sockets.emit('log', `${player1name} got the trick`);
                    gameMap.get(gameId).player2Turn = false;
                    gameMap.get(gameId).player1Turn = true;
                    gameMap.get(gameId).player1TricksWon.push(gameMap.get(gameId).inPlay);
                    gameMap.get(gameId).player1TricksWon.push(gameMap.get(gameId).player1Hand[i]);
                } else {
                    gameMap.get(gameId).player2Tricks++;
                    //io.sockets.emit('log', `${player2name} got the trick`);
                    gameMap.get(gameId).player1Turn = false;
                    gameMap.get(gameId).player2Turn = true;
                    gameMap.get(gameId).player2TricksWon.push(gameMap.get(gameId).inPlay);
                    gameMap.get(gameId).player2TricksWon.push(gameMap.get(gameId).player1Hand[i]);
                }
                gameMap.get(gameId).player1Hand.splice(i, 1);
            }
            if (gameMap.get(gameId).player2Id === socket.id) {
                if (gameMap.get(gameId).player2Hand[i][0] === 1) {
                    let holderSuit = gameMap.get(gameId).player2Hand[i][1];
                    gameMap.get(gameId).player2Hand[i] = card(gameMap.get(gameId).aceValue, holderSuit);
                }
                //io.sockets.emit('log', `${player2name} plays ${player2Hand[i][0]} of ${player2Hand[i][1]}`);
                if (isTrick([gameMap.get(gameId).player2Hand[i], gameId])){
                    gameMap.get(gameId).player2Tricks++;
                    //io.sockets.emit('log', `${player2name} got the trick`);
                    gameMap.get(gameId).player1Turn = false;
                    gameMap.get(gameId).player2Turn = true;
                    gameMap.get(gameId).player2TricksWon.push(gameMap.get(gameId).inPlay);
                    gameMap.get(gameId).player2TricksWon.push(gameMap.get(gameId).player2Hand[i]);
                } else {
                    gameMap.get(gameId).player1Tricks++;
                    //io.sockets.emit('log', `${player1name} got the trick`);
                    gameMap.get(gameId).player2Turn = false;
                    gameMap.get(gameId).player1Turn = true;
                    gameMap.get(gameId).player1TricksWon.push(gameMap.get(gameId).inPlay);
                    gameMap.get(gameId).player1TricksWon.push(gameMap.get(gameId).player2Hand[i]);
                }
                gameMap.get(gameId).player2Hand.splice(i, 1);
            }
            gameMap.get(gameId).inPlay = card(20,20);
            sendInfo(gameId);
        }

    });

});

function updateLobby(){
    for (let i = 0; i < idArray.length; i++){
        io.sockets.connected[idArray[i]].emit('updateLobby', [nameArray, idArray]);
    }
}

function removeFromLobby(id){
    let key = idArray.indexOf(id);
    idArray.splice(key, 1);
    nameArray.splice(key, 1);
}

function deck() {
    let deckReturn = [];
    const vAnds =[
        [1,2,3,4,5,6,7,8,9,10,13,14,15],
        ["clubs", "spades", "hearts", "diamonds"]
    ];
    for (let v = 0; v < vAnds[0].length; v++){
        for (let s = 0; s < vAnds[1].length; s++){
            deckReturn.push(card(vAnds[0][v],vAnds[1][s]));
        }
    }
    deckReturn.push(card(11,'joker'));
    deckReturn.push(card(12,'joker'));
    shuffle(deckReturn);
    return deckReturn;
}

function card(value, suit) {return [value, suit];}

function shuffle(a) {
    for (let i = a.length; i; i--) {
        let j = Math.floor(Math.random() * i);
        [a[i - 1], a[j]] = [a[j], a[i - 1]];
    }
}

const deal = id => {
    console.log(`dealing for game: ${id} Players: ${userMap.get(gameMap.get(id).player1Id).name} & ${userMap.get(gameMap.get(id).player2Id).name}`);
    //io.sockets.emit('log', `<u>Starting new round</u>`);

    if (isEven(gameMap.get(id).round)){
        gameMap.get(id).player1Turn = true;
        gameMap.get(id).player2Turn = false;
    } else {
        gameMap.get(id).player2Turn = true;
        gameMap.get(id).player1Turn = false;
    }

    gameMap.get(id).inPlay = card(20,20);
    gameMap.get(id).player1Picked = false;
    gameMap.get(id).player2Picked = false;
    gameMap.get(id).player1TricksWon = [];
    gameMap.get(id).player2TricksWon = [];
    gameMap.get(id).player1Goal = '--';
    gameMap.get(id).player2Goal = '--';
    gameMap.get(id).player1Tricks = 0;
    gameMap.get(id).player2Tricks = 0;
    gameMap.get(id).player1Hand = [];
    gameMap.get(id).player2Hand = [];

    gameMap.get(id).gameDeck = deck();

    for (let i = 0; i < gameMap.get(id).round; i++){
        gameMap.get(id).player1Hand.push(gameMap.get(id).gameDeck.pop());
        gameMap.get(id).player2Hand.push(gameMap.get(id).gameDeck.pop());
    }

    gameMap.get(id).trump = gameMap.get(id).gameDeck.pop();

    //io.sockets.emit('log', `Trump is ${trump[1]}`);

    sendPick(id);
};

const isEven = n => n % 2 == 0;

const sendPick = id => {
    let player1Stats = [gameMap.get(id).player1Score, gameMap.get(id).player1Goal, gameMap.get(id).player1Tricks];
    let player2Stats = [gameMap.get(id).player2Score, gameMap.get(id).player2Goal, gameMap.get(id).player2Tricks];
    // [[hand], [opponents hand length], [trump], [inPlay], [?¿turn?¿], [your stats], [opponent stats], [opponent's name]]
    let player1info = [gameMap.get(id).player1Hand, gameMap.get(id).player2Hand.length, gameMap.get(id).trump, gameMap.get(id).inPlay, gameMap.get(id).player1Turn, player1Stats, player2Stats];
    let player2info = [gameMap.get(id).player2Hand, gameMap.get(id).player1Hand.length, gameMap.get(id).trump, gameMap.get(id).inPlay, gameMap.get(id).player2Turn, player2Stats, player1Stats];
    io.sockets.connected[gameMap.get(id).player1Id].emit('picker', player1info);
    io.sockets.connected[gameMap.get(id).player2Id].emit('picker', player2info);
};

const sendInfo = id => {
    if(gameMap.get(id).player1Hand.length === 0 && gameMap.get(id).player2Hand.length === 0){
        if (gameMap.get(id).round === 10) gameMap.get(id).plusMinus = -1;
        endRound(id);
        deal(id);
    } else {
        let player1Stats = [gameMap.get(id).player1Score, gameMap.get(id).player1Goal, gameMap.get(id).player1Tricks];
        let player2Stats = [gameMap.get(id).player2Score, gameMap.get(id).player2Goal, gameMap.get(id).player2Tricks];
        // [[hand], [opponents hand length], [trump], [inPlay], [?¿turn?¿], [your stats], [opponent stats], [opponent's name]]
        let player1info = [gameMap.get(id).player1Hand, gameMap.get(id).player2Hand.length, gameMap.get(id).trump, gameMap.get(id).inPlay, gameMap.get(id).player1Turn, player1Stats, player2Stats];
        let player2info = [gameMap.get(id).player2Hand, gameMap.get(id).player1Hand.length, gameMap.get(id).trump, gameMap.get(id).inPlay, gameMap.get(id).player2Turn, player2Stats, player1Stats];
        io.sockets.connected[gameMap.get(id).player1Id].emit('info', player1info);
        io.sockets.connected[gameMap.get(id).player2Id].emit('info', player2info);
    }
};

const isTrick = data => {

    const CARD = 0;
    const GAME_ID = 1;
    const SUIT = 1;
    const VALUE = 0;
    
    if (!(data[CARD][SUIT] === 'joker' && gameMap.get(data[GAME_ID]).inPlay[SUIT] === 'joker')) {
        if (data[CARD][SUIT] === 'joker' || gameMap.get(data[GAME_ID]).inPlay[SUIT] === 'joker') return (data[CARD][0] > gameMap.get(data[GAME_ID]).inPlay[CARD]); //one is joker, return (played>inPlay)
    }
    if (data[CARD][SUIT] === gameMap.get(data[GAME_ID]).trump[SUIT] && gameMap.get(data[GAME_ID]).inPlay[SUIT] !== gameMap.get(data[GAME_ID]).trump[SUIT])  return true; //if trump is played on to non-trump, return true
    if (data[CARD][SUIT] === 'joker' && gameMap.get(data[GAME_ID]).inPlay[SUIT] === 'joker') return false; //both are joker, return false
    if (data[CARD][SUIT] === gameMap.get(data[GAME_ID]).inPlay[SUIT]) return (data[CARD][VALUE] > gameMap.get(data[GAME_ID]).inPlay[VALUE]); // if same suits, return (played>inPlay)
    return false;
};

const jokerCount = hand => {
    let count = 0;
    for (let i = 0; i < hand.length; i++){
        if (hand[i][1] === 'joker') count++;
    }
    return count;
};

const endRound = id => {
    if (gameMap.get(id).player1Tricks === gameMap.get(id).player1Goal) {
        gameMap.get(id).player1Score += gameMap.get(id).round + gameMap.get(id).player1Tricks + jokerCount(gameMap.get(id).player1TricksWon*5);
        //io.sockets.emit('log', `${player1name} scored ${round + player1Tricks + jokerCount(player1TricksWon)*5}`);
    }
    if (gameMap.get(id).player2Tricks === gameMap.get(id).player2Goal) {
        gameMap.get(id).player2Score += gameMap.get(id).round + gameMap.get(id).player2Tricks + jokerCount(gameMap.get(id).player2TricksWon)*5;
        //io.sockets.emit('log', `${player2name} scored ${round + player2Tricks + jokerCount(player2TricksWon)*5}`);
    }
    gameMap.get(id).round += gameMap.get(id).plusMinus;
};







