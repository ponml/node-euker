var path = require("path");
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var uuid = require('node-uuid');
var gameViewModels = require("./public/game");

var rooms = {};
var gameLobbies = [];
var clients = {};
var lastCheckRoom = null;

app.use(express.static(path.join(__dirname, '/public')));
// app.use('/room', express.static(path.join(__dirname, '/public/views')));
app.get("/room/:name/otherUsers", function(req, res) {
    res.setHeader('Content-Type', 'application/json');
    var lobby = findGameLobbyById(req.query.id);
    res.send(JSON.stringify(lobby.game));    
});

app.get('/room/:name', function(req, res) {
    res.sendFile(path.join(__dirname, '/public/views/' + 'room.html'));
});

http.listen(3000, function() {
	console.log('listening on *:3000 !!!');
});

io.on('connection', function(socket){
  	console.log('a user connected');
  	var player = null;
  	socket.on('tryAndJoinRoom', function(room) {
		var checkRoom = io.sockets.adapter.rooms[room];
		checkRoom = checkRoom && checkRoom.length ? checkRoom.length : 0;
		lastCheckRoom = checkRoom;
		console.log("try and join room as checkroom: " + checkRoom + " socket id: " + socket.id);
		
		if(checkRoom >= 4) {
			socket.emit("roomFull", room);
			return;
		} else if(checkRoom === 0) {
			var newGameLobby = new GameLobby({});
			newGameLobby.init();
			gameLobbies.push(newGameLobby);
			clients[room] = {};

		};

    	console.log('JOINING room: ' + room);

    	if(socket.room) {
			socket.leave(socket.room);
		}
		socket.room = room;
    	socket.join(room);
    	var gameLobby = gameLobbies[gameLobbies.length - 1];
    	player = gameLobby.table.getNextAvailablePlayer();
    	clients[room][player.id] = socket;
		var otherPlayers = getOtherPlayers(player, gameLobby.table)
		var tableResponse = {
			player: makePlayerResponse(player),
			otherPlayers: makeOtherPlayerResponse(otherPlayers)
		};

		socket.emit("joinedRoom", JSON.stringify({ tableData: tableResponse, gameLobbyId: gameLobby.id, gameStarted: gameLobby.table.gameStarted }));

		otherPlayers.forEach(function(player) {
			var others = getOtherPlayers(player, gameLobby.table);
			var playerSocket = clients[room][player.id];
			if(playerSocket) {
				playerSocket.emit("othersJoined", JSON.stringify(makeOtherPlayerResponse(others)));
			}
		});

		socket.on('disconnect', function() {
			if(player) {
				player.assigned = false;
			}
			if(socket) {
				socket.leave(socket.room);
			}
			
			console.log('user disconnected');
		});

		socket.on('playCard', function(playerIdAndCard) {
			var room = socket.room;
			var playedCard = JSON.parse(playerIdAndCard);
			var card = new gameViewModels.Card(playedCard.card);
			var playerId = playedCard.playerId;	
			var gameLobby = gameLobbies[gameLobbies.length - 1]; //FIX ME, ONLY TAKES THE LAST GAMELOBBY
			var table = gameLobby.table;
			var playerWhoPlayedCard = table.players.filter(function(p) {
				return p.id === playerId;
			});
			table.round.currentTrick.cardsPlayedByPlayerId[playerId] = card;
			playerWhoPlayedCard = playerWhoPlayedCard[0];
			var cardPlayedIndex = 0;
			playerWhoPlayedCard.hand.cards.some(function(c, index) {
				if(c.value === card.value && c.suit === card.suit) {
					cardPlayedIndex	= index;
					return true;
				}
			});

			var playedCard = playerWhoPlayedCard.hand.cards.splice(cardPlayedIndex, 1)[0];
			playerWhoPlayedCard.playedCard = playedCard;
			playerWhoPlayedCard.isMyTurn = false;
			var playerWhoIsNext = getNextTurnPlayer(playerWhoPlayedCard.id, table.players)
			socket.broadcast.to(socket.room).emit("cardPlayed", playerIdAndCard);
			table.round.currentTrick.numOfCardsPlayed++;

			if(table.round.currentTrick.numOfCardsPlayed === 1) {
				table.updateTrickSuitAndClients(new gameViewModels.Card(playedCard), room);
			}

			if(table.round.currentTrick.numOfCardsPlayed === 4) {
				setTimeout(function() {
					var trickWinner = table.round.currentTrick.findWinningPlayerAndCard();
					io.sockets.in(room).emit("trickWinner", JSON.stringify({
						trickWinner: trickWinner,
						playerCards: table.players.map(function(p) { return p.playedCard; })
					}));
					table.round.updateTrickCounts( trickWinner.playerId);
					debugger;
					var check = table.round.isTheRoundOver(table);
					if(check) {
						table.updateScores(room);
						startNewRound(table, room);
					} else { //next trick in the round
						table.round.startNewTrick();
						table.players[trickWinner.playerId - 1].isMyTurn = true;
						table.players.forEach(function(p) {
							p.playedCard = null;
						});
						table.updateTrickSuitAndClients(new gameViewModels.Card({suit: ""}), room);

						io.sockets.in(room).emit("nextTrick", trickWinner.playerId);
					}
					//find who won trick
					//increment round score ?
					//check for eueker 
					//check for round end
					//shuffle, assign new dealer, deal
				}, 750);
			
			} else {
				io.sockets.in(room).emit("nextTurn", playerWhoIsNext.id);
			}
		})
  	});


  	socket.on('startGame', function() {
  		var thisSocket = socket;
  		var room = thisSocket.room;
  		var roomSockets = Object.keys(io.sockets.adapter.rooms[room].sockets);
  		var otherSockets = roomSockets.filter(function(id) { 			
			return id !== thisSocket.id;
  		});
		var gameLobby = gameLobbies[gameLobbies.length - 1]; //FIX ME, ONLY TAKES THE LAST GAMELOBBY
		var table = gameLobby.table;
		table.gameStarted = true;
		startNewRound(table, room);	
  	});

  	socket.on('trumpSelected', function(trumpSuit) {
		var gameLobby = gameLobbies[gameLobbies.length - 1]; //FIX ME, ONLY TAKES THE LAST GAMELOBBY
		var table = gameLobby.table;
		table.round.trumpSuit = trumpSuit;
		table.round.currentTrick.trumpSuit = trumpSuit;
  	});

	socket.on('disconnect', function() {
		if(player) {
			player.assigned = false;
		}
		if(socket) {
			socket.leave(socket.room);
		}
		
		console.log('user disconnected');
	});
});

function getNextOf4(value) {
	var next = value + 1;
	if(next > 4) {
		return 1;
	}

}

function startNewRound(table, room) {
	var firstDealerId = getRandomInt(0,3);	
	table.players[firstDealerId].isDealer = true;
	table.players[firstDealerId].isMyTurn = true;
	table.currentDealerId = firstDealerId;
	table.deal();
	var trumpSuit = table.deck.suits[getRandomInt(0,3)];		
	table.round = new Round({ trumpSuit: trumpSuit, trickSuit: ""});
	table.players.forEach(function(player) { player.playedCard = null; });
	table.players.forEach(function(player) {

		var otherPlayers = getOtherPlayers(player, table);
		var tableResponse = {
			player: makePlayerResponse(player),
			otherPlayers: makeOtherPlayerResponse(otherPlayers)
		};
		var playerSocket = clients[room][player.id];
		playerSocket.emit("newRound", JSON.stringify(tableResponse));
		playerSocket.emit("trumpSuitGiven", table.round.trumpSuit);
	});	
}

function Round(options) {
	var me = this;
	if(!options) {
		options = {};
	}
	me.trumpSuit = options.trumpSuit;
	me.trickSuit = options.trickSuit;
	me.currentTrick = new Trick({trumpSuit: options.trumpSuit, trickSuit: options.trickSuit });
	me.teamOneTricks = 0;
	me.teamTwoTricks = 0;
}

Round.prototype.startNewTrick = function startNewTrick() {
	var me = this;	
	me.currentTrick = new Trick({ trumpSuit: me.trumpSuit , trickSuit: ""});
};

Round.prototype.updateTrickCounts = function updateTrickCounts(winningPlayerId) {
	var me = this;
	if(winningPlayerId == 1 || winningPlayerId == 3) {
		me.teamOneTricks++;
	} else {
		me.teamTwoTricks++;
	}
};


Round.prototype.isTheRoundOver = function isTheRoundOver() {
	var me = this;

	if(me.teamOneTricks + me.teamTwoTricks === 5) {
		console.log("ROUND OVER 5 tricks")
		return true;
	} else if(me.teamOneTricks >= 3 && me.teamTwoTricks >= 1) {
		console.log("ROUND OVER one beat two")
		return true;
	} else if(me.teamTwoTricks >= 3 && me.teamOneTricks >= 1) {
		console.log("ROUND OVER two beat one")
		return true;
	} else {
		return false;
	}
};

function Trick(options) {
	var me = this;
	if(!options) {
		options = {};
	}
	me.cardsPlayedByPlayerId = options.cardsPlayedByPlayerId || {};	
	me.numOfCardsPlayed = 0;
	me.trumpSuit = options.trumpSuit;
	me.trickSuit = options.trickSuit;
}

Trick.prototype.findWinningPlayerAndCard = function findWinningPlayerAndCard() {
	var me = this;
	var highestCardValue = -1;
	var highestCardPlayerId;
	Object.keys(me.cardsPlayedByPlayerId).forEach(function(playerId) {
		var playerCard = me.cardsPlayedByPlayerId[playerId];
		var playerCardValue = playerCard.getNumericValue(me.trumpSuit, me.trickSuit);
		if(playerCardValue > highestCardValue) {
			highestCardValue = playerCardValue;
			highestCardPlayerId = playerId;
		}
	});
	return {
		playerId: highestCardPlayerId,
		card: me.cardsPlayedByPlayerId[highestCardPlayerId]
	};
};


function makePlayerResponse(player) {
	return player;
}

function getOtherPlayers(thisPlayer, table) {
	return table.players.filter(function(p) { return p.id !== thisPlayer.id; });
}

function makeOtherPlayerResponse(players) {
	return players.map(function(player) {
		var noDataHand = { cards: player.hand.cards.map(function(card) { 
			return  { 
				value: -1 
			}
		})};
		return {
			hand: noDataHand,
			name: player.name,
			id: player.id,
			team :player.team,
			assigned: player.assigned,
			isLeader: player.isLeader,
			isDealer: player.isDealer,
			playedCard: player.playedCard,
			isMyTurn: player.isMyTurn
		};
	});
}



function getNextTurnPlayer(currentPlayerId, players) {
	var nextPlayerId = (+currentPlayerId) + 1;
	if(+nextPlayerId > 4) {
		nextPlayerId = 1;
	}
	var nextPlayer;
	players.some(function(p) {
		if(p.id == nextPlayerId) {
			nextPlayer = p;
			return true;
		}
	});
	return nextPlayer;
	
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function findGameLobbyById(id) {
    var lobby = gameLobbies.filter(function(lobby) {
    	return lobby.id === id;
    });
    lobby = lobby.length ? lobby[0] : [];
    return lobby;
}


function GameLobby(options) {
	var me = this;
	me.gameInfo =  {
		deckRange: ['9','10','j','q','k','a'],
		handSize: 5,
		teams: 2,
		teamSize: 2
	};
	me.table = options.table;
	me.id = uuid.v1();
}

GameLobby.prototype.init = function init(options) {
	var me = this;
	me.table = new Table({
		gameInfo: me.gameInfo,		
	});
	me.table.init();
}

GameLobby.prototype.startGame = function startGame(options) {
	var me = this;
	me.assignDealer();	
	me.table.deal();
	me.table.deck.revealTopCard();	
};

GameLobby.prototype.assignDealer = function assignDealer() {
	var me = this;
};


function Table(options) {
	var me = this;
	if(!options) {
		options = {};
	}
	me.deck = null;
	me.gameStarted = false;
	me.players = options.players || [
		new gameViewModels.Player({ name: "Player 1", id: 1, assigned: false, team: 1, isLeader: true}),
		new gameViewModels.Player({ name: "Player 2", id: 2, assigned: false, team: 2}),
		new gameViewModels.Player({ name: "Player 3", id: 3, assigned: false, team: 1}),
		new gameViewModels.Player({ name: "Player 4", id: 4, assigned: false, team: 2})
	];
	me.gameInfo = options.gameInfo;
	me.deck = new Deck(options);
	me.round = options.round;
	me.teamOneScore = 0;
	me.teamTwoScore = 0;
	me.currentDealerId;
}

Table.prototype.init = function init(options) {
	var me = this;
	me.deck.init({
		range: me.gameInfo.deckRange
	});
};

Table.prototype.updateTrickSuitAndClients = function updateTrickSuitAndClients(card, room) {
	var me = this;

	var trumpPairs = {
		"hearts": "diamonds",
		"diamonds": "hearts",
		"clubs": "spades",
		"spades": "clubs"
	};
	//ITS THE LEFT
	var trickSuit = card.suit;
	if(card.value === "j" && card.suit === trumpPairs[me.round.trumpSuit]) {
		trickSuit = me.round.trumpSuit;
	}

	me.round.trickSuit = trickSuit;
	me.round.currentTrick.trickSuit = trickSuit;
	io.sockets.in(room).emit("trickSuitGiven", trickSuit);
};


Table.prototype.updateScores = function updateScores(room) {
	var me = this;

	if(me.round.teamOneTricks === 5) {
		me.teamOneScore += 2;
	} else if(me.round.teamTwoTricks === 5) {
		me.teamTwoScore += 2;
	} else if(me.round.teamOneTricks >= 3 && me.round.teamTwoTricks >= 1) {
		me.teamOneScore += 1;
	} else if(me.round.teamTwoTricks >= 3 && me.round.teamOneTricks >= 1) {
		me.teamTwoScore += 1;
	} else { //TODO GO ALONE + EUKER
	}

	io.sockets.in(room).emit("updateScores", JSON.stringify({ teamOneScore: me.teamOneScore, teamTwoScore: me.teamTwoScore }));
};

Table.prototype.deal = function deal() {
	var me = this;
	me.deck.reset();
	me.deck.shuffle();
	me.deck.shuffle();
	me.players.forEach(function(player) {
		player.hand.cards = [];
		var cNum = 0;
		for(cNum = 0 ; cNum < me.gameInfo.handSize ; cNum++) {
			var deckCard = me.deck.pop();
			player.hand.addCard(deckCard);
		}
	})
};

Table.prototype.getNextAvailablePlayer = function getNextAvailablePlayer(player) {
	var me = this;
	var nextPlayer = null;
	me.players.some(function(player) {
		if(!player.assigned) {
			player.assigned = true;
			nextPlayer = player;
			return true;
		}
	});
	return nextPlayer;
};



function Deck(optoins) {
	var me = this;
	me.suits = ["clubs", "hearts", "spades", "diamonds"];
	me.referenceCards = [];
	me.cards = [];
}

Deck.prototype.init = function init(options) {
	var me = this;
	me.range = options.range;
	me.range.forEach(function(cardType) {
		me.suits.forEach(function(suit) {
			var newCard = new gameViewModels.Card({
				suit: suit,
				value: cardType,
			});
			var newReferenceCard = newCard.clone();
			me.referenceCards.push(newReferenceCard);
			me.cards.push(newCard);
		});
	});

	//feeling lucky
	me.shuffle();
	me.shuffle();
}

Deck.prototype.shuffle = function shuffle(shuffledIndicies) {
	var me = this;

    for (var i = me.cards.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = me.cards[i];
        me.cards[i] = me.cards[j];
        me.cards[j] = temp;
    }
};
Deck.prototype.reset = function reset() {
	var me = this;
	me.cards = [];
	me.referenceCards.forEach(function(ref) {
		me.cards.push(new gameViewModels.Card(ref));
	});
};

Deck.prototype.pop = function pop() {
	var me = this;
	return me.cards.shift();
};

Deck.prototype.revealTopCard = function revealTopCard(user) {
	var me = this;
	if(me.cards.length) {
		return me.cards[0].revealTo(user);
	}
};

