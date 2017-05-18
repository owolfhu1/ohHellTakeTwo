/**
 * Created by Orion Wolf_Hubbard on 4/10/2017.
 */

let app = require('express')();
let http = require('http').Server(app);
let io = require('socket.io')(http);
let port = process.env.PORT || 3000;
let pg = require('pg');
pg.defaults.ssl = true;
let client = new pg.Client(process.env.DATABASE_URL);
client.connect();

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

http.listen(port,() => { console.log('listening on *:' + port); });

const userMap = {}; //holds online user information {userId: {name: ____ , gameId: ____ } }
let gameMap = {}; //holds all games {gameId : game object}
let namesPlaying = {}; //map of player names:gameID in active game, used to check if player is in an unfinished game on login
let onlineNameArray = []; //array of active users, used to prevent double login
let passwordMap = {};
const SUIT = 1;
const VALUE = 0;
let lobby = {
    names : [],
    ids : []
};
let userScores = {};

client.query('SELECT * FROM userbank;').on('row', row => {
    userScores[row.username] = new stats(row.wins, row.losses, row.ties);
});
client.query('SELECT * FROM gameMap;').on('row', row => {
    if (row.thiskey === 'KEY') gameMap = row.gamemap;
});
client.query('SELECT * FROM namesPlaying;').on('row', row => {
    if (row.thiskey === 'KEY') namesPlaying = row.namesplaying;
});

//creates empty game object, is put into gameMap with key gameId, can be accessed from userMap[userId].gameId
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

//creates an empty player object which is put into a game object with key being the user's socket.id
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
//holds user's stats
let stats = function (w,l,t) {
    this.wins = w;
    this.losses = l;
    this.ties = t;
    this.stat;
    if (w + l !== 0){
        this.stat = (w-l)/(w+l);
    } else {
        this.stat = 0;
    }
};

//all information from client is received in this function
io.on('connection', socket => {
    
    //for testing
    socket.on('crash', () => { Program.restart() });
    
    let userId = socket.id;
    userMap[userId] = { name: 'no input', gameId: 'none' };
    let user = userMap[userId];
    //gets client ready for login
    io.to(userId).emit('setup_lobby');
    io.to(userId).emit('setup_login');
    
    io.sockets.emit('receive_message', 'A guest has joined the server.');
    
    client.query('SELECT * FROM userbank;').on('row', function(row) {
        passwordMap[row.username] = row.password;
    });
    
    /*  on login request, first check if (userName is in passwordMap and user is not online)
        if so, checks if is correct userName/password combo and logs in if correct
        if first check fails userName and password are added to passwordMap and user is logged in */
    socket.on('login_request', login => {
        const USER_NAME = 0;
        const PASSWORD = 1;
    
        console.log(JSON.stringify(passwordMap));
        
        if (login[USER_NAME] in passwordMap && !onlineNameArray.includes(login[USER_NAME])) {
            if (passwordMap[login[USER_NAME]] === login[PASSWORD]){
                onlineNameArray.push(login[USER_NAME]);
                user.name = login[USER_NAME];
                io.sockets.emit('receive_message', user.name + ' has logged in.');
                
                //if user is in a game, put them in game, otherwise put them in lobby
                if (user.name in namesPlaying){
                    let gameId = namesPlaying[user.name];
                    let game = gameMap[gameId];
                    let player1 = game[game.player1Id];
                    let player2 = game[game.player2Id];
                    userMap[userId].gameId = gameId;
                    if (player1.name === user.name){
                        delete game[player2.opponentId];
                        game[player1.opponentId].opponentId = userId;
                        game[userId] = player1;
                        game.player1Id = userId;
                    } else{
                        delete game[player1.opponentId];
                        game[player2.opponentId].opponentId = userId;
                        game[userId] = player2;
                        game.player2Id = userId;
                    }
                    io.to(userId).emit('set_user_name', user.name);
                    io.to(userId).emit('setup_game');
                    if (player1.picked && player2.picked) sendInfo(gameId); else sendPick(gameId);
                } else {
                    lobby.names.push(user.name);
                    lobby.ids.push(userId);
                    io.to(userId).emit('setup_lobby');
                    io.to(userId).emit('set_user_name', user.name);
                    updateLobby();
                }
                
            } else { //when username exists but wrong password is entered
                io.to(userId).emit('receive_message', 'user name taken / incorrect password. please try again.');
            }
        } else {
            if (!onlineNameArray.includes(login[USER_NAME])) {
                client.query(`INSERT INTO userbank values('${login[USER_NAME]}','${login[PASSWORD]}',0,0,0)`);
                userScores[login[USER_NAME]] = new stats(0,0,0);
                onlineNameArray.push(login[USER_NAME]);
                user.name = login[USER_NAME];
                lobby.names.push(user.name);
                lobby.ids.push(userId);
                io.sockets.emit('receive_message', 'new user ' + user.name + ' has logged in.');
                io.to(userId).emit('setup_lobby');
                io.to(userId).emit('set_user_name', user.name);
                updateLobby();
            }
        }
    });
    
    /*  on disconnect user is removed from userMap, a message is sent to all users informing them that
        user has logged out, if user is in lobby they are removed from nameArray and idArray. */
    socket.on('disconnect', () => {
        let name = userMap[userId].name;
        for (let i = onlineNameArray.length-1; i >= 0; i--) { if (onlineNameArray[i] === name) onlineNameArray.splice(i, 1); }
        if (lobby.ids.indexOf(userId) > -1){
            removeFromLobby(userId);
            updateLobby();
        }
        io.sockets.emit('receive_message', userMap[userId].name + ' has left the server');
        delete userMap[userId];
    });

    //sends receives chat messages and sends them to all users.
    socket.on('message', msg => {
        io.sockets.emit('receive_message', msg);
    });

    //when client tries to pair with another user this sends request to that user
    socket.on('pair_request', user => { io.to(user).emit('rePair', [user, socket.id, userMap[userId].name]); });

    //if user accepts 'pair_request' the 2 users are removed from lobby and put into a game object.
    socket.on('finalPair', userIds => {
        // 0 = player1, 1 = player2
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
        namesPlaying[game[userIds[0]].name] = gameId;
        namesPlaying[game[userIds[1]].name] = gameId;
        client.query(`UPDATE namesPlaying SET namesPlaying = '${JSON.stringify(namesPlaying)}' WHERE thiskey = 'KEY';`);
        io.to(userIds[0]).emit('setup_game');
        io.to(userIds[1]).emit('setup_game');
        deal(gameId);
    });

    //revices information when player picks goal.
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
    
            client.query(`UPDATE gameMap SET gameMap = '${JSON.stringify(gameMap)}' WHERE thiskey = 'KEY';`);
            
            if (game[player].picked && game[opponent].picked) sendInfo(gameId); else sendPick(gameId);
        }
    });
    
    /*  plays card at index i of player's hand. first checks if card is ace and changes value according to game.aceValue
        then writes the card to player's logs. then checks if there is a card in play, if not, plays card and flips turn booleans.
        if not, plays card and checks if card is a trick, if is trick turn booleans are kept and player can go again,
        else booleans are flipped. results are sent to player's logs. */
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
        /**/ if (value ===  1 ) value = 'low Ace';
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
        } else sendLog(gameId, `${game[player].name} plays ${value} of ${game[player].hand[i][SUIT]}`);
        
        if (game.inPlay[SUIT] === 20) {
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
        
        client.query(`UPDATE gameMap SET gameMap = '${JSON.stringify(gameMap)}' WHERE thiskey = 'KEY';`);
    
        sendInfo(gameId);
    });
    
    
    /*  aces low/high sockets flips the game.aceValue (1 or 16) when
        client presses aces button and sends high/low ace command back to clients. */
    socket.on('aces_low', () => {
        let gameId = userMap[socket.id].gameId;
        let game = gameMap[gameId];
        game.aceValue = 1;
        if (game.player1Id in userMap) io.to(game.player1Id).emit('lowAce');
        if (game.player2Id in userMap) io.to(game.player2Id).emit('lowAce');
    });
    socket.on('aces_high', () => {
        let gameId = userMap[socket.id].gameId;
        let game = gameMap[gameId];
        game.aceValue = 16;
        if (game.player1Id in userMap) io.to(game.player1Id).emit('highAce');
        if (game.player2Id in userMap) io.to(game.player2Id).emit('highAce');
    });
    
    //if user types '$resign' user is resigned and opponent wins, both are placed in lobby
    socket.on('resign', () => {
        if (userMap[userId].gameId !== 'none') {
            let gameId = userMap[userId].gameId;
            let game = gameMap[gameId];
            let opponentId = game[userId].opponentId;
            lobby.names.push(userMap[userId].name);
            lobby.ids.push(userId);
            if (opponentId in userMap) {
                lobby.names.push(userMap[opponentId].name);
                lobby.ids.push(opponentId);
            }
            io.to(userId).emit('setup_lobby');
            if(opponentId in userMap) {
                io.to(opponentId).emit('setup_lobby');
            }
            delete namesPlaying[game[userId].name];
            delete namesPlaying[game[opponentId].name];
            client.query(`UPDATE namesPlaying SET namesPlaying = '${JSON.stringify(namesPlaying)}' WHERE thiskey = 'KEY';`);
            client.query(`UPDATE gameMap SET gameMap = '${JSON.stringify(gameMap)}' WHERE thiskey = 'KEY';`);
            io.sockets.emit('receive_message', `OH NO! ${game[userId].name} resigned, ${game[opponentId].name} has won by default.`);
            if (opponentId in userMap) userMap[opponentId].gameId = 'none';
            userMap[userId].gameId = 'none';
            client.query(`UPDATE userbank SET wins = wins + 1 WHERE username = '${userMap[opponentId].name}';`);
            
            userScores[userMap[opponentId].name] = new stats(
                userScores[userMap[opponentId].name].wins + 1,
                userScores[userMap[opponentId].name].losses,
                userScores[userMap[opponentId].name].ties
            );
            
            client.query(`UPDATE userbank SET losses = losses + 1 WHERE username = '${userMap[userId].name}';`);
            
            userScores[userMap[userId].name] = new stats(
                userScores[userMap[userId].name].wins,
                userScores[userMap[userId].name].losses + 1,
                userScores[userMap[userId].name].ties
            );
            
            delete gameMap[gameId];
            client.query(`UPDATE gameMap SET gameMap = '${JSON.stringify(gameMap)}' WHERE thiskey = 'KEY';`);
            updateLobby();
        }
    });
    
    //if user types '$buzz' plays a sound to alert opponent.
    socket.on('buzz', () => {
        if (userMap[userId].gameId !== 'none') {
            io.to(gameMap[userMap[userId].gameId][userId].opponentId).emit('buzzed');
            io.to(userId).emit('buzzed');
        }
    });
    
    //if user types '$board' prints raw leaderboard to client's console.
    socket.on('leaderboard', () => io.to(userId).emit('leaderboard', makeBoard()));
    
    //if user types '$watch' followed by gameId, puts user in spectator mode for that game. Players are warned they are being watched.
    socket.on('watch_game', gameId => {
       if (gameId in gameMap){
           let game = gameMap[gameId];
           if (!game.locked) {
               removeFromLobby(userId);
               updateLobby();
               game.spies.push(userId);
               io.to(userId).emit('setup_game');
               io.to(game.player1Id).emit('receive_message', `WARNING!! ${userMap[userId].name} is watching your game type '$kick' to kick them`);
               io.to(game.player2Id).emit('receive_message', `WARNING!! ${userMap[userId].name} is watching your game type '$kick' to kick them`);
               if (game[game.player1Id].picked && game[game.player2Id].picked) sendInfo(gameId); else sendPick(gameId);
           }
       }
    });
    
    //if user types '$lock', game is locked to spectators.
    socket.on('lock', () => {
        if (userMap[userId].gameId !== 'none') {
            let game = gameMap[userMap[userId].gameId];
            game.locked = true;
            io.to(game.player1Id).emit('receive_message', 'The game has been locked');
            io.to(game.player2Id).emit('receive_message', 'The game has been locked');
        }
    });
    
    //if user types '$unlock', game is unlocked to spectators.
    socket.on('unlock', () => {
        if (userMap[userId].gameId !== 'none') {
            let game = gameMap[userMap[userId].gameId];
            game.locked = false;
            io.to(game.player1Id).emit('receive_message', 'The game has been unlocked');
            io.to(game.player2Id).emit('receive_message', 'The game has been unlocked');
        }
    });
    
    //if user types '$kick', kicks spectators from game.
    socket.on('kick', () => {
        if (userMap[userId].gameId !== 'none') {
            let game = gameMap[userMap[userId].gameId];
            io.to(game.player1Id).emit('receive_message', 'Kicking unwanted spectators');
            io.to(game.player2Id).emit('receive_message', 'Kicking unwanted spectators');
            for (let i = 0; i < game.spies.length; i++){
                if (game.spies[i] in userMap) {
                    io.to(game.spies[i]).emit('receive_message', 'You have been kicked!');
                    lobby.names.push(userMap[game.spies[i]].name);
                    lobby.ids.push(game.spies[i]);
                    io.to(game.spies[i]).emit('setup_lobby');
                }
            }
            game.spies = [];
            client.query(`UPDATE gameMap SET gameMap = '${JSON.stringify(gameMap)}' WHERE thiskey = 'KEY';`);
            updateLobby();
        }
    });
    
    //if user types '$whisper' following text is sent as private message to opponent. (generally chat is global)
    socket.on('whisper', msg => {
        if(userMap[userId].gameId !== 'none') {
            let game = gameMap[userMap[userId].gameId];
            io.to(game.player1Id).emit('receive_message', `${userMap[userId].name}(whisper): ${msg}`);
            io.to(game.player2Id).emit('receive_message', `${userMap[userId].name}(whisper): ${msg}`);
        }
    });
    
});

//sends data to client to build lobby with.
const updateLobby = () => {
    let board = makeBoard();
    for (let i = 0; i < lobby.ids.length; i++){
        io.to(lobby.ids[i]).emit('updateLobby', [lobby.names, lobby.ids, board]);
    }
};

//removes user from lobby array's (idArray and nameArray)
const removeFromLobby = id => {
    
    
    
    let key = lobby.ids.indexOf(id);
    lobby.ids.splice(key, 1);
    lobby.names.splice(key, 1);
    
    
    
};

//builds a deck of cards and shuffles it
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

//resets game variables, deals (game.round) number of cards, exposes trump and prints to player's logs. if round is 0, ends game.
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
        io.to(game.player1Id).emit('shuffle');
        io.to(game.player2Id).emit('shuffle');
        //game.gameDeck = 'game deck deleted to save space';
        delete game.gameDeck;
        sendLog(gameId, `The trump is ${game.trump[1]}.`);
        sendPick(gameId);
    }
};

//used in deal() to set turn booleans, player 1 first on even rounds, player 2 on odd
const isEven = n => n % 2 === 0;

//sends information to players to build goal picker
const sendPick = id => {
    let game = gameMap[id];
    let player1Stats = [game[game.player1Id].score, game[game.player1Id].goal, game[game.player1Id].tricks];
    let player2Stats = [game[game.player2Id].score, game[game.player2Id].goal, game[game.player2Id].tricks];
    // [[hand], [opponents hand length], [trump], [inPlay], [?¿turn?¿], [your stats], [opponent stats], [opponent's name]]
    let player1info = [game[game.player1Id].hand, game[game.player2Id].hand.length, game.trump, game.inPlay, game[game.player1Id].turn, player1Stats, player2Stats, game[game.player2Id].name];
    let player2info = [game[game.player2Id].hand, game[game.player1Id].hand.length, game.trump, game.inPlay, game[game.player2Id].turn, player2Stats, player1Stats, game[game.player1Id].name];
    if (game.player1Id in userMap) {
        io.to(game.player1Id).emit('picker', player1info);
    }
    if (game.player2Id in userMap) {
        io.to(game.player2Id).emit('picker', player2info);
    }
    for (let i = 0; i < game.spies.length; i++){
        if (game.spies[i] in userMap) {
            io.to(game.spies[i]).emit('spy_setup', [player1info, player2info]);
        }
    }
};

//sends information to players to build game (shows cards, turns event listeners on for cards if players turn)
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
        if (game.player1Id in userMap) {
            io.to(game.player1Id).emit('info', player1info);
        }
        if (game.player2Id in userMap) {
            io.to(game.player2Id).emit('info', player2info);
        }
        for (let i = 0; i < game.spies.length; i++){
            if (game.spies[i] in userMap) {
                io.to(game.spies[i]).emit('spy_setup', [player1info, player2info]);
            }
        }
    }
};

//checks if play is trick, is fed data[card, gameId] returns boolean.
const isTrick = data => {
    const CARD = 0;
    const GAME_ID = 1;
   
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

//counts jokers player has won in a round (if goal correct, 5 points awarded per joker)
const jokerCount = hand => {
    let count = 0;
    for (let i = 0; i < hand.length; i++){
        if (hand[i][1] === 'joker') count++;
    }
    return count;
};

//is called by send info to end game when players are out of cards or can no longer win. calculates scores and prints to player's logs.
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

//used in various functions to send log information to player's logs.
const sendLog = (gameId, msg) => {
    if (gameMap[gameId].player1Id in userMap) {
        io.to(gameMap[gameId].player1Id).emit('receive_log', msg);
    }
    if (gameMap[gameId].player2Id in userMap) {
        io.to(gameMap[gameId].player2Id).emit('receive_log', msg);
    }
    for (let i = 0; i < gameMap[gameId].spies.length; i++){
        if (gameMap[gameId].spies[i] in userMap) {
            io.to(gameMap[gameId].spies[i]).emit('receive_log', msg);
        }
    }
};

//called by deal() to end game when round === 0, calculates winner/tie, prints results to player's chats and puts players in lobby.
const endGame = gameId => {
  let game = gameMap[gameId];
  let player1 = game.player1Id;
  let player2 = game.player2Id;
  let gameText = `Game ${game[player1].name} vs ${game[player2].name} over: `;
  if (game[player1].score > game[player2].score) {
      io.sockets.emit('receive_message', `${gameText}${game[player1].name} won, ${game[player1].score} to ${game[player2].score}`);
      client.query(`UPDATE userbank SET wins = wins + 1 WHERE username = '${userMap[player1].name}';`);
      client.query(`UPDATE userbank SET losses = losses + 1 WHERE username = '${userMap[player2].name}';`);
      
      userScores[userMap[player1].name] = new stats (
          userScores[userMap[player1].name].wins + 1,
          userScores[userMap[player1].name].losses,
          userScores[userMap[player1].name].ties
      );
      userScores[userMap[player2].name] = new stats (
          userScores[userMap[player2].name].wins,
          userScores[userMap[player2].name].losses + 1,
          userScores[userMap[player2].name].ties
      );
      
  } else if (game[player1].score < game[player2].score) {
      io.sockets.emit('receive_message', `${gameText}${game[player2].name} won, ${game[player1].score} to ${game[player2].score}`);
      client.query(`UPDATE userbank SET losses = losses + 1 WHERE username = '${userMap[player1].name}';`);
      client.query(`UPDATE userbank SET wins = wins + 1 WHERE username = '${userMap[player2].name}';`);
    
      userScores[userMap[player1].name] = new stats (
          userScores[userMap[player1].name].wins,
          userScores[userMap[player1].name].losses + 1,
          userScores[userMap[player1].name].ties
      );
      userScores[userMap[player2].name] = new stats (
          userScores[userMap[player2].name].wins + 1,
          userScores[userMap[player2].name].losses,
          userScores[userMap[player2].name].ties
      );
      
  } else {
      io.sockets.emit('receive_message', `${gameText}Tie game, ${game[player1].score} to ${game[player2].score}`);
      client.query(`UPDATE userbank SET ties = ties + 1 WHERE username = '${userMap[player1].name}';`);
      client.query(`UPDATE userbank SET ties = ties + 1 WHERE username = '${userMap[player2].name}';`);
    
      userScores[userMap[player1].name] = new stats (
          userScores[userMap[player1].name].wins,
          userScores[userMap[player1].name].losses,
          userScores[userMap[player1].name].ties + 1
      );
      userScores[userMap[player2].name] = new stats (
          userScores[userMap[player2].name].wins,
          userScores[userMap[player2].name].losses,
          userScores[userMap[player2].name].ties + 1
      );
      
  }
  if (player1 in userMap) {
      io.to(player1).emit('setup_lobby');
  }
  if (player2 in userMap) {
      io.to(player2).emit('setup_lobby');
  }
  lobby.ids.push(player1);
  lobby.ids.push(player2);
  lobby.names.push(game[player1].name);
  lobby.names.push(game[player2].name);
  delete namesPlaying[game[player1].name];
  delete namesPlaying[game[player1].name];
  client.query(`UPDATE namesPlaying SET namesPlaying = '${JSON.stringify(namesPlaying)}' WHERE thiskey = 'KEY';`);
  userMap[player1].gameId = 'none';
  userMap[player2].gameId = 'none';
  delete gameMap[gameId];
  client.query(`UPDATE gameMap SET gameMap = '${JSON.stringify(gameMap)}' WHERE thiskey = 'KEY';`);
  updateLobby();
};
//let sorted = Object.keys(obj).map(key => obj[key]).sort((a, b) => a.number - b.number);
//TODO: make this work!
let makeBoard = () => {
    let order = Object.keys(userScores).map(key => userScores[key]).sort((a, b) => a.stat - b.stat);
    let board = '';
    for (let i = 0; i< order.length; i++){
        let total =userScores[order[i]].wins + userScores[order[i]].losses + userScores[order[i]].ties;
        board += '<p><u>' + order[i] + '</u></p><p style="font-size: 14px">stat: ' + userScores[order[i]].stat + ' games: ' + total + '</p>';
    }
    return board;
};

//sorts hand by suit.
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

//calculates if neither player can score.
const endRoundNow = game => {
    if (game[game.player1Id].hand.length === 0 && game[game.player2Id].hand.length === 0) return true;
    let player1 = game[game.player1Id];
    let player2 = game[game.player2Id];
    let player1CantWin = false;
    let player2CantWin = false;
    
    let tricksLeft = player1.hand.length;
    if (player2.hand.length > tricksLeft) { tricksLeft = player2.hand.length; }
    
    if (player1.tricks > player1.goal || player1.tricks + tricksLeft < player1.goal) player1CantWin = true;
    if (player2.tricks > player2.goal || player2.tricks + tricksLeft < player2.goal) player2CantWin = true;
    if (player1CantWin && player2CantWin) {
        sendLog(userMap[game.player1Id].gameId, `No one could win so the round has ended.`);
        return true;
    }
    return false;
};
