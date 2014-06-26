var socketio = require('socket.io');
var express = require('express');
var http = require('http');
var path = require('path');
var morgan  = require('morgan');

var app = express();

app.use(morgan())
app.use(express.static(path.join(__dirname, '..', 'build')));

var port = process.env.PORT || 3000;
var server = http.createServer(app).listen(port);
var io = socketio.listen(server);

console.log('Running on port %d', port);

var rooms = {};
io.sockets.on('connection', function(socket) {
  // Store the current code
  socket.on('refresh', function(data) {
    rooms[socket.room].body = data.body;
  });

  // Re-broadcast selection events
  socket.on('selection', function(data) {
    socket.broadcast.to(socket.room).emit('selection', data);
  });
  
  // Re-broadcast change events
  socket.on('change', function(op) {
    socket.broadcast.to(socket.room).emit('change', op);
  });
  
  // Re-broadcast changeLanguage events
  socket.on('changeLanguage', function(data) {
    socket.broadcast.to(socket.room).emit('changeLanguage', data);
  });
  
  // Re-broadcast change events
  socket.on('hello', function(data) {
    // Store room on socket
    socket.room = data.room;

    // Create room object
    rooms[socket.room] = rooms[socket.room] || { body: '\n' };

    // Join room
    socket.join(socket.room);

    // Send the current code to the client
    socket.emit('refresh', {
      user: 'server',
      body: rooms[socket.room].body
    });

    socket.broadcast.to(socket.room).emit('hello', {
      user: data.user
    });

    console.log('%s has joined %s', data.user, socket.room);
  });
});
