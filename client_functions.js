/**
 * Created by Orion Wolf_Hubbard on 5/25/2017.
 */
    
    
    //connects to server
let socket = io();

//prompts user to pick game rules and send and invite.
const sendInvite = (name, id) => {
    let invite_popup_content = document.getElementById('invite_popup_content');
    let invite_popup = document.getElementById('invite_popup');
    invite_popup_content.innerHTML = `
                <form id="invite_form">
                    please choose rules for game with ${name} below: <br>
                    <div class="invite_divs">
                        Aces:
                        <input title="aces" type="radio" name="aces" value="high"> high
                        <input type="radio" name="aces" value="low"> low
                        <input type="radio" name="aces" value="both" checked> both
                    </div>
                    <div class="invite_divs">
                        Pick goal for opponent:
                        <input title="pick_opponents_goal" name="pick_opponents_goal" type="radio" value="on"> on
                        <input name="pick_opponents_goal" type="radio" value="off" checked> off
                    </div>
                    <div class="invite_divs">
                        Goal agreement:
                        <input title="agree" type="radio" name="agree" value="on"> on
                        <input type="radio" name="agree" value="off" checked> off
                    </div>
                    <div class="invite_divs">
                        Following suit required:
                        <input title="follow_suit" type="radio" name="follow_suit" value="on" checked> on
                        <input type="radio" name="follow_suit" value="off"> off
                    </div>
                    <div class="invite_divs">
                        Score tricks only on goal:
                        <input title="goal_only" type="radio" name="goal_only" value="on" checked> on
                        <input type="radio" name="goal_only" value="off"> off
                    </div>



                    <div class="invite_divs">
                        Dealer picks trump:
                        <input title="dealer_picks_trump" type="radio" name="dealer_picks_trump" value="on"> on
                        <input type="radio" name="dealer_picks_trump" value="off" checked> off
                    </div>



                    <div class="invite_divs">
                        Jokers:
                        <input title="jokers" type="radio" name="jokers" value="on" checked> on
                        <input type="radio" name="jokers" value="off"> off &nbsp; &nbsp; &nbsp;
                        Joker value (0 to 10):
                        <input title="joker_value" type="number" class="invite_input" name="joker_value" min="0" max="10" value="5">
                    </div>
                    <div class="invite_divs">
                        Failing loses points:
                        <input title="lose_points" type="radio" name="lose_points" value="on"> on
                        <input type="radio" name="lose_points" value="off" checked> off <br>
                        How many points? (1 to 10):
                        <input title="lose_number" type="number" class="invite_input" name="lose_number" min="1" max="10" value="5"><br>
                        Only for point leader?:
                        <input title="leader_only" type="radio" name="leader_only" value="on"> on
                        <input type="radio" name="leader_only" value="off" checked> off
                    </div>
                    <div class="invite_divs">
                        Game progression: &nbsp; &nbsp; &nbsp;
                        Loop: <input type="radio" title="loop" name="loop" value="on" checked> on
                        <input type="radio" name="loop" value="off"> off<br>
                        <input title="progression" type="radio" name="progression" value="high to low"> high to low
                        <input type="radio" name="progression" value="low to high" checked> low to high
                        <input type="radio" name="progression" value="constant"> constant
                        <input type="radio" name="progression" value="random"> random <br>
                        Start value: (1 to 10):
                        <input title="start" type="number" class="invite_input" name="start" min="1" max="10" value="1"> &nbsp; &nbsp;
                        End value: (1 to 10):
                        <input title="finish" type="number" class="invite_input" name="finish" min="1" max="10" value="1">
                    </div>
                </form>
                <button class="invite_buttons" id="invite_button"><h3>send invite</h3></button>
                <button class="invite_buttons" id="randomize_button"><h3>send randomized game invite</h3></button>
                <button class="invite_buttons" id="cancel_button"><h3>cancel</h3></button>
                `;
    let invite_form = document.getElementById('invite_form');
    let invite_button = document.getElementById('invite_button');
    let randomize_button = document.getElementById('randomize_button');
    let cancel_button = document.getElementById('cancel_button');
    randomize_button.addEventListener('click', () => {
        socket.emit('pair_request', [id, 'randomize']);
        invite_popup.style.display = "none";
    });
    invite_button.addEventListener('click', () => {
        if (invite_form.joker_value.value === '') {
            invite_form.joker_value.value = 5;
        }
        invite_form.joker_value.value = Math.round(invite_form.joker_value.value);
        if (invite_form.lose_number.value === '') {
            invite_form.lose_number.value = 5;
        }
        invite_form.lose_number.value = Math.round(invite_form.lose_number.value);
        if (invite_form.start.value === '') {
            invite_form.start.value = 5;
        }
        invite_form.start.value = Math.round(invite_form.start.value);
        if (invite_form.finish.value === '') {
            invite_form.finish.value = 5;
        }
        invite_form.finish.value = Math.round(invite_form.finish.value);
        if (
            11 > invite_form.joker_value.value &&
            invite_form.joker_value.value > -1 &&
            11 > invite_form.lose_number.value &&
            invite_form.lose_number.value > 0 &&
            11 > invite_form.start.value &&
            invite_form.start.value > 0 &&
            11 > invite_form.finish.value &&
            invite_form.finish.value > 0
        ) {
            socket.emit('pair_request', [
                id,     //0
                invite_form.aces.value,               //1
                invite_form.jokers.value,             //2
                invite_form.joker_value.value,        //3
                invite_form.agree.value,              //4
                invite_form.follow_suit.value,        //5
                invite_form.lose_points.value,        //6
                invite_form.lose_number.value,        //7
                invite_form.leader_only.value,        //8
                invite_form.loop.value,               //9
                invite_form.progression.value,        //10
                invite_form.start.value,              //11
                invite_form.finish.value,             //12
                invite_form.goal_only.value,          //13
                invite_form.pick_opponents_goal.value,//14
                invite_form.dealer_picks_trump.value  //14
            ]);
            invite_popup.style.display = "none";
        }
    });
    cancel_button.addEventListener('click', () => {
        invite_popup.style.display = "none";
    });
    invite_popup.style.display = "block";
};

//checks if card is legal play, returns boolean
const isLegal = (hand, i) => {
    
    //if rules say you don't need to follow suit, all moves are legal
    if (!follow_suit) return true;
    
    //if there is no card in play, all moves are legal
    if (inPlay[SUIT] === 20) return true;
    
    //if the card to be played is the same suit as the card in play, move is legal
    if (inPlay[SUIT] === hand[i][SUIT]) return true;
    
    //else check the rest of the players hand
    else {
        let haveCards = haveCard(hand);
        
        //if you don't have any inPlay suit cards or jokers in hand, move is legal
        if (!haveCards[0] && !haveCards[1]) return true;
        
        //if you don't have the suit inPlay and the card you are trying to play is a joker, move is legal
        if (!haveCards[0] && hand[i][1] === 'joker') return true;
        
        //if card inPlay is a joker and you don't have a joker, any move is legal
        if (inPlay[SUIT] === 'joker' && !haveCards[1]) return true;
    }
    
    //returns false if all checks fail
    return false
};

//checks if you have joker or trump suits in your hand, used by isLegal()
const haveCard = hand => {
    let jokers = false;
    let suits = false;
    for (let i = 0; i<hand.length; i++){
        if (hand[i][SUIT] === inPlay[SUIT]) suits = true;
        if (hand[i][SUIT] === 'joker') jokers = true;
    }
    return [suits, jokers];
};

//returns html for cards which can't be played
const cardImg = card => `<img class="cards" src= "http://owolfhu1.x10host.com/Oh_Hell_solo/img/card${card[SUIT]}${card[VALUE]}.png" id="${card[SUIT]}${card[VALUE]}" >`;

//returns html for cards which can be played
const legalCardImg = card => `<img class="legal" src= "http://owolfhu1.x10host.com/Oh_Hell_solo/img/card${card[SUIT]}${card[VALUE]}.png" id="${card[SUIT]}${card[VALUE]}" >`;

//returns html for inPlay and trump cards
const bigCardImg = card => `<img style="width: 140px; height: inherit" src= "http://owolfhu1.x10host.com/Oh_Hell_solo/img/card${card[SUIT]}${card[VALUE]}.png" id="${card[SUIT]}${card[VALUE]}" >`;

//what happens when you press enter in the chat input.
$('form').submit( () => {
    let text = $('#text').val();
    /*s*/if (text === '$help') document.getElementById('messages').innerHTML += HELP_TEXT;
    else if (text === '$instructions') document.getElementById('messages').innerHTML += INSTRUCTIONS_TEXT;
    else if (text.substring(0, 8) === '$whisper' && userName !== 'GUEST') socket.emit('whisper', text.substring(9, text.length));
    else if (text === '$kick')socket.emit('kick');
    else if (text === '$lock') socket.emit('lock');
    else if (text === '$unlock') socket.emit('unlock');
    else if (text === '$resign')socket.emit('resign');
    else if (text === '$tricks')socket.emit('tricks');
    else if (text === '$board') socket.emit('leaderboard');
    else if (text === '$buzz') socket.emit('buzz');
    else if (text === '$$RESTART') socket.emit('restart');
    else if (text.substring(0, 7) === '$watch ')socket.emit('watch_game', text.substring(7, text.length));
    else { socket.emit('message', '<p>' + userName + ': ' + text + '</p>'); $('#text').val(''); }
    return false;
});

//creates form for logging in and user creation
socket.on('setup_login', () => {
    lobby.innerHTML = `<br><br>
                        user name: <input type="text" id="userName"><br><br>
                        password: <input type="password" id="password"><br><br><br><br>
                        <button style="font-family: 'Comic Sans MS'; color: white ; background-color: #2e2e2e ; border:31px dashed #b03f48; border-radius: 150px; height: 300px; width: 300px" id="login"><h1>Login<br>or<br>Create</h1></button>
                `;
    document.getElementById('login').addEventListener('click', () => {
        let userName = document.getElementById('userName').value;
        let password = document.getElementById('password').value;
        if (userName.length > 10) {
            alert('Username too long. (10 char max)');
        } else if (userName.length < 1) {
            alert('Please enter a username.');
        } else {
            socket.emit('login_request', [userName, password]);
        }
    });
});