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

const userMap = {};
const gameMap = {};
const idArray = [];
const nameArray = [];

let emptyGame = function() {
    this.player1Id = null;
    this.player2Id = null;
    this.round = 3;     // TODO change back to 1
    this.gameDeck = null;
    this.trump = null;
    this.inPlay = null;
    this.plusMinus = -1;// TODO change back to 1
    this.aceValue = 1;
};

let blankPlayer = function() {
    this.name = null;
    this.opponentId = null;
    this.goal = null;
    this.hand = [];
    this.turn = null;
    this.tricks = null;
    this.picked = null;
    this.tricksWon = null;
    this.score = 0;
};

io.on('connection', function(socket){
    let userId = socket.id;
    idArray.push(userId);

    userMap[socket.id] = {name: 'none', gameId: 'none' };

    socket.on('setName', function(name) {
        let user = userMap[userId];
        user.name = name;
        nameArray.push(user.name);
        updateLobby();
    });

    socket.on('disconnect', function () {
        if (idArray.indexOf(userId)>-1){
            removeFromLobby(userId);
            updateLobby();
        }
        io.sockets.emit('receiveMessage', userMap[socket.id].name + ' has left the server');
        delete userMap[socket.id];
    });

    socket.on('message', function (msg) {
        io.sockets.emit('receiveMessage', msg);
    });

    socket.on('pair', function(user) {
        io.to(user).emit('rePair', [user, socket.id, userMap[user].name]);
    });

    socket.on('finalPair', function (userIds){
        console.log(userMap[userIds[0]].name + ' and ' + userMap[userIds[1]].name + ' want to play a game.');
        removeFromLobby(userIds[0]);
        removeFromLobby(userIds[1]);
        updateLobby();
        
        let game = new emptyGame();
        let gameId = Math.random().toString(36).substr(2, 5);
        userMap[userIds[0]].gameId = gameId;
        userMap[userIds[1]].gameId = gameId;
        game[userIds[0]] = new blankPlayer();
        game[userIds[1]] = new blankPlayer();
        game.player1Id = userIds[0];
        game.player2Id = userIds[1];
        game[userIds[0]].opponentId = userIds[1];
        game[userIds[1]].opponentId = userIds[0];
        game[userIds[0]].name = userMap[userIds[0]].name;
        game[userIds[1]].name = userMap[userIds[1]].name;
        
        gameMap[gameId] = game;
        
        io.sockets.connected[userIds[0]].emit('newGame');
        io.sockets.connected[userIds[1]].emit('newGame');
        
        deal(gameId);
    });

    socket.on('pick', function(pick){
        let gameId = userMap[socket.id].gameId;
        let game = gameMap[gameId];
        let player = socket.id;
        let opponent = game[player].opponentId;
        if (game.round - game[opponent].goal !== pick) {
            sendLog(gameId, `${game[player].name}'s goal is ${pick}`);
            game[player].goal = pick;
            game[player].turn = false;
            game[opponent].turn = true;
            game[player].picked = true;
            //io.sockets.emit('log', `${player1name} guesses ${pick} tricks`);
            gameMap[gameId] = game;
            if (game[player].picked && game[opponent].picked) {
                sendInfo(gameId);
            } else sendPick(gameId);
        }
    });
    
    socket.on('play_card', function (i) {
        let gameId = userMap[socket.id].gameId;
        let game = gameMap[gameId];
        let player = socket.id;
        let opponent = game[player].opponentId;
        
        //if ace is played, change value to aceValue.
        if (game[player].hand[i][0] === 1) {
            let holderSuit = game[player].hand[i][1];
            game[player].hand[i] = card(game.aceValue, holderSuit);
        }
        sendLog(gameId, `${game[player].name} plays ${game[player].hand[i][0]} of ${game[player].hand[i][1]}`);
        if (game.inPlay[1] === 20) {
            game.inPlay = game[player].hand[i];
            game[player].hand.splice(i, 1);
            game[player].turn = false;
            game[opponent].turn = true;
        } else {
            if (isTrick([game[player].hand[i], gameId])) {
                game[player].tricks++;
                game[opponent].turn = false;
                game[player].turn = true;
                game[player].tricksWon.push(game.inPlay);
                game[player].tricksWon.push(game[player].hand[i]);
                sendLog(gameId, `${game[player].name} got the trick`);
            } else {
                game[opponent].tricks++;
                game[player].turn = false;
                game[opponent].turn = true;
                game[opponent].tricksWon.push(game.inPlay);
                game[opponent].tricksWon.push(game[player].hand[i]);
                sendLog(gameId, `${game[opponent].name} got the trick`);
            }
            game[player].hand.splice(i, 1);
            game.inPlay = card(20, 20);
        }
        sendInfo(gameId);
    });
    
    socket.on('aces_low', function(){
        let gameId = userMap[socket.id].gameId;
        let game = gameMap[gameId];
        game.aceValue = 1;
        io.sockets.connected[game.player1Id].emit('lowAce');
        io.sockets.connected[game.player2Id].emit('lowAce');
    });
    
    socket.on('aces_high', function(){
        let gameId = userMap[socket.id].gameId;
        let game = gameMap[gameId];
        game.aceValue = 16;
        io.sockets.connected[game.player1Id].emit('highAce');
        io.sockets.connected[game.player2Id].emit('highAce');
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

const deal = gameId => {
    let game = gameMap[gameId];
    
    if (game.round === 0) {
        endGame(gameId)
    } else {
        sendLog(gameId, `<span style="text-decoration: overline underline;">Dealing new hand for round ${game.round}.</span>`);
    
        if (isEven(game.round)) {
            game[game.player1Id].turn = true;
            game[game.player2Id].turn = false;
        } else {
            game[game.player1Id].turn = false;
            game[game.player2Id].turn = true;
        }
    
        game.inPlay = card(20, 20);
    
        game[game.player1Id].picked = false;
        game[game.player2Id].picked = false;
        game[game.player1Id].tricksWon = [];
        game[game.player2Id].tricksWon = [];
        game[game.player1Id].goal = '--';
        game[game.player2Id].goal = '--';
        game[game.player1Id].tricks = 0;
        game[game.player2Id].tricks = 0;
        game[game.player1Id].hand = [];
        game[game.player2Id].hand = [];
    
        game.gameDeck = deck();
    
        for (let i = 0; i < game.round; i++) {
            game[game.player1Id].hand.push(game.gameDeck.pop());
            game[game.player2Id].hand.push(game.gameDeck.pop());
        }
    
        game.trump = gameMap[gameId].gameDeck.pop();
    
        sendLog(gameId, `The trump is ${game.trump[1]}.`);
        //gameMap[gameId] = game;
        sendPick(gameId);
    }
};

const isEven = n => n % 2 == 0;

const sendPick = id => {
    let game = gameMap[id];
    
    let player1Stats = [game[game.player1Id].score, game[game.player1Id].goal, game[game.player1Id].tricks];
    let player2Stats = [game[game.player2Id].score, game[game.player2Id].goal, game[game.player2Id].tricks];
    // [[hand], [opponents hand length], [trump], [inPlay], [?¿turn?¿], [your stats], [opponent stats], [opponent's name]]
    let player1info = [game[game.player1Id].hand, game[game.player2Id].hand.length, game.trump, game.inPlay, game[game.player1Id].turn, player1Stats, player2Stats, game[game.player2Id].name];
    let player2info = [game[game.player2Id].hand, game[game.player1Id].hand.length, game.trump, game.inPlay, game[game.player2Id].turn, player2Stats, player1Stats, game[game.player1Id].name];
    io.sockets.connected[game.player1Id].emit('picker', player1info);
    io.sockets.connected[game.player2Id].emit('picker', player2info);
};

const sendInfo = id => {
    let game = gameMap[id];
    
    if(game[game.player1Id].hand.length === 0 && game[game.player2Id].hand.length === 0){
        if (game.round === 10) {
            gameMap[id].plusMinus = -1;
        }
        endRound(id);
        deal(id);
    } else {
        let player1Stats = [game[game.player1Id].score, game[game.player1Id].goal, game[game.player1Id].tricks];
        let player2Stats = [game[game.player2Id].score, game[game.player2Id].goal, game[game.player2Id].tricks];
        // [[hand], [opponents hand length], [trump], [inPlay], [?¿turn?¿], [your stats], [opponent stats], [opponent's name]]
        let player1info = [game[game.player1Id].hand, game[game.player2Id].hand.length, game.trump, game.inPlay, game[game.player1Id].turn, player1Stats, player2Stats, game[game.player2Id].name];
        let player2info = [game[game.player2Id].hand, game[game.player1Id].hand.length, game.trump, game.inPlay, game[game.player2Id].turn, player2Stats, player1Stats, game[game.player1Id].name];
        io.sockets.connected[game.player1Id].emit('info', player1info);
        io.sockets.connected[game.player2Id].emit('info', player2info);
    }
};

const isTrick = data => {

    const CARD = 0;
    const GAME_ID = 1;
    const SUIT = 1;
    const VALUE = 0;
    
    let game = gameMap[data[GAME_ID]];
    
    if (!(data[CARD][SUIT] === 'joker' && game.inPlay[SUIT] === 'joker')) {
        if (data[CARD][SUIT] === 'joker' || game.inPlay[SUIT] === 'joker') return (data[CARD][0] > game.inPlay[CARD]); //one is joker, return (played>inPlay)
    }
    if (data[CARD][SUIT] === game.trump[SUIT] && game.inPlay[SUIT] !== game.trump[SUIT])  return true; //if trump is played on to non-trump, return true
    if (data[CARD][SUIT] === 'joker' && game.inPlay[SUIT] === 'joker') return false; //both are joker, return false
    if (data[CARD][SUIT] === game.inPlay[SUIT]) return (data[CARD][VALUE] > game.inPlay[VALUE]); // if same suits, return (played>inPlay)
    return false;
};

const jokerCount = hand => {
    let count = 0;
    for (let i = 0; i < hand.length; i++){
        if (hand[i][1] === 'joker') count++;
    }
    return count;
};

const endRound = gameId => {
    let game = gameMap[gameId];
    let firstId = game.player1Id;
    let secondId = game.player2Id;
    
    if (game[firstId].tricks === game[firstId].goal) {
        game[firstId].score += game.round + game[firstId].tricks + jokerCount(game[firstId].tricksWon)*5;
        sendLog(gameId, `${game[firstId].name} scored ${game.round + game[firstId].tricks + jokerCount(game[firstId].tricksWon)*5} and now has ${game[firstId].score} points.`);
    }
    if (game[secondId].tricks === game[secondId].goal) {
        game[secondId].score += game.round + game[secondId].tricks + jokerCount(game[secondId].tricksWon)*5;
        sendLog(gameId, `${game[secondId].name} scored ${game.round + game[secondId].tricks + jokerCount(game[secondId].tricksWon)*5} and now has ${game[secondId].score} points.`);
    }
    gameMap[gameId].round += gameMap[gameId].plusMinus;
};

const sendLog = (gameId, msg) => {
    io.sockets.connected[gameMap[gameId].player1Id].emit('receive_log', msg);
    io.sockets.connected[gameMap[gameId].player2Id].emit('receive_log', msg);
};

const endGame = gameId => {
  let game = gameMap[gameId];
  let player1 = game.player1Id;
  let player2 = game.player2Id;
  let gameText = `Game ${game[player1].name} vs ${game[player2].name} over: `;
  
  if (game[player1].score > game[player2].score) {
      io.sockets.emit('receiveMessage', `${gameText}${game[player1].name} won, ${game[player1].score} to ${game[player2].score}`);
  } else if (game[player1].score < game[player2].score) {
      io.sockets.emit('receiveMessage', `${gameText}${game[player2].name} won, ${game[player1].score} to ${game[player2].score}`);
  } else {
      io.sockets.emit('receiveMessage', `${gameText}Tie game, ${game[player1].score} to ${game[player2].score}`);
  }
  
  io.sockets.connected[player1].emit('setup_lobby');
  io.sockets.connected[player2].emit('setup_lobby');
  
  idArray.push(player1);
  idArray.push(player2);
  nameArray.push(game[player1].name);
  nameArray.push(game[player2].name);
  updateLobby();
};







