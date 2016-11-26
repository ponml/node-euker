function TableViewModel(options) {
	var me = this;
	me.player = ko.mapping.fromJS(options.player);
	var mappedOtherPlayers = options.otherPlayers.map(function(player) {
		return ko.mapping.fromJS(player);
	});
	me.otherPlayers = ko.observableArray(mappedOtherPlayers);	
	me.trumpSuit = ko.observable("");
	me.trickSuit = ko.observable("");
	me.teamOneScore = ko.observable(0);
	me.teamTwoScore = ko.observable(0);
	me.cardValues = {
		"9": 9,
		"10": 10,
		"j": 11,
		"q": 12,
		"k": 13,
		"a": 14,
	};
}

TableViewModel.prototype.update = function update(tableData) {
	var me = this;
	var newPlayer = new Player(tableData.player);
	ko.mapping.fromJS(newPlayer, me.player);
	me.updateOtherPlayers(tableData.otherPlayers);
};

TableViewModel.prototype.updateOtherPlayers = function updateOtherPlayers(otherPlayers) {
	var me = this;
	otherPlayers.forEach(function(otherPlayer) {
		var player = me.otherPlayers().filter(function(p) { return ko.unwrap(p.id) === otherPlayer.id; })[0];
		ko.mapping.fromJS(new Player(otherPlayer), player);
	});
};

TableViewModel.prototype.getOtherPlayer = function getOtherPlayer(seatsAway) {
	var me = this;

	var playerId = me.player.id();
	var targetId = Math.abs((+playerId) + (+seatsAway));
	if(targetId > 4) {
		targetId = targetId - 4;
	}


	var other = me.otherPlayers().filter(function(player) {
		return player.id() == targetId;
	});


	if(other.length) {
		return other[0];
	} else {
		return null;
	}
};

TableViewModel.prototype.getCardCss = function getCardCss(value, suit) {
	var me = this;
	value = me.cardValues[ko.unwrap(value)];
	suit = ko.unwrap(suit);
	console.log("card: " + value + " suit: " +suit);
	return "card " + suit + " rank" + value;
};


function Player(options) {
	var me = this;
	me.hand = new Hand(options.hand);
	me.name = options.name;
	me.id = options.id;
	me.team = options.team;
	me.assigned = options.assigned;
	me.isLeader = options.isLeader;
	me.isDealer = options.isDealer || false;
	me.playedCard = options.playedCard;
	me.isMyTurn = options.isMyTurn;
}

Player.prototype.init = function init(options) {
	var me = this;	
};

Player.prototype.update = function update(player) {
	var me = this;
	me.name = player.name;
	me.id = player.id;
	me.team = player.team;
	me.assigned = player.assigned;
	me.isLeader = player.isLeader;	
	me.isDealer = player.isDealer;
	me.playedCard = player.playedCard;
	me.isMyTurn = player.isMyTurn;
};
	
Player.prototype.playCard = function playCard(playedCard, trickSuit, trumpSuit) {

	function playTheCard(card) {
		var index = 0;
		me.hand.cards().some(function(c, i) {
			if(card.value() == c.value() && card.suit() == c.suit()) {
				index = i;
				return true;
			}
		});
		var card = me.hand.cards.splice(index, 1);
	}
	var me = this;

	trickSuit = trickSuit();
	trumpSuit = trumpSuit();
	var card = playedCard;
	if(me.isMyTurn()) {
		var potentialTrickSuitCards = me.hand.getTrickSuitCards(trickSuit, trumpSuit);
		//if we have trick suit cards, we MUST play from them. Reject everything else.
		if(potentialTrickSuitCards.length) { 
			if(potentialTrickSuitCards.some(function(c) { return c == card; })) {
				playTheCard(card);
			} else {
				return;
			}
		} else {
			playTheCard(card);
		}
 	} else {
 		return;
 	}
 };


function Hand(options) {
	var me = this;
	if(!options) {
		options = {};
	}
	me.cards = me.addCardsFromJSON(options.cards || []);	
}

Hand.prototype.addCard = function addCard(card) {
	var me = this;
	me.cards.push(card);
};

Hand.prototype.addCards = function addCards(cards) {
	var me = this;
	me.cards.concat(cards);
};


Hand.prototype.addCardsFromJSON = function addCardsFromJSON(cards) {
	var me = this;
	var mappedCards = cards.map(function(card) { return new Card(card); });
	return mappedCards;
};

Hand.prototype.update = function update(hand) {
	var me = this;
	me.cards = hand.cards;

}

Hand.prototype.getTrickSuitCards = function getTrickSuitCards(trickSuit, trumpSuit) {
	var me = this;
	return me.cards().filter(function(c) {
		var cardIsSameAsTrickSuit = c.suit() == trickSuit;
		var cardIsLeft = c.isTheLeft(trumpSuit);
		var leftSuit = c.getLeftSuit(trumpSuit);
		return (cardIsSameAsTrickSuit && !(cardIsLeft && (leftSuit == trickSuit))) || (!cardIsSameAsTrickSuit && (cardIsLeft && (trickSuit == trumpSuit)));
	});
}

function Card(options) {
	var me = this;	
	me.suit = options.suit;
	me.value = options.value;

	var trumpPairs = {
		"hearts": "diamonds",
		"diamonds": "hearts",
		"clubs": "spades",
		"spades": "clubs"
	};

	//me.css = me.getCardCss();
}

Card.prototype.init = function init(options) {
	var me = this;
};

Card.prototype.clone = function clone(options) {
	var me = this;
	return new Card({
		value: me.value,
		suit: me.suit
	});
};


Card.prototype.getLeftSuit = function getLeftSuit(trumpSuit) {
	var me = this;

	var trumpPairs = {
		"hearts": "diamonds",
		"diamonds": "hearts",
		"clubs": "spades",
		"spades": "clubs"
	};

	return trumpPairs[trumpSuit];
}

Card.prototype.isTheLeft = function isTheLeft(trumpSuit) {
	var me = this;
	var leftSuit = me.getLeftSuit(trumpSuit);
	return me.value() === "j" && me.suit() === leftSuit;
}

Card.prototype.getNumericValue = function getNumericValue(trumpSuit, trickSuit) {
	var me = this;
	var value = 0;

	var trumpPairs = {
		"hearts": "diamonds",
		"diamonds": "hearts",
		"clubs": "spades",
		"spades": "clubs"
	};
	var cardValues = {
		"9": 9,
		"10": 10,
		"j": 11,
		"q": 12,
		"k": 13,
		"a": 14,
	};

	var leftSuit = trumpPairs[trumpSuit];

	//if it's trump, it's automatically better than any non trump card.
	if(me.value === "j" && me.suit === leftSuit) {
		value = 100;
	} else if(me.suit === trumpSuit) {
		value = 100;
	} else if(me.suit !== trickSuit && me.suit !== trumpSuit) {
		return 0;
	}

	

	if(me.value === 'j') {
		if(me.suit === trumpSuit) { //FOR THE RIGHT JACK
			value += 300;
		} else if(me.suit === leftSuit) { //FOR THE LEFT JACK
			value += 200;
		} else { //TRUMPLESS JACK
			value += 11;
		}	
	} else {
		value += cardValues[me.value]; 
	}


	console.log("The " + me.value + " of " + me.suit + " has numeric value " + value);

	return value;
}

//This allows me to use the file via require for node, and as a plain source file in html
//I don't think this how anyone does this. It's potentially the worst thing ever. But, here we are.
if(typeof exports != "undefined") {
	exports.TableViewModel = TableViewModel,
	exports.Player = Player,
	exports.Hand = Hand,
	exports.Card = Card
}
