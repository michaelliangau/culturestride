// ************************ PRODUCTION VARIABLE ***********************
var production = process.env.PROD_VARIABLE; // 0 for development and 1 for production
// ************************ PRODUCTION VARIABLE ***********************

if (process.env.NODE_ENV == "development") {
  require('dotenv').config(); //need this for environment variables
}

if (production == 1) { // PRODUCTION CODE - (Michael has no idea what this actually does, but it works so 🤷)
  console.log('Production mode is engaged');
  // Include the cluster modulesdf
  var cluster = require('cluster');
  if (cluster.isMaster) { // Code to run if we're in the master process
    // Count the machine's CPUs
    var cpuCount = require('os').cpus().length;
    // Create a worker for each CPU
    for (var i = 0; i < cpuCount; i += 1) {
      cluster.fork();
    }
    // Listen for terminating workers
    cluster.on('exit', function (worker) {
      // Replace the terminated workers
      console.log('Worker ' + worker.id + ' died :(');
      cluster.fork();
    });
  } else { // Code to run if we're in a worker process
    // Required npm modules
    var AWS = require('aws-sdk');
    var express = require('express');
    var bodyParser = require('body-parser');
    var path = require('path');
    var favicon = require('serve-favicon');
    var logger = require('morgan');
    var cookieParser = require('cookie-parser');
    var expressLayouts = require('express-ejs-layouts');
    var session = require('express-session'); // sessions allows us to store user data on client browser cache
    const socket = require("socket.io");
    var dbjsMethods = require("./db.js");
    var customMethods = require("./custom.js");
    var linkifyStr = require('linkifyjs/string');
    var cron = require('node-cron');
    var moment = require('moment');
    var mysql = require('mysql'); // session store
    var MySQLStore = require('express-mysql-session')(session); // session store 

    // this is for session store - allows us to persist sessions past a restart of the app
    var config = {
      host: process.env.AWS_DB_LINK,
      user: 'admin',
      password: process.env.PROD_DB_PWD,
      database: 'culturestride',
      port: 3306,
      ssl: false
    };
    const conn = new mysql.createConnection(config);
    var sessionStore = new MySQLStore({} /* session store options */ , conn);

    // application code
    var routes = require('./routes/index'); // define index.js as the file for all web appget and post routes
    AWS.config.region = process.env.REGION // configure AWS region
    var app = express(); // start the express app
    app.use(function (req, res, next) { // force redirect all web app get requests to turn into https (secure website)
      if ((req.get('X-Forwarded-Proto') !== 'https')) {
        res.redirect('https://' + req.get('Host') + req.url);
      } else
        next();
    });
    app.use(favicon(path.join(__dirname, 'public/img', 'favicon.ico'))); // set the favicon (little fish icon in your chrome tabs)
    app.use(session({ // enable sessions which enable us to store data in client browser cache using req.session.SOMEVARIABLE - look at https://stackoverflow.com/questions/46630368/how-to-extend-express-session-timeout
      secret: process.env.COOKIE_SESSION_KEY,
      cookie: {
        maxAge: 365 * 24 * 60 * 60 * 1000
      },
      store: sessionStore,
    })); // setting secret key, cookie lasts x milliseconds

    // other config stuff - TBH I don't really know what this does but it works so yeet 🤷
    app.set('view engine', 'ejs');
    app.use(expressLayouts);
    app.use(logger('dev'));
    app.set('views', __dirname + '/views');
    app.use(bodyParser.json({
      verify: function (req, res, buf) {
        var url = req.originalUrl;
        if (url.startsWith('/stripe-webhook'))
          req.rawBody = buf.toString();
      }
    }));
    app.use(bodyParser.urlencoded({
      limit: '10mb',
      extended: false // its false because of stripe thing ican't remember?
    }));
    app.use(cookieParser());
    app.use(express.static(path.join(__dirname, 'public')));

    app.use('/', routes); // push all web requests to the index.js file for get/post request routing

    // start the app
    var port = process.env.PORT || 3000;
    var server = app.listen(port, function () {
      console.log('Server running at http://127.0.0.1:' + port + '/');
    });


    // Socket setup
    const io = socket(server, {
      transports: ['websocket', 'polling']
    });

    const activeUsers = new Set();


    io.on("connection", function (socket) {
      console.log("Made socket connection");

      socket.on("new user", function (data) {
        socket.userId = data;
        activeUsers.add(data);
      });

      socket.on("join notif channel", function (slug) {
        var notifChannel = 'notif' + slug;
        socket.join(notifChannel);
        console.log(slug + ' joined notif channel: ' + notifChannel)

      });

      socket.on("disconnect other active sockets", function (data) {
        if (io.sockets.connected[data]) {
          io.sockets.connected[data].disconnect();
        }
      });


      socket.on('room', function (room, slug) {
        console.log(slug + ' joined room ' + room);
        socket.join(room);

        // turn all messages sent by other people into read
        dbjsMethods.getMessagesSentByOtherPeople(slug, room, function (messageData) {
          // combine it all into an array
          var sohoEIDArr = [];
          for (var i = 0; i < messageData.length; i++) {
            sohoEIDArr.push(messageData[i].sohoEID);
          }

          if (sohoEIDArr.length > 0) { // so app doesn't crash if there's no messages to update
            dbjsMethods.updateStateOfMessagesToRead(sohoEIDArr); // update state of all these messages to read
          }
        });

      });

      socket.on("disconnect", () => {
        activeUsers.delete(socket.userId);
        io.emit("user disconnected", socket.userId);
      });

      socket.on("chat message", function (data) {
        var messageType = data.messageType;

        if (messageType == 'text') {
          var message = linkifyStr(data.content); // convert urls to hyperlinks
          message = customMethods.nl2br(message); // convert \n to <br>
          data.content = message; // replace message with linkified message
        } else if (messageType == 'audio') {
          var message = data.content;
        }

        // Send email if necessary
        dbjsMethods.getLastMessage(data.room, function (messageData) {
          dbjsMethods.getRoomUsers(data.room, function (userData) {
            var activeUsersArr = (Array.from(activeUsers));

              if (messageData.length > 0) {
                var lastMessageTS = moment(messageData[0].ts);
                console.log("file: app.js ~ line 203 ~ lastMessageTS", lastMessageTS)
                var now = moment().utc();
                console.log("file: app.js ~ line 204 ~ now", now)
                var diff = now.diff(lastMessageTS, 'minutes')
                console.log("file: app.js ~ line 207 ~ diff", diff)
                if (diff > 10) { // check if time now is greater than 10 mins from last message
                  for (var i = 0; i < userData.length; i++) {
                    if (userData[i].slug != data.sender) { // if the user in room is not the sender then send email
                      if (!activeUsersArr.includes(userData[i].slug)) { // if they're offline then send email
                        dbjsMethods.getEmailAddressBySlug(userData[i].slug, function (emailData) { // get email address of user
                          dbjsMethods.getEmailAddressBySlug(data.sender, function (senderData) { // get email address of user
                            try {
                              if (emailData[0].source == 'students') { // the email is going out to a teacher
                                var receiverType = 'student';
                              } else { // the email is going out to a teacher
                                var receiverType = 'teacher';
                              }
                              throttle(customMethods.sendMessageNotificationEmail(receiverType, emailData[0].firstName, emailData[0].email, senderData[0].firstName, senderData[0].lastName, message), 5000);
                            } catch (e) {
                              console.log(e);
                            }

                          });
                        });
                      }
                    }
                  }

                }
              } else { // first message - send an email to all other users in room that is not sender
                for (let i = 0; i < userData.length; i++) {
                  if (userData[i].slug != data.sender) { // if the user in room is not the sender then send email
                    dbjsMethods.getEmailAddressBySlug(userData[i].slug, function (emailData) { // get email address of user
                      dbjsMethods.getEmailAddressBySlug(data.sender, function (senderData) { // get email address of user
                        try {
                          if (emailData[0].source == 'students') { // the email is going out to a teacher
                            var receiverType = 'student';
                          } else { // the email is going out to a teacher
                            var receiverType = 'teacher';
                          }
                          throttle(customMethods.sendMessageNotificationEmail(receiverType, emailData[0].firstName, emailData[0].email, senderData[0].firstName, senderData[0].lastName, message), 5000);
                        } catch (e) {
                          console.log(e);
                        }

                      });
                    });

                  }
                }

              }
              // send notifications to all permitted users that are not the sender
              var userDataNoSender = userData.filter(function (permittedUsers) { // give me an array of users withou the sender
                return permittedUsers.slug != data.sender;
              });
              for (var j = 0; j < userDataNoSender.length; j++) {
                var notifRoom = 'notif' + userDataNoSender[j].slug;
                io.in(notifRoom).emit("notif unread message", data.room);
                console.log('notification sent to: ' + notifRoom)
              }



            // save chat to database to messages table
            var state = 'sent';
            dbjsMethods.saveMessageforChat(data.room, data.sender, message, state, messageType);
            data.ts = new Date();
            io.in(data.room).emit("chat message", data);
            // emit notification to the notif channels of all users in the permitteduser array in sohoroom
            console.log('data emitted to room: ' + JSON.stringify(data));


          });
        });


      });

      socket.on("typing", function (data) {
        socket.broadcast.emit("typing", data);
      });
    });

    function throttle(func, timeFrame) {
      var lastTime = 0;
      return function () {
        var now = new Date();
        if (now - lastTime >= timeFrame) {
          func();
          lastTime = now;
        } else {}
      };
    }

    module.exports = app;
  }
} else { // DEVELOPMENT MODE
  console.log('Development mode is engaged');
  // Required npm modules
  var express = require('express');
  var path = require('path');
  var favicon = require('serve-favicon');
  var logger = require('morgan');
  var cookieParser = require('cookie-parser');
  var bodyParser = require('body-parser');
  var expressLayouts = require('express-ejs-layouts');
  var session = require('express-session'); // sessions allows us to store user data on client browser cache
  const socket = require("socket.io");
  var dbjsMethods = require("./db.js");
  var customMethods = require("./custom.js");
  var linkifyStr = require('linkifyjs/string');
  var cron = require('node-cron');
  var moment = require('moment');
  var mysql = require('mysql'); // session store
  var MySQLStore = require('express-mysql-session')(session); // session store

  // this is for session store - allows us to persist sessions past a restart of the app
  var config = {
    host: 'localhost',
    user: 'root',
    password: process.env.LOCAL_DB_PWD, // add your own password
    database: 'projectmalindb',
    port: 3306,
    ssl: false
  };
  const conn = new mysql.createConnection(config);
  var sessionStore = new MySQLStore({} /* session store options */ , conn);

  // application code
  var routes = require('./routes/index'); // define index.js as the file for all web appget and post routes
  var app = express(); // start the express app
  app.use(favicon(path.join(__dirname, 'public/img', 'favicon.ico'))); // set the favicon (little fish icon in your chrome tabs)
  app.use(session({ // enable sessions which enable us to store data in client browser cache using req.session.SOMEVARIABLE - look at https://stackoverflow.com/questions/46630368/how-to-extend-express-session-timeout
    secret: process.env.COOKIE_SESSION_KEY,
    cookie: {
      maxAge: 365 * 24 * 60 * 60 * 1000
    },
    store: sessionStore,
  })); // setting secret key, cookie lasts x milliseconds

  // other config stuff - TBH I don't really know what this does but it works so yeet 🤷
  app.set('view engine', 'ejs'); // set up view engine to use ejs
  app.use(expressLayouts);
  app.listen(3000);
  app.use(logger('dev'));
  app.use(bodyParser.json({
    verify: function (req, res, buf) {
      var url = req.originalUrl;
      if (url.startsWith('/stripe-webhook'))
        req.rawBody = buf.toString();
    }
  }));

  app.use(bodyParser.urlencoded({
    limit: '10mb',
    extended: false // its false because of stripe thing ican't remember?
  }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/', routes); // push all web requests to the index.js file for get/post request routing

  app.use(function (req, res, next) { // catch 404 and forward to error handler
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
  });

  // error handlers - Michael doesn't know what this does but it works so ok

  // development error handler
  // will print stacktrace
  if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
      res.status(err.status || 500);
      res.render('error', {
        message: err.message,
        error: err,
        layout: 'error'
      });
    });
  }

  // production error handler
  // no stacktraces leaked to user
  app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: {},
      layout: 'layout'
    });
  });

  // Start the server on port 1337. You can access the app on localhost:1337 in your browser
  var port = 1337;
  const server = app.listen(port, function () {
    console.log('app started');
  });

  // Socket setup
  const io = socket(server, {
    transports: ['websocket', 'polling']
  });

  const activeUsers = new Set();


  io.on("connection", function (socket) {
    console.log("Made socket connection");

    socket.on("new user", function (data) {
      socket.userId = data;
      activeUsers.add(data);
    });

    socket.on("join notif channel", function (slug) {
      var notifChannel = 'notif' + slug;
      socket.join(notifChannel);
      console.log(slug + ' joined notif channel: ' + notifChannel)

    });

    socket.on("disconnect other active sockets", function (data) {
      if (io.sockets.connected[data]) {
        io.sockets.connected[data].disconnect();
      }
    });


    socket.on('room', function (room, slug) {
      console.log(slug + ' joined room ' + room);
      socket.join(room);

      // turn all messages sent by other people into read
      dbjsMethods.getMessagesSentByOtherPeople(slug, room, function (messageData) {
        // combine it all into an array
        var sohoEIDArr = [];
        for (var i = 0; i < messageData.length; i++) {
          sohoEIDArr.push(messageData[i].sohoEID);
        }

        if (sohoEIDArr.length > 0) { // so app doesn't crash if there's no messages to update
          dbjsMethods.updateStateOfMessagesToRead(sohoEIDArr); // update state of all these messages to read
        }
      });

    });

    socket.on("disconnect", () => {
      activeUsers.delete(socket.userId);
      io.emit("user disconnected", socket.userId);
    });

    socket.on("chat message", function (data) {
      var messageType = data.messageType;

      if (messageType == 'text') {
        var message = linkifyStr(data.content); // convert urls to hyperlinks
        message = customMethods.nl2br(message); // convert \n to <br>
        data.content = message; // replace message with linkified message
      } else if (messageType == 'audio') {
        var message = data.content;
      }

      // Send email if necessary
      dbjsMethods.getLastMessage(data.room, function (messageData) {
        dbjsMethods.getRoomUsers(data.room, function (userData) {
          var activeUsersArr = (Array.from(activeUsers));

            if (messageData.length > 0) {
              var lastMessageTS = moment(messageData[0].ts);
              var now = moment().utc();
              var diff = now.diff(lastMessageTS, 'minutes')
              if (diff > 10) { // check if time now is greater than 10 mins from last message
                for (var i = 0; i < userData.length; i++) {
                  if (userData[i].slug != data.sender) { // if the user in room is not the sender then send email
                    if (!activeUsersArr.includes(userData[i].slug)) { // if they're offline then send email
                      dbjsMethods.getEmailAddressBySlug(userData[i].slug, function (emailData) { // get email address of user
                        dbjsMethods.getEmailAddressBySlug(data.sender, function (senderData) { // get email address of user
                          try {
                            if (emailData[0].source == 'students') { // the email is going out to a teacher
                              var receiverType = 'student';
                            } else { // the email is going out to a teacher
                              var receiverType = 'teacher';
                            }
                            throttle(customMethods.sendMessageNotificationEmail(receiverType, emailData[0].firstName, emailData[0].email, senderData[0].firstName, senderData[0].lastName, message), 5000);
                          } catch (e) {
                            console.log(e);
                          }

                        });
                      });
                    }
                  }
                }

              }
            } else { // first message - send an email to all other users in room that is not sender
              for (let i = 0; i < userData.length; i++) {
                if (userData[i].slug != data.sender) { // if the user in room is not the sender then send email
                  dbjsMethods.getEmailAddressBySlug(userData[i].slug, function (emailData) { // get email address of user
                    dbjsMethods.getEmailAddressBySlug(data.sender, function (senderData) { // get email address of user
                      try {
                        if (emailData[0].source == 'students') { // the email is going out to a teacher
                          var receiverType = 'student';
                        } else { // the email is going out to a teacher
                          var receiverType = 'teacher';
                        }
                        throttle(customMethods.sendMessageNotificationEmail(receiverType, emailData[0].firstName, emailData[0].email, senderData[0].firstName, senderData[0].lastName, message), 5000);
                      } catch (e) {
                        console.log(e);
                      }

                    });
                  });

                }
              }

            }
            // send notifications to all permitted users that are not the sender
            var userDataNoSender = userData.filter(function (permittedUsers) { // give me an array of users withou the sender
              return permittedUsers.slug != data.sender;
            });
            for (var j = 0; j < userDataNoSender.length; j++) {
              var notifRoom = 'notif' + userDataNoSender[j].slug;
              io.in(notifRoom).emit("notif unread message", data.room);
              console.log('notification sent to: ' + notifRoom)
            }


          // save chat to database to messages table
          var state = 'sent';
          dbjsMethods.saveMessageforChat(data.room, data.sender, message, state, messageType);
          data.ts = new Date();
          io.in(data.room).emit("chat message", data);
          // emit notification to the notif channels of all users in the permitteduser array in sohoroom
          console.log('data emitted to room: ' + JSON.stringify(data));


        });
      });


    });

    socket.on("typing", function (data) {
      socket.broadcast.emit("typing", data);
    });
  });

  function throttle(func, timeFrame) {
    var lastTime = 0;
    return function () {
      var now = new Date();
      if (now - lastTime >= timeFrame) {
        func();
        lastTime = now;
      } else {}
    };
  }

  module.exports = app;
}