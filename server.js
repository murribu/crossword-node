var app = require('http').createServer(handler),
  io = require('socket.io').listen(app),
  fs = require('fs'),
  mysql = require('mysql'),
  Future = require('fibers/future'),
  connectionsArray = [],
  config = require('./config'),
  connection = mysql.createConnection({
    host: config.host,
    user: config.user,
    password: config.password,
    database: config.database,
    port: 3306
  }),
  POLLING_INTERVAL = 3000,
  pollingTimer,
  port = 8001;
  
// If there is an error connecting to the database
connection.connect(function(err) {
  // connected! (unless `err` is set)
  if (err) {
    console.log(err);
  }
});

// creating the server ( localhost:port )
app.listen(port);

// on server started we can load our client.html page
function handler(req, res) {
  fs.readFile(__dirname + '/client.html', function(err, data) {
    if (err) {
      console.log(err);
      res.writeHead(500);
      return res.end('Error loading client.html');
    }
    res.writeHead(200);
    res.end(data);
  });
}

/*
 *
 * HERE IT IS THE COOL PART
 * This function loops on itself since there are sockets connected to the page
 * sending the result of the database query after a constant interval
 *
 */

var queryDB = function(socket, interval) {

  // Doing the database query
  
  if (socket.handshake.query.slug){
      var query = connection.query('SELECT row, col, updated_timestamp_utc FROM crossword2.puzzle_helper_squares where puzzle_id in (select id from puzzles where slug = ?) and updated_timestamp_utc > ?', [socket.handshake.query.slug,  socket.latest_timestamp]),
      newsquares = []; // this array will contain the result of our db query

      // setting the query listeners
      query
        .on('error', function(err) {
          // Handle error, and 'end' event will be emitted after this as well
          console.log(err);
          socket.emit('notification', err);
        })
        .on('result', function(puzzle_helper_square) {
          // it fills our array looping on each user row inside the db
          newsquares.push(puzzle_helper_square);
          
        })
        .on('end', function() {
          // loop on itself only if there are sockets still connected
          if (newsquares.length > 0){
            var data = {
                newsquares: newsquares
            };
            for(s in newsquares){
                if (newsquares[s].updated_timestamp_utc > connectionsArray[socket.handshake.query.slug].latest_timestamp){
                    connectionsArray[socket.handshake.query.slug].latest_timestamp = newsquares[s].updated_timestamp_utc;
                }
            }
            data.time = new Date();
            socket.emit('notification', data);
          }
        });
  }
};

var pollingLoop = function(interval){
    for (s in connectionsArray){
      queryDB(connectionsArray[s], interval);
    }
    var pollingTimer = setTimeout(function(){
      pollingLoop(interval);
    }, interval);
}

// creating a new websocket to keep the content updated without any AJAX request
io.sockets.on('connection', function(socket) {

  //console.log("Query: ", socket.handshake.query);
  if (socket.handshake.query.slug){
    console.log('A new socket is connected! (' + socket.handshake.query.slug + ')');
    socket.latest_timestamp = 0;
    connectionsArray[socket.handshake.query.slug] = socket;
    connectionsArray[socket.handshake.query.slug].squares = [];
    console.log('puzzle:' + connectionsArray[socket.handshake.query.slug].handshake.query.slug);
    if (Object.keys(connectionsArray).length == 1){
      pollingLoop(POLLING_INTERVAL);
    }
  }
  
  console.log('Number of connections:' + Object.keys(connectionsArray).length);

  socket.on('disconnect', function() {
    var socketIndex = socket.handshake.query.slug;
    console.log('socketID = %s got disconnected', socketIndex);
    delete connectionsArray[socket.handshake.query.slug];
  });

});

console.log('Please use your browser to navigate to http://localhost:' + port);
