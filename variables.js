/**
 * Created by Orion Wolf_Hubbard on 5/25/2017.
 */

let
    title = document.getElementById('title'), turn_indicator, player_hand, opponent_hand, trump_box,
    play_area, opponent_name, player_name, opponent_score, opponent_goal, opponent_tricks, player_score,
    player_goal, player_tricks, lobby, userName = 'GUEST', trump, inPlay, aces_button, player1_tricks,
    player2_tricks, tricks_popup, aceStyle, agreement, follow_suit, pick_opponents_goal;
const
    SUIT = 1, VALUE = 0, NAME = 0, ID = 1, HAND = 0, OPPONENT_HAND_SIZE = 1, TRUMP = 2, IN_PLAY = 3, TURN = 4,
    PLAYER_STATS = 5, OPPONENT_STATS = 6, SCORE = 0, GOAL = 1, TRICKS = 2, OPPONENT_NAME = 7, PLAYER_1 = 0, PLAYER_2 = 1;
const alertSound = new Audio('http://owolfhu1.x10host.com/Oh_Hell_solo/img/sound.mp3');
const smallSound = new Audio('http://owolfhu1.x10host.com/Oh_Hell_solo/img/smallSound.mp3');
const shuffleSound = new Audio('http://owolfhu1.x10host.com/Oh_Hell_solo/img/shuffle.mp3');
const secretSound = new Audio('http://owolfhu1.x10host.com/Oh_Hell_solo/img/secret.mp3');
const HELP_TEXT = `
                <p><b>$instructions: </b>Prints the rules in the chat screen.</p>
                <p><b>$tricks: </b>Displays a list of tricks each player has won.</p>
                <p><b>$buzz: </b>Plays a sound to your opponent.</p>
                <p><b>$resign: </b>Forfeits the game.</p>
                <p><b>$watch: </b>Followed by a gameId lets you watch that game.</p>
                <p><b>$kick: </b>Kicks all spectators.</p>
                <p><b>$lock: </b>Locks the game from spectators (doesn't kick).</p>
                <p><b>$unlock: </b>Unlocks the game to spectators.</p>
                <p><b>$whisper: </b>Sends a private message to your opponent.</p>
            `;
const INSTRUCTIONS_TEXT = `
                <p><b>Objective:</b> Score the most points by correctly guessing how many tricks you will win each round.</p>
                <p><b>Picking Your Goal:</b> At the beginning each round you will be prompted a row of buttons to pick your goal with. You cannot agree with your opponent, your goal's must not add up to the round # </p>
                <p><b>Playing a Card:</b> If you are the first to play a card (there is no card in the middle of the card area), you may play any card. If not, you must follow the suit previously played. If you do not have the suit, you must play a joker, otherwise you can play any card.</p>
                <p><b>Winning Tricks:</b> The first card played determines the strong suit, however a trump suit will beat the strong suit. If the second card is the same suit, it will win only if it is a higher card, otherwise the first card wins the trick. If the second card is a different suit, it wins the trick if it is a trump, otherwise loses. If ether card is a joker, the suit is irrelevant, the higher card wins the trick with jokers being between ten and jack. If both cards are jokers, the first card wins the trick.</p>
                <p><b>Scoring:</b> If you guess the correct number of tricks, you will score the number of tricks you won, plus the number of cards you started with, plus 5 for any joker in your tricks.</p>
                <p><b>Game Play:</b> Start each round by picking your goal, then players take turns playing cards until each player is out of cards or neither player can reach their goal. Then a new round is dealt with an increasing or decreasing number of cards. Starting at 1 card each, working your way up to ten cards then back down to one card</p>
            `;
