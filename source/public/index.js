var me = this;
var socket = io();
console.log("socket that connected's id:", socket.id);
me.userName = "USER_"+(Math.floor(Math.random() * 100)).toString();

me.roomTitle = ko.observable("");
me.roomTitle.subscribe(function(value) {
	if(value) {
		window.location = "/room/" + value;
	}
});

me.buttonFxn = function buttonFxn() {
	socket.emit("globalChat", "cat");
}

ko.applyBindings();



//join Room, socket.join's a Room
//leave / switch rooms, socket.leave's current room.