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
let passwordMap = {};// {userName : password} loads from DB each time a user connects
let lobby = { names : [], ids : [] }; //holds info on users from lobby
let userScores = {};
const SUIT = 1, VALUE = 0, CARD = 0, GAME_ID = 1, USER_NAME = 0, PASSWORD = 1, ELO_K_VALUE = 50;

client.query('SELECT * FROM userbank;').on('row', row => {
    userScores[row.username] = new stats(row.rating, row.total);
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
    this.actualRound = 1;
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

//new user
let stat = function () {
    this.rating = 1500;
    this.total = 0;
};

//old user with pre existing stats
let stats = function (rating, total){
    this.rating = rating;
    this.total = total;
};

//all information from client is received in this function
io.on('connection', socket => {
    
    
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
                    
                    //set up DOM client side
                    io.to(userId).emit('set_user_name', user.name);
                    io.to(userId).emit('setup_game');
                    io.to(userId).emit('ace_style', game.aces);
                    io.to(userId).emit('set_agreement', game.agreement);
                    io.to(userId).emit('set_follow_suit', game.follow_suit);
                    io.to(userId).emit('set_pick_opponents_goal', game.pick_opponents_goal);
                    if(game.aces === 'both') {
                        if (game.aceValue === 16) io.to(userId).emit('set_ace_button', 'Aces high');
                        else if (game.aceValue === 1) io.to(userId).emit('set_ace_button', 'Aces low');
                    }
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
                
                
                client.query(`INSERT INTO userbank values('${login[USER_NAME]}','${login[PASSWORD]}',1500 ,0)`);
                userScores[login[USER_NAME]] = new stat();
                
                
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

    //sends info for client for displaying tricks to users.
    socket.on('tricks', () => {
        if (userMap[userId].gameId !== 'none'){
            if (userMap[userId].gameId !== 'none'){
                let game = gameMap[userMap[userId].gameId];
                let player1 = game.player1Id;
                let player2 = game.player2Id;
                io.to(userId).emit('tricks', [game[player1].name, game[player2].name, game[player1].tricksWon, game[player2].tricksWon]);
            }
        }
    });
    
    //sends receives chat messages and sends them to all users.
    socket.on('message', msg => {
        io.sockets.emit('receive_message', msg);
    });

    //when client tries to pair with another user this sends request to that user
    socket.on('pair_request', user => {
        io.to(userId).emit('receive_message', 'Request sent.');
        io.to(user[0]).emit('rePair', [user, socket.id, userMap[userId].name]);
    });

    //if user accepts 'pair_request' the 2 users are removed from lobby and put into a game object.
    socket.on('finalPair', userIds => {
        let user1Id = userIds[0][0];
        let user2Id = userIds[1];
        removeFromLobby(user1Id);
        removeFromLobby(user2Id);
        updateLobby();
        
        //create new game
        let game = new emptyGame();
        
        //generate random gameId and assign it to players
        let gameId = Math.random().toString(36).substr(2, 5);
        userMap[user1Id].gameId = gameId;
        userMap[user2Id].gameId = gameId;
        
        //make new players and add them to the new game
        game[user1Id] = new blankPlayer();
        game[user2Id] = new blankPlayer();
        game.player1Id = user1Id;
        game.player2Id = user2Id;
        game[user1Id].opponentId = user2Id;
        game[user2Id].opponentId = user1Id;
        game[user1Id].name = userMap[user1Id].name;
        game[user2Id].name = userMap[user2Id].name;
        
        //put the game in the gameMap
        gameMap[gameId] = game;
        
        //put the players in namesPlaying in case they reconnect at some point during the game and need to be put back into the game
        namesPlaying[game[user1Id].name] = gameId;
        namesPlaying[game[user2Id].name] = gameId;
        client.query(`UPDATE namesPlaying SET namesPlaying = '${JSON.stringify(namesPlaying)}' WHERE thiskey = 'KEY';`);
        
        //emit command to set up player's clients DOM for a game
        io.to(user1Id).emit('setup_game');
        io.to(user2Id).emit('setup_game');
        
        //if users choose to play a randomized game, generate random game rules
        if (userIds[0][1] === 'randomize') {
            randomize(gameId);
        } else {
            //else get the game rules from the invite form
            game.aces = userIds[0][1];
            game.jokers = userIds[0][2];
            game.joker_value = Number(userIds[0][3]);
            game.agreement = userIds[0][4];
            game.follow_suit = userIds[0][5];
            game.lose_points = userIds[0][6];
            game.lose_number = Number(userIds[0][7]);
            game.leader_only = userIds[0][8];
            game.loop = userIds[0][9];
            game.progression = userIds[0][10];
            game.start = Number(userIds[0][11]);
            game.finish = Number(userIds[0][12]);
            game.goal_only = userIds[0][13];
            game.pick_opponents_goal = userIds[0][14];
            game.dealer_picks_trump = userIds[0][15];
        }
        
        //start the game at the new game rules start point
        game.round = game.start;
        
        //set plusMinus according to progression value
        if(game.progression === 'high to low'){
            game.plusMinus = -1;
        }
        else if(game.progression === 'constant'){
            game.plusMinus = 0;
        }
        
        //set ace_style client side
        if (game.aces === 'high') game.aceValue = 16;
        io.to(user1Id).emit('ace_style', game.aces);
        io.to(user2Id).emit('ace_style', game.aces);
    
        //set agreement boolean client side
        io.to(user1Id).emit('set_agreement', game.agreement);
        io.to(user2Id).emit('set_agreement', game.agreement);
    
        //set follow_suit boolean client side
        io.to(user1Id).emit('set_follow_suit', game.follow_suit);
        io.to(user2Id).emit('set_follow_suit', game.follow_suit);
    
        //set pick_opponents_goal boolean client side
        io.to(user1Id).emit('set_pick_opponents_goal', game.pick_opponents_goal);
        io.to(user2Id).emit('set_pick_opponents_goal', game.pick_opponents_goal);
        
        //start a new log for both players
        io.to(user1Id).emit('clear_log');
        io.to(user2Id).emit('clear_log');
        
        //sends the game rules to the players new logs
        logGameRules(gameId);
        
        //start the game!
        deal(gameId);
    });

    //sends decline message when an invite is declined.
    socket.on('decline', id => { io.to(id).emit('receive_message', 'Your invitation has been declined.'); });
    
    //gets trump pick from player
    socket.on('pick_trump', trump => {
        let gameId = userMap[socket.id].gameId;
        let game = gameMap[gameId];
        let player = socket.id;
        let opponent = game[player].opponentId;
        
        //assigns trump to game.trump
        game.trump = ['player', trump];
        
        //switches turns
        game[player].turn = false;
        game[opponent].turn = true;
        
        sendLog(gameId, `The trump is ${game.trump[1]}.`);
        sendPick(gameId);
    });
    
    //gets information when player picks goal.
    socket.on('pick', pick => {
        let gameId = userMap[socket.id].gameId;
        let game = gameMap[gameId];
        let player = socket.id;
        let opponent = game[player].opponentId;
        
        //if game.pick_opponents_goal is off, pick will be assigned to player, else assigned to opponent
        if (game.pick_opponents_goal === 'off') {
            if (game.round - game[opponent].goal !== pick || game.agreement === 'on') {
                sendLog(gameId, `${game[player].name}'s goal is ${pick}`);
                game[player].goal = pick;
                game[player].turn = false;
                game[opponent].turn = true;
                game[player].picked = true;
                gameMap[gameId] = game;
                client.query(`UPDATE gameMap SET gameMap = '${JSON.stringify(gameMap)}' WHERE thiskey = 'KEY';`);
                if (game[player].picked && game[opponent].picked) sendInfo(gameId); else sendPick(gameId);
            }
        } else if (game.pick_opponents_goal === 'on'){
            if (game.round - game[player].goal !== pick || game.agreement === 'on') {
                sendLog(gameId, `${game[opponent].name}'s goal is ${pick}`);
                game[opponent].goal = pick;
                game[player].turn = false;
                game[opponent].turn = true;
                game[player].picked = true;
                gameMap[gameId] = game;
                client.query(`UPDATE gameMap SET gameMap = '${JSON.stringify(gameMap)}' WHERE thiskey = 'KEY';`);
                if (game[player].picked && game[opponent].picked) sendInfo(gameId); else sendPick(gameId);
            }
        }
    });
    
    //  plays card at index i of player's hand.
    socket.on('play_card', i => {
        let gameId = userMap[socket.id].gameId;
        let game = gameMap[gameId];
        let player = socket.id;
        let opponent = game[player].opponentId;
        
        //if the card is an ace, change the value to the game.aceValue variable
        if (game[player].hand[i][0] === 1) {
            let holderSuit = game[player].hand[i][1];
            game[player].hand[i] = card(game.aceValue, holderSuit);
        }
        let value = game[player].hand[i][0];
        
        //for sending log, distinguishes between 'plays a joker' and 'plays a $value of $suit'
        if (value === 12 || value === 11){
            sendLog(gameId, `${game[player].name} plays a Joker`);
        } else sendLog(gameId, `${game[player].name} plays ${cardValue(value)} of ${game[player].hand[i][SUIT]}`);
        
        //if there is no card in play, play the card
        if (game.inPlay[SUIT] === 20) {
            game.inPlay = game[player].hand[i];
            game[player].turn = false;
            game[opponent].turn = true;
        } else {
            //else give the trick to the right player
            if (isTrick([game[player].hand[i], gameId])) givePlayerTrick(gameId, player, opponent, game.inPlay, game[player].hand[i]);
            else givePlayerTrick(gameId, opponent, player, game.inPlay, game[player].hand[i]);
            
            //remove card from inPlay
            game.inPlay = card(20, 20);
        }
        //remove card from players hand
        game[player].hand.splice(i, 1);
    
        //save game to DB
        client.query(`UPDATE gameMap SET gameMap = '${JSON.stringify(gameMap)}' WHERE thiskey = 'KEY';`);
        
        //start next turn
        sendInfo(gameId);
    });
    
    /*  aces low/high sockets flips the game.aceValue (1 or 16) when
        client presses aces button and sends high/low ace command back to clients. */
    socket.on('aces_low', () => {
        let gameId = userMap[socket.id].gameId;
        let game = gameMap[gameId];
        
        
        if (game[userId].turn){
        game.aceValue = 1;
        if (game.player1Id in userMap) io.to(game.player1Id).emit('lowAce');
        if (game.player2Id in userMap) io.to(game.player2Id).emit('lowAce');
        client.query(`UPDATE gameMap SET gameMap = '${JSON.stringify(gameMap)}' WHERE thiskey = 'KEY';`);
    }
        
    });
    socket.on('aces_high', () => {
        let gameId = userMap[socket.id].gameId;
        let game = gameMap[gameId];
        if (game[userId].turn) {
            game.aceValue = 16;
            if (game.player1Id in userMap) io.to(game.player1Id).emit('highAce');
            if (game.player2Id in userMap) io.to(game.player2Id).emit('highAce');
            client.query(`UPDATE gameMap SET gameMap = '${JSON.stringify(gameMap)}' WHERE thiskey = 'KEY';`);
        }
    });
    
    //if user types '$resign' user is resigned and opponent wins, both are placed in lobby
    socket.on('resign', () => {
        //make sure the player the requested to resign is in a game
        if (userMap[userId].gameId !== 'none') {
            let gameId = userMap[userId].gameId;
            let game = gameMap[gameId];
            let opponentId = game[userId].opponentId;
    
            //make sure everyone on the server knows that the player is a quitter, shame!
            io.sockets.emit('receive_message', `OH NO! ${game[userId].name} resigned, ${game[opponentId].name} has won by default.`);
            
            //put player in lobby
            lobby.names.push(userMap[userId].name);
            lobby.ids.push(userId);
            io.to(userId).emit('setup_lobby');
            userMap[userId].gameId = 'none';
            
            //if opponent is logged in, put them in lobby too
            if (opponentId in userMap) {
                lobby.names.push(userMap[opponentId].name);
                lobby.ids.push(opponentId);
                io.to(opponentId).emit('setup_lobby');
                userMap[opponentId].gameId = 'none';
            }
            
            //remove both players from namesPlaying, and update DB with
            delete namesPlaying[game[userId].name];
            delete namesPlaying[game[opponentId].name];
            
            //calculate players' elo ratings
            let oldUserRating = userScores[game[userId].name].rating;
            let oldOpponentRating = userScores[game[opponentId].name].rating;
            let newUserRating;
            let newOpponentRating;
            let EUR = Math.pow(10, oldUserRating/400) / (Math.pow(10, oldUserRating/400) + Math.pow(10, oldOpponentRating/400));
            let EOR = Math.pow(10, oldOpponentRating/400) / (Math.pow(10, oldUserRating/400) + Math.pow(10, oldOpponentRating/400));
            newUserRating = oldUserRating + ELO_K_VALUE *(0 - EUR);
            newOpponentRating = oldOpponentRating + ELO_K_VALUE *(1 - EOR);
            
            
            //test this
            //set new ratings & total games
            userScores[game[opponentId].name].rating = newOpponentRating;
            userScores[game[userId].name].rating = newUserRating;
            userScores[game[userId].name].total++;
            userScores[game[opponentId].name].total++;
            
            //update userBank DB and delete game, update gameDB
            client.query(`UPDATE userbank SET total = total + 1 WHERE username = '${game[opponentId].name}';`);
            client.query(`UPDATE userbank SET total = total + 1 WHERE username = '${game[userId].name}';`);
            client.query(`UPDATE userbank SET rating = ${newOpponentRating} WHERE username = '${game[opponentId].name}';`);
            client.query(`UPDATE userbank SET rating = ${newUserRating} WHERE username = '${game[userId].name}';`);
            client.query(`UPDATE namesPlaying SET namesPlaying = '${JSON.stringify(namesPlaying)}' WHERE thiskey = 'KEY';`);
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
        //if the game exists
        if (gameId in gameMap){
           let game = gameMap[gameId];
           //and it's not locked
           if (!game.locked) {
               //remove them from lobby and put them in game.spies
               removeFromLobby(userId);
               updateLobby();
               game.spies.push(userId);
               io.to(userId).emit('setup_game');
               
               //alert players they are being watched
               io.to(game.player1Id).emit('receive_message', `WARNING!! ${userMap[userId].name} is watching your game type '$kick' to kick them`);
               io.to(game.player2Id).emit('receive_message', `WARNING!! ${userMap[userId].name} is watching your game type '$kick' to kick them`);
               //if (game[game.player1Id].picked && game[game.player2Id].picked) sendInfo(gameId); else sendPick(gameId);
           }
       }
    });
    
    //if user types '$lock', game is locked to spectators.
    socket.on('lock', () => {
        //if the player is in a game
        if (userMap[userId].gameId !== 'none') {
            //lock that game
            let game = gameMap[userMap[userId].gameId];
            game.locked = true;
            
            //tell the players the game is locked
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
        //if the player is in a game
        if (userMap[userId].gameId !== 'none') {
            let game = gameMap[userMap[userId].gameId];
            
            //tell the players, spectators are being kicked.
            io.to(game.player1Id).emit('receive_message', 'Kicking unwanted spectators');
            io.to(game.player2Id).emit('receive_message', 'Kicking unwanted spectators');
            
            //iterate through game.spies
            for (let i = 0; i < game.spies.length; i++){
                //if the spy is logged in, tell them they were kicked & put them in lobby.
                if (game.spies[i] in userMap) {
                    io.to(game.spies[i]).emit('receive_message', 'You have been kicked!');
                    lobby.names.push(userMap[game.spies[i]].name);
                    lobby.ids.push(game.spies[i]);
                    io.to(game.spies[i]).emit('setup_lobby');
                }
            }
            
            //empty game.spies
            game.spies = [];
            
            //update gameMap DB
            client.query(`UPDATE gameMap SET gameMap = '${JSON.stringify(gameMap)}' WHERE thiskey = 'KEY';`);
            
            updateLobby();
        }
    });
    
    //if user types '$whisper' following text is sent as private message to opponent. (generally chat is global)
    socket.on('whisper', msg => {
        //if user is in game
        if(userMap[userId].gameId !== 'none') {
            let game = gameMap[userMap[userId].gameId];
            
            //send message to players in game
            io.to(game.player1Id).emit('receive_message', `${userMap[userId].name}(whisper): ${msg}`);
            io.to(game.player2Id).emit('receive_message', `${userMap[userId].name}(whisper): ${msg}`);
        }
    });
    
    //for testing
    socket.on('crash', () => { let brokenVariable = userMap['broken'].name });
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
const card = (value, suit) =>  [value, suit];
const deck = (jokers) => {
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
    if (jokers === 'on') {
        deckReturn.push(card(11, 'joker'));
        deckReturn.push(card(12, 'joker'));
    }
    shuffle(deckReturn);
    return deckReturn;
};
const shuffle = a => {
    for (let i = a.length; i; i--) {
        let j = Math.floor(Math.random() * i);
        [a[i - 1], a[j]] = [a[j], a[i - 1]];
    }
};

//resets game variables, deals (game.round) number of cards, exposes trump and prints to player's logs. if round is 0, ends game.
const deal = gameId => {
    let game = gameMap[gameId];
    if (game.round === 0) endGame(gameId);
    else if (game.round === 11) endGame(gameId);
    else if ((game.progression === 'constant' || game.progression === 'random') && game.actualRound === game.finish + 1) endGame(gameId);
    else if (game.progression === 'low to high' && game.loop === 'off' && game.round === game.finish + 1 ) endGame(gameId);
    else if (game.progression === 'low to high' && game.loop === 'on' && game.plusMinus === -1 && game.round === game.finish - 1 ) endGame(gameId);
    else if (game.progression === 'high to low' && game.loop === 'off' && game.round === game.finish - 1 ) endGame(gameId);
    else if (game.progression === 'high to low' && game.loop === 'on' && game.plusMinus === 1 && game.round === game.finish + 1 ) endGame(gameId);
    else {
        let extraInfo = '';
        if (game.plusMinus === 1) extraInfo = '( + )';
        if (game.plusMinus === -1) extraInfo = '( - )';
        if (game.plusMinus === 0) extraInfo = '( = )';
        if (game.progression === 'random') extraInfo = '( R )';
        sendLog(gameId, `<span style="text-decoration: overline underline;">Dealing new hand for round ${game.round}. ${extraInfo}</span>`);
        extraInfo = ``;
        if (isEven(game.actualRound)) {//<--from round
            game[game.player1Id].turn = true;
            game[game.player2Id].turn = false;
        } else {
            game[game.player1Id].turn = false;
            game[game.player2Id].turn = true;
        }
        game.gameDeck = deck(game.jokers);
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
        delete game.gameDeck;
        if (game.dealer_picks_trump === 'off') {
            sendLog(gameId, `The trump is ${game.trump[1]}.`);
        }
        if (game.dealer_picks_trump === 'on'){
            sendTrumpPick(gameId);
        } else {
            sendPick(gameId);
        }
        
        client.query(`UPDATE gameMap SET gameMap = '${JSON.stringify(gameMap)}' WHERE thiskey = 'KEY';`);
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

const sendTrumpPick = id => {
    let game = gameMap[id];
    let player1Stats = [game[game.player1Id].score, game[game.player1Id].goal, game[game.player1Id].tricks];
    let player2Stats = [game[game.player2Id].score, game[game.player2Id].goal, game[game.player2Id].tricks];
    // [[hand], [opponents hand length], [trump], [inPlay], [?¿turn?¿], [your stats], [opponent stats], [opponent's name]]
    let player1info = [game[game.player1Id].hand, game[game.player2Id].hand.length, game.trump, game.inPlay, game[game.player1Id].turn, player1Stats, player2Stats, game[game.player2Id].name];
    let player2info = [game[game.player2Id].hand, game[game.player1Id].hand.length, game.trump, game.inPlay, game[game.player2Id].turn, player2Stats, player1Stats, game[game.player1Id].name];
    if (game.player1Id in userMap) {
        io.to(game.player1Id).emit('pick_trump', player1info);
    }
    if (game.player2Id in userMap) {
        io.to(game.player2Id).emit('pick_trump', player2info);
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
        if (game.loop === 'on'){
            if (game.progression === 'low to high' && game.round === 10) gameMap[id].plusMinus = -1;
            else if (game.progression === 'high to low' && game.round === 1) gameMap[id].plusMinus = 1;
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
    let joker_value = game.joker_value;
    let firstId = game.player1Id;
    let secondId = game.player2Id;
    let player1leader = true;
    let player2leader = true;
    if (game.leader_only === 'on'){
        if (game[firstId].score <= game[secondId].score) player1leader = false;
        if (game[firstId].score >= game[secondId].score) player2leader = false;
    }
    if (game[firstId].tricks === game[firstId].goal) {
        game[firstId].score += game.round + game[firstId].tricks + jokerCount(game[firstId].tricksWon)*joker_value;
        sendLog(gameId, `${game[firstId].name} scored ${game.round + game[firstId].tricks + jokerCount(game[firstId].tricksWon)*joker_value} and now has ${game[firstId].score} points.`);
    } else if (game.lose_points === 'on' && player1leader) {
        game[firstId].score -= game.lose_number;
        sendLog(gameId, `${game[firstId].name} lost ${game.lose_number} points and now has ${game[firstId].score} points.`);
    }
    if (game[secondId].tricks === game[secondId].goal) {
        game[secondId].score += game.round + game[secondId].tricks + jokerCount(game[secondId].tricksWon)*joker_value;
        sendLog(gameId, `${game[secondId].name} scored ${game.round + game[secondId].tricks + jokerCount(game[secondId].tricksWon)*joker_value} and now has ${game[secondId].score} points.`);
    } else if (game.lose_points === 'on' && player2leader) {
        game[secondId].score -= game.lose_number;
        sendLog(gameId, `${game[secondId].name} lost ${game.lose_number} points and now has ${game[secondId].score} points.`);
    }
    if (game.goal_only === 'off') {
        if (game[firstId].tricks !== game[firstId].goal) {
            game[firstId].score += game[firstId].tricks;
            sendLog(gameId, `${game[firstId].name} gained ${game[firstId].tricks} points (from tricks) and now has ${game[firstId].score} points.`);
        }
        if (game[secondId].tricks !== game[secondId].goal) {
            game[secondId].score += game[secondId].tricks;
            sendLog(gameId, `${game[secondId].name} gained ${game[secondId].tricks} points (from tricks) and now has ${game[secondId].score} points.`);
        }
    }
    game.round += game.plusMinus;
    game.actualRound++;
    if (game.progression === 'random') {
        game.round = randomInt(1, 10);
    }
    client.query(`UPDATE gameMap SET gameMap = '${JSON.stringify(gameMap)}' WHERE thiskey = 'KEY';`);
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
    
    //update both user's totals
    userScores[game[player1].name].total++;
    userScores[game[player2].name].total++;
    client.query(`UPDATE userbank SET total = total + 1 WHERE username = '${game[player1].name}';`);
    client.query(`UPDATE userbank SET total = total + 1 WHERE username = '${game[player2].name}';`);
    
    let oldPlayer1Rating = userScores[game[player1].name].rating;
    let oldPlayer2Rating = userScores[game[player2].name].rating;
    let E1R = Math.pow(10, oldPlayer1Rating / 400) / (Math.pow(10, oldPlayer1Rating / 400) + Math.pow(10, oldPlayer2Rating / 400));
    let E2R = Math.pow(10, oldPlayer2Rating / 400) / (Math.pow(10, oldPlayer1Rating / 400) + Math.pow(10, oldPlayer2Rating / 400));
    let newPlayer1Rating;
    let newPlayer2Rating;
    
    if (game[player1].score > game[player2].score) {
        io.sockets.emit('receive_message', `${gameText}${game[player1].name} won, ${game[player1].score} to ${game[player2].score}`);
        //player1 wins
        newPlayer1Rating = oldPlayer1Rating + ELO_K_VALUE * (1 - E1R);
        newPlayer2Rating = oldPlayer2Rating + ELO_K_VALUE * (0 - E2R);
    } else if (game[player1].score < game[player2].score) {
        io.sockets.emit('receive_message', `${gameText}${game[player2].name} won, ${game[player1].score} to ${game[player2].score}`);
        //player2 wins
        newPlayer1Rating = oldPlayer1Rating + ELO_K_VALUE * (0 - E1R);
        newPlayer2Rating = oldPlayer2Rating + ELO_K_VALUE * (1 - E2R);
    } else {
        io.sockets.emit('receive_message', `${gameText}Tie game, ${game[player1].score} to ${game[player2].score}`);
        //tie game
        newPlayer1Rating = oldPlayer1Rating + ELO_K_VALUE * (.5 - E1R);
        newPlayer2Rating = oldPlayer2Rating + ELO_K_VALUE * (.5 - E2R);
    }
    //update DB and userScores with new ratings
    client.query(`UPDATE userbank SET rating = ${newPlayer1Rating} WHERE username = '${userMap[player1].name}';`);
    client.query(`UPDATE userbank SET rating = ${newPlayer2Rating} WHERE username = '${userMap[player2].name}';`);
    userScores[userMap[player1].name].rating = newPlayer1Rating;
    userScores[userMap[player2].name].rating = newPlayer2Rating;
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
    delete namesPlaying[game[player2].name];
    client.query(`UPDATE namesPlaying SET namesPlaying = '${JSON.stringify(namesPlaying)}' WHERE thiskey = 'KEY';`);
    userMap[player1].gameId = 'none';
    userMap[player2].gameId = 'none';
    delete gameMap[gameId];
    client.query(`UPDATE gameMap SET gameMap = '${JSON.stringify(gameMap)}' WHERE thiskey = 'KEY';`);
    updateLobby();
};

const makeBoard = () => {
    //let order = Object.keys(userScores).map(key => userScores[key]).sort((a, b) => a.stat - b.stat);
    let order = Object.keys(userScores).sort(((a, b) => userScores[a].rating > userScores[b].rating));
    console.log(order);
    let board = '';
    for (let i = 0; i< order.length; i++){
        board = '<p><u>' + order[i] + '</u></p><p style="font-size: 14px">Rating: ' + userScores[order[i]].rating.toFixed(0) + ' games: ' + userScores[order[i]].total + '</p>' + board;
    }
    board = '<h3><u>Player Ratings:</u></h3>' + board;
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
    else if (game.goal_only === 'off') return false;
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

//takes value integer and returns value string ie: 3 -> 'Three'
const cardValue = value => {
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
    else if (value === 11 ) value = 'Joker';
    else if (value === 12 ) value = 'Joker';
    else if (value === 13 ) value = 'Jack';
    else if (value === 14 ) value = 'Queen';
    else if (value === 15 ) value = 'King';
    else if (value === 16 ) value = 'high Ace';
    return value;
};

const randomInt = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

const onOrOff = () => {
    if (Math.random() >= 0.5) return 'on';
    else return 'off';
};

const randomize = gameId => {
    let game = gameMap[gameId];
    let aces, jokers, joker_value, agreement, follow_suit, lose_points, lose_number, leader_only,
        loop, progression, start, finish, goal_only, pick_opponents_goal, dealer_picks_trump;
    leader_only = onOrOff();
    lose_points = onOrOff();
    follow_suit = onOrOff();
    goal_only = onOrOff();
    agreement = onOrOff();
    jokers = onOrOff();
    loop = onOrOff();
    pick_opponents_goal = onOrOff();
    dealer_picks_trump = onOrOff();
    lose_number = randomInt(1, 10);
    joker_value = randomInt(0, 10);
    
    let aceRandom = Math.random();
    if (aceRandom <= 0.33) aces = 'high';
    else if (aceRandom <=.66) aces = 'low';
    else aces = 'both';
    
    let progressionRandom = Math.random();
    if (progressionRandom <= 0.25) progression = 'low to high';
    else if (progressionRandom <=.5) progression = 'high to low';
    else if (progressionRandom <=.75) progression = 'constant';
    else progression = 'random';
    if (progression === 'low to high'){
        start = 1;
        if (loop === 'on') finish = 1;
        else finish = 10;
    } else if (progression === 'high to low'){
        start = 10;
        if (loop === 'on') finish = 10;
        else finish = 1;
    } else {
        start = randomInt(1, 10);
        finish = 10;
    }
    
    game.aces = aces;
    game.jokers = jokers;
    game.joker_value = joker_value;
    game.agreement = agreement;
    game.follow_suit = follow_suit;
    game.lose_points = lose_points;
    game.lose_number = lose_number;
    game.leader_only = leader_only;
    game.loop = loop;
    game.progression = progression;
    game.start = start;
    game.finish = finish;
    game.goal_only = goal_only;
    game.pick_opponents_goal = pick_opponents_goal;
    game.dealer_picks_trump = dealer_picks_trump;
};

const logGameRules = gameId => {
    let game = gameMap[gameId];
    let player1Name = game[game.player1Id].name;
    let player2Name = game[game.player2Id].name;
    let text = `<p> Welcome to game ${gameId}</p><p>${player1Name} vs ${player2Name}</p>`;
    let aceText;
    if (game.aces === 'both'){
        aceText = 'high and low';
    } else {
        aceText = game.aces;
    }
    text += `<p>Aces are ${aceText}.</p>`;
    text += `<p>Jokers are ${game.jokers}.</p>`;
    if (game.jokers === 'on'){
        text += `<p>Jokers are worth ${game.joker_value} when scoring.</p>`;
    }
    if (game.pick_opponents_goal === 'on'){
        text += `<p>You will pick your opponent's goals.</p>`;
    } else {
        text += `<p>You will pick your own goals.</p>`;
    }
    text += `<p>Dealer picks trump: ${game.dealer_picks_trump}</p>`;
    text += `<p>Agreement when picking goal: ${game.agreement}</p>`;
    text += `<p>Following suit required: ${game.follow_suit}</p>`;
    if (game.lose_points === 'on'){
        text += '<p>';
        if (game.leader_only === 'on'){
            text += 'If you are the point leader, ';
        }
        text += `you will lose ${game.lose_number} points for incorrect guesses</p>`;
    }
    text += `<p>Tricks add to score only on correct guess: ${game.goal_only}</p>`;
    if (game.progression === 'constant'){
        text += `<p>Game progression: constant rounds of ${game.start} cards.</p><p>Game will end after ${game.finish} rounds.</p>`;
    } else if (game.progression === 'random') {
        text += `<p>Game progression: random, starting at round ${game.start}.</p><p>Game will end after ${game.finish} rounds.</p>`;
    } else {
        text += `<p>Game progression: ${game.progression}, loop ${game.loop}.</p>`;
        text += `<p>Starting at round ${game.start} and ending at round ${game.finish}.</p>`;
    }
    sendLog(gameId, text);
};

const givePlayerTrick = (gameId, winner, loser, card1, card2) => {
    let game = gameMap[gameId];
    game[winner].tricks++;
    game[loser].turn = false;
    game[winner].turn = true;
    
    //displays card for players after cards have been played
    io.to(winner).emit('last_turn_cards', [card1, card2]);
    io.to(loser).emit('last_turn_cards', [card1, card2]);
    
    //stores the card in that player's object
    game[winner].tricksWon.push(card1);
    game[winner].tricksWon.push(card2);
    
    sendLog(gameId, `${game[winner].name} got the trick`);
};
