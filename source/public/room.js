var me = this;

me.user = new User({
	socket: io()
});

me.players = [
	new Player({ name: "Player 1", id: 1, assigned: false, team: 1, isLeader: true}),
	new Player({ name: "Player 2", id: 2, assigned: false, team: 2}),
	new Player({ name: "Player 3", id: 3, assigned: false, team: 1}),
	new Player({ name: "Player 4", id: 4, assigned: false, team: 2})
];
me.trump = ko.observable("");
me.tableViewModel = null;
me.gameStarted = ko.observable(false);
me.roundStarted = ko.observable(false);
me.trickWinners = ko.observableArray([]);
var roomName = window.location.pathname.split("/");
roomName = roomName.length >= 2 ? roomName[2] : "default";

me.isLoaded = ko.observable(false);

me.user.socket.emit("tryAndJoinRoom", roomName);
me.user.socket.on("roomFull", function(room) {
	alert("Room '" + room + "'' is full. You stink");
	window.location = "/";
});		

me.user.socket.on("joinedRoom", function(lobbyInfo) {	

	var lobbyInfo = JSON.parse(lobbyInfo);
	me.gameStarted(lobbyInfo.gameStarted);
	me.user.gameLobbyId = lobbyInfo.gameLobbyId;
	var tableData = lobbyInfo.tableData;
	me.user.player = new Player(tableData.player);	
	if(me.user.player.id === 4 && !me.gameStarted()) {
		me.user.socket.emit("startGame");
	}

	var otherPlayers = tableData.otherPlayers.map(function(p) { return new Player(p); });

	me.tableViewModel = new TableViewModel({
		player: me.user.player,
		otherPlayers: otherPlayers
	});

	me.tableViewModel.player.hand.cards.subscribe(function(changes) {
		changes.forEach(function(change) {
			if (change.status === 'deleted') {
				var card = ko.mapping.toJS(change.value);
				me.tableViewModel.player.playedCard(card);

				var cardForServer = card;
				var playerId = me.tableViewModel.player.id();
				me.tableViewModel.player.isMyTurn(false);
				me.user.socket.emit("playCard", JSON.stringify({
					card: cardForServer,
					playerId: playerId
				}));
			}			
		});
	}, null, "arrayChange");

	me.isLoaded(true);	
});

me.user.socket.on("newRound", function(playerData) {
	playerData = JSON.parse(playerData);
	me.tableViewModel.update(playerData);
	me.tableViewModel.player.playedCard(null);
	me.gameStarted(true);
	me.roundStarted(false);
});


me.user.socket.on("othersJoined", function(otherPlayers) {
	otherPlayers = JSON.parse(otherPlayers);
	me.tableViewModel.updateOtherPlayers(otherPlayers);
});

me.user.socket.on("cardPlayed", function(playerIdAndCard) {
	playerIdAndCard = JSON.parse(playerIdAndCard);
	var card = playerIdAndCard.card;
	var playerId = playerIdAndCard.playerId;
	var otherPlayerWhoPlayedCard;
	me.tableViewModel.otherPlayers().forEach(function(player) {
		if(ko.unwrap(player.id) === playerId) {
			player.hand.cards.pop();
			player.playedCard(new Card(card));
		}
	});
});

me.user.socket.on("nextTurn", function(playerId) {
	if(me.tableViewModel.player.id() == playerId) {
		me.tableViewModel.player.isMyTurn(true);
	} else {
		me.tableViewModel.otherPlayers().forEach(function(p) {
			if(p.id() == playerId) {
				p.isMyTurn(true);
			} else {
				p.isMyTurn(false);
			}
		});
	}
});

me.user.socket.on("nextTrick", function(playerId) {
	me.tableViewModel.player.playedCard(null);
	me.tableViewModel.otherPlayers().forEach(function(p) {
		p.playedCard(null);
	});
	if(me.tableViewModel.player.id() == playerId) {
		me.tableViewModel.player.isMyTurn(true);
	}
});

me.user.socket.on("trumpSuitGiven", function(trumpSuit) {
	me.tableViewModel.trumpSuit(trumpSuit);
});

me.user.socket.on("trickSuitGiven", function(trickSuit) {
	me.tableViewModel.trickSuit(trickSuit);
});

me.user.socket.on("trickWinner", function(trickWinner) {
	var winner = JSON.parse(trickWinner);
	me.trickWinners([]);
	me.trickWinners.push({
		playerId: winner.trickWinner.playerId,
		value: winner.trickWinner.card.value,
		suit: winner.trickWinner.card.suit,
		p1: winner.playerCards[0],
		p2: winner.playerCards[1],
		p3: winner.playerCards[2],
		p4: winner.playerCards[3]
	});
});

me.user.socket.on("updateScores", function(scores) {
	var newScores = JSON.parse(scores);
	console.log(newScores);
	me.tableViewModel.teamOneScore( me.tableViewModel.teamOneScore() + newScores.teamOneScore);
	me.tableViewModel.teamTwoScore(me.tableViewModel.teamTwoScore() + newScores.teamTwoScore);
});

ko.applyBindings();


function User(options) {
	var me = this;
	me.socket = options.socket;
	me.player = options.player;
	me.gameLobbyId = options.gameLobbyId;
}

