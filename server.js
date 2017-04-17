/**
 * Created by Orion Wolf_Hubbard on 4/10/2017.
 */
let app = require('express')();
let http = require('http').Server(app);
let io = require('socket.io')(http);
let port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

http.listen(port,() => {
    console.log('listening on *:' + port);
});

const userMap = {};
const gameMap = {};
const idArray = [];
const nameArray = [];
const finishedGameIdArray = [];

let emptyGame = function() {
    this.player1Id = null;
    this.player2Id = null;
    this.round = 1;
    this.gameDeck = null;
    this.trump = null;
    this.inPlay = null;
    this.plusMinus = 1;
    this.aceValue = 1;
    this.spies = [];
    this.locked = false;
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

io.on('connection', socket => {
    let userId = socket.id;
    idArray.push(userId);

    userMap[socket.id] = {name: 'no_input', gameId: 'none' };
    
    socket.on('setName', name => {
        let user = userMap[userId];
        user.name = name;
        nameArray.push(user.name);
        io.sockets.emit('receive_message', name + ' has joined the server');
        updateLobby();
    });

    socket.on('disconnect', () => {
        if (idArray.indexOf(userId) > -1){
            removeFromLobby(userId);
            updateLobby();
        }
        let gameId;
        if (userMap[userId].gameId !== 'none'){
            gameId = userMap[userId].gameId;
            let game = gameMap[gameId];
            let opponentId = game[userId].opponentId;
            finishedGameIdArray.push(gameId);
            io.sockets.connected[opponentId].emit('setup_lobby');
            io.sockets.emit('receive_message', `OH NO! ${game[userId].name} left unexpectedly, ${game[opponentId].name} has won by default.`);
            idArray.push(opponentId);
            nameArray.push(userMap[opponentId].name);
            game[userId].score = -1;
            game[opponentId].score = 1;
            userMap[opponentId].gameId = 'none';
            userMap[userId].gameId = 'none';
            updateLobby()
        }
        io.sockets.emit('receive_message', userMap[userId].name + ' has left the server');
        delete userMap[userId];
    });

    socket.on('message', msg => {
        io.sockets.emit('receive_message', msg);
    });

    socket.on('pair_request', user => {
        io.to(user).emit('rePair', [user, socket.id, userMap[user].name]);
    });

    socket.on('finalPair', userIds => {
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

    socket.on('pick', pick => {
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
            gameMap[gameId] = game;
            if (game[player].picked && game[opponent].picked) {
                sendInfo(gameId);
            } else sendPick(gameId);
        }
    });
    
    socket.on('play_card', i => {
        let gameId = userMap[socket.id].gameId;
        let game = gameMap[gameId];
        let player = socket.id;
        let opponent = game[player].opponentId;
        
        if (game[player].hand[i][0] === 1) {
            let holderSuit = game[player].hand[i][1];
            game[player].hand[i] = card(game.aceValue, holderSuit);
        }
    
        let value = game[player].hand[i][0];
        
             if (value ===  1 ) value = 'low Ace';
        else if (value ===  2 ) value = 'Two';
        else if (value ===  3 ) value = 'Three';
        else if (value ===  4 ) value = 'Four';
        else if (value ===  5 ) value = 'Five';
        else if (value ===  6 ) value = 'Six';
        else if (value ===  7 ) value = 'Seven';
        else if (value ===  8 ) value = 'Eight';
        else if (value ===  9 ) value = 'Nine';
        else if (value === 10 ) value = 'Ten';
        else if (value === 13 ) value = 'Jack';
        else if (value === 14 ) value = 'Queen';
        else if (value === 15 ) value = 'King';
        else if (value === 16 ) value = 'high Ace';
        
        if (value === 12 || value === 11){
            sendLog(gameId, `${game[player].name} plays a Joker`);
        } else sendLog(gameId, `${game[player].name} plays ${value} of ${game[player].hand[i][1]}`);
        
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
    
    socket.on('aces_low', () => {
        let gameId = userMap[socket.id].gameId;
        let game = gameMap[gameId];
        game.aceValue = 1;
        io.sockets.connected[game.player1Id].emit('lowAce');
        io.sockets.connected[game.player2Id].emit('lowAce');
    });
    
    socket.on('aces_high', () => {
        let gameId = userMap[socket.id].gameId;
        let game = gameMap[gameId];
        game.aceValue = 16;
        io.sockets.connected[game.player1Id].emit('highAce');
        io.sockets.connected[game.player2Id].emit('highAce');
    });
    
    socket.on('resign', () => {
        if (userMap[userId].gameId !== 'none') {
            let gameId = userMap[userId].gameId;
            let game = gameMap[gameId];
            let opponentId = game[userId].opponentId;
            finishedGameIdArray.push(gameId);
            io.sockets.connected[userId].emit('setup_lobby');
            io.sockets.connected[opponentId].emit('setup_lobby');
            io.sockets.emit('receive_message', `OH NO! ${game[userId].name} resigned, ${game[opponentId].name} has won by default.`);
            idArray.push(userId);
            idArray.push(opponentId);
            nameArray.push(userMap[userId].name);
            nameArray.push(userMap[opponentId].name);
            game[userId].score = -2;
            game[opponentId].score = -1;
            userMap[opponentId].gameId = 'none';
            userMap[userId].gameId = 'none';
            updateLobby();
        }
    });
    
    socket.on('buzz', () => {
        if (userMap[userId].gameId !== 'none') {
            io.sockets.connected[gameMap[userMap[userId].gameId][userId].opponentId].emit('buzzed');
            io.sockets.connected[userId].emit('buzzed');
        }
    });
    
    socket.on('leaderboard', () => {
        io.sockets.connected[userId].emit('leaderboard', makeBoard());
    });
    
    socket.on('games', () => {
        io.sockets.connected[userId].emit('games', finishedGameMap());
    });
    
    socket.on('watch_game', (gameId) => {
       if (gameId in gameMap){
           let game = gameMap[gameId];
           if (!game.locked) {
               removeFromLobby(userId);
               updateLobby();
               game.spies.push(userId);
               io.sockets.connected[userId].emit('newGame');
               io.sockets.connected[game.player1Id].emit('receive_message', `WARNING!! ${userMap[userId].name} is watching your game type '$kick' to kick them`);
               io.sockets.connected[game.player2Id].emit('receive_message', `WARNING!! ${userMap[userId].name} is watching your game type '$kick' to kick them`);
           }
       }
    });
    
    socket.on('lock', () => {
        if (userMap[userId].gameId !== 'none') {
            let game = gameMap[userMap[userId].gameId];
            game.locked = true;
            io.sockets.connected[game.player1Id].emit('receive_message', 'The game has been locked');
            io.sockets.connected[game.player2Id].emit('receive_message', 'The game has been locked');
        }
    });
    
    socket.on('unlock', () => {
        if (userMap[userId].gameId !== 'none') {
            let game = gameMap[userMap[userId].gameId];
            game.locked = false;
            io.sockets.connected[game.player1Id].emit('receive_message', 'The game has been unlocked');
            io.sockets.connected[game.player2Id].emit('receive_message', 'The game has been unlocked');
        }
    });
    
    socket.on('kick', () => {
        if (userMap[userId].gameId !== 'none') {
            let game = gameMap[userMap[userId].gameId];
            io.sockets.connected[game.player1Id].emit('receive_message', 'Kicking unwanted spectators');
            io.sockets.connected[game.player2Id].emit('receive_message', 'Kicking unwanted spectators');
            for (let i = 0; i < game.spies.length; i++){
                if (game.spies[i] in userMap) {
                    io.sockets.connected[game.spies[i]].emit('receive_message', 'You have been kicked!');
                    io.sockets.connected[game.spies[i]].emit('setup_lobby');
                    nameArray.push(userMap[game.spies[i]].name);
                    idArray.push(game.spies[i]);
                }
            }
            game.spies = [];
            updateLobby();
        }
    });
    
});

const updateLobby = () => {
    let board = makeBoard();
    for (let i = 0; i < idArray.length; i++){
        io.sockets.connected[idArray[i]].emit('updateLobby', [nameArray, idArray, board]);
    }
};

const removeFromLobby = id => {
    let key = idArray.indexOf(id);
    idArray.splice(key, 1);
    nameArray.splice(key, 1);
};

const deck = () => {
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
};

const card = (value, suit) =>  [value, suit];

const shuffle = a => {
    for (let i = a.length; i; i--) {
        let j = Math.floor(Math.random() * i);
        [a[i - 1], a[j]] = [a[j], a[i - 1]];
    }
};

const deal = gameId => {
    let game = gameMap[gameId];
    
    if (game.round === 0) {
        endGame(gameId)
    } else {
        
        let extraInfo = '';
        if (game.round === 1 && game.plusMinus === 1) extraInfo = `gameId: ${gameId}`;
        if (game.plusMinus === -1) extraInfo = '( - )';
        sendLog(gameId, `<span style="text-decoration: overline underline;">Dealing new hand for round ${game.round}. ${extraInfo}</span>`);
        extraInfo = ``;
        if (isEven(game.round)) {
            game[game.player1Id].turn = true;
            game[game.player2Id].turn = false;
        } else {
            game[game.player1Id].turn = false;
            game[game.player2Id].turn = true;
        }
        game.gameDeck = deck();
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
        game.inPlay = card(20, 20);
        game.trump = gameMap[gameId].gameDeck.pop();
        for (let i = 0; i < game.round; i++) {
            game[game.player1Id].hand.push(game.gameDeck.pop());
            game[game.player2Id].hand.push(game.gameDeck.pop());
        }
        game[game.player1Id].hand = sortHand(game[game.player1Id].hand);
        game[game.player2Id].hand = sortHand(game[game.player2Id].hand);
        
        io.sockets.connected[game.player1Id].emit('shuffle');
        io.sockets.connected[game.player2Id].emit('shuffle');
        sendLog(gameId, `The trump is ${game.trump[1]}.`);
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
    
    for (let i = 0; i < game.spies.length; i++){
        if (game.spies[i] in userMap) {
            io.sockets.connected[game.spies[i]].emit('spy_setup', [player1info, player2info]);
        }
    }
    
};

const sendInfo = id => {
    let game = gameMap[id];
    
    if(endRoundNow(game)){
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
        
        for (let i = 0; i < game.spies.length; i++){
            if (game.spies[i] in userMap) {
                io.sockets.connected[game.spies[i]].emit('spy_setup', [player1info, player2info]);
            }
        }
    }
};

const isTrick = data => {

    const CARD = 0;
    const GAME_ID = 1;
    const SUIT = 1;
    const VALUE = 0;
    
    let game = gameMap[data[GAME_ID]];
    //one card is joker, return (played>inPlay)
    if (!(data[CARD][SUIT] === 'joker' && game.inPlay[SUIT] === 'joker')) {
        if (data[CARD][SUIT] === 'joker' || game.inPlay[SUIT] === 'joker') return (data[CARD][0] > game.inPlay[CARD]);
    }
    //if trump is played on to non-trump, return true
    if (data[CARD][SUIT] === game.trump[SUIT] && game.inPlay[SUIT] !== game.trump[SUIT])  return true;
    //both are joker, return false
    if (data[CARD][SUIT] === 'joker' && game.inPlay[SUIT] === 'joker') return false;
    // if same suits, return (played>inPlay)
    if (data[CARD][SUIT] === game.inPlay[SUIT]) return (data[CARD][VALUE] > game.inPlay[VALUE]);
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
    for (let i = 0; i < gameMap[gameId].spies.length; i++){
        if (gameMap[gameId].spies[i] in userMap) {
            io.sockets.connected[gameMap[gameId].spies[i]].emit('receive_log', msg);
        }
    }
};

const endGame = gameId => {
  let game = gameMap[gameId];
  let player1 = game.player1Id;
  let player2 = game.player2Id;
  let gameText = `Game ${game[player1].name} vs ${game[player2].name} over: `;
  if (game[player1].score > game[player2].score) {
      io.sockets.emit('receive_message', `${gameText}${game[player1].name} won, ${game[player1].score} to ${game[player2].score}`);
  } else if (game[player1].score < game[player2].score) {
      io.sockets.emit('receive_message', `${gameText}${game[player2].name} won, ${game[player1].score} to ${game[player2].score}`);
  } else {
      io.sockets.emit('receive_message', `${gameText}Tie game, ${game[player1].score} to ${game[player2].score}`);
  }
  io.sockets.connected[player1].emit('setup_lobby');
  io.sockets.connected[player2].emit('setup_lobby');
  idArray.push(player1);
  idArray.push(player2);
  nameArray.push(game[player1].name);
  nameArray.push(game[player2].name);
  finishedGameIdArray.push(gameId);
  userMap[player1].gameId = 'none';
  userMap[player2].gameId = 'none';
  updateLobby();
};

const makeBoard = () => {
    let board = {};
    for (let i = 0; i < finishedGameIdArray.length; i++){
        let game = gameMap[finishedGameIdArray[i]];
        let tie = false;
        let player1win;
        let player1 = game.player1Id;
        let player2 = game.player2Id;
        if (!(game[player1].name in board)) board[game[player1].name] = [];
        if (!(game[player2].name in board)) board[game[player2].name] = [];
        if (game[player1].score > game[player2].score) { player1win = true; }
        else if (game[player1].score < game[player2].score) { player1win = false; }
        else {tie = true}
        if (!tie) {
            if (player1win){
                board[game[player1].name].push('win');
                board[game[player2].name].push('lose');
            } else {
                board[game[player1].name].push('lose');
                board[game[player2].name].push('win');
            }
        } else {
            board[game[player1].name].push('tie');
            board[game[player2].name].push('tie');
        }
    }
    return board;
};

const sortHand = unSortedHand => {
    let sortedHand = [];
    let suitArray = ['diamonds','clubs','hearts','spades','joker'];
    for (let s = 0; s < suitArray.length; s++){
        for (let i = 0; i < unSortedHand.length; i++){
            if (unSortedHand[i][1] === suitArray[s]) sortedHand.push(unSortedHand[i]);
        }
    }
    return sortedHand;
};

const endRoundNow = game => {
    if (game[game.player1Id].hand.length === 0 && game[game.player2Id].hand.length === 0) return true;
    let player1 = game[game.player1Id];
    let player2 = game[game.player2Id];
    let player1CantWin = false;
    let player2CantWin = false;
    if (player1.tricks > player1.goal || player1.tricks + player1.hand.length < player1.goal) player1CantWin = true;
    if (player2.tricks > player2.goal || player2.tricks + player2.hand.length < player2.goal) player2CantWin = true;
    if (player1CantWin && player2CantWin) {
        io.sockets.connected[game.player1Id].emit('receive_message', `No one could win so the round has ended.`);
        io.sockets.connected[game.player2Id].emit('receive_message', `No one could win so the round has ended.`);
    }
    return false;
    
};

const finishedGameMap = () => {
    let map = {};
    for (let i = 0; i < finishedGameIdArray.length; i++){
        map[finishedGameIdArray[i]] = gameMap[finishedGameIdArray[i]];
    }
    return map;
};







