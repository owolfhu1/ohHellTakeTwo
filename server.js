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

let gameId = 0;
const userMap = new Map();
const gameMap = new Map();
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
    plusMinus: null,
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
        if (idArray.indexOf(socket.id)>-1){
            removeUser(socket.id)
            updateLobby();
        }
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
        game.player1Id = users[0];
        game.player2Id = users[1];
        removeUser(users[0]);
        removeUser(users[1]);
        updateLobby();
        gameId++;
        gameMap.set(gameId, game);
        //userMap[users[0]].gameId = gameId;
        //userMap[users[1]].gameId = gameId;
        io.sockets.connected[users[0]].emit('newGame');
        io.sockets.connected[users[1]].emit('newGame');

        deal(gameId);
    });

});

function updateLobby(){
    for (let i = 0; i < idArray.length; i++){
        io.sockets.connected[idArray[i]].emit('updateLobby', [nameArray, idArray]);
    }
}

function removeUser(id){
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

function deal(id) {

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
}

function isEven(n) {
    return n % 2 == 0;
}

function sendPick(id){
    let player1Stats = [gameMap.get(id).player1Score, gameMap.get(id).player1Goal, gameMap.get(id).player1Tricks];
    let player2Stats = [gameMap.get(id).player2Score, gameMap.get(id).player2Goal, gameMap.get(id).player2Tricks];
    // [[hand], [opponents hand length], [trump], [inPlay], [?¿turn?¿], [your stats], [opponent stats], [opponent's name]]
    let player1info = [gameMap.get(id).player1Hand, gameMap.get(id).player2Hand.length, gameMap.get(id).trump, gameMap.get(id).inPlay, gameMap.get(id).player1Turn, player1Stats, player2Stats];
    let player2info = [gameMap.get(id).player2Hand, gameMap.get(id).player1Hand.length, gameMap.get(id).trump, gameMap.get(id).inPlay, gameMap.get(id).player2Turn, player2Stats, player1Stats];
    io.sockets.connected[gameMap.get(id).player1Id].emit('picker', player1info);
    io.sockets.connected[gameMap.get(id).player2Id].emit('picker', player2info);
}










