// NPM Modules
var path = require('path'); // used to require a file that is in the same directory (dbjs and customjs)
var dbjsMethods = require(path.resolve(__dirname, "./db.js")); // dbjs methods can be accessed via dbjsMethods var
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
var cron = require('node-cron');
const {
  google
} = require('googleapis');
const fs = require('fs');
const readline = require('readline');
var moment = require('moment');
const AWS = require('aws-sdk');

const SES_CONFIG = {
    accessKeyId: process.env.SES_ACCESS_KEY_ID,
    secretAccessKey: process.env.SES_ACCESS_KEY,
    region: 'ap-southeast-2',
};

const AWS_SES = new AWS.SES(SES_CONFIG);

// GCAL STUFF
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TOKEN_PATH = 'token.json';

function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}





module.exports = { // this function allows these methods to be accessed anywher ein the app  
  btnCSS: function () {
    var btnCSS = `display: inline-flex; width: fit-content; position: relative; top: -3px; padding: 16px 20px; background: #4950F6; height: 48px; text-align: center; white-space: nowrap; cursor: pointer; justify-content: center; font-size: 14px; letter-spacing: 0px; font-weight: 700; text-transform: uppercase; line-height: 16px; text-decoration: none !important; font-family: sans-serif; color: #fff !important; transition: background .15s ease; border-radius: 10px; height: 1rem; font-size: 12px;font-weight: 700;`;
    return (btnCSS);
  },
  signature: function () {
    var sig = `<table><tbody><tr> <td class="avatar" style="width: 75px;" width="75"><img src="https://firebasestorage.googleapis.com/v0/b/createasignature.appspot.com/o/images%2Fcslogotrans.png?alt=media&amp;token=9aa3f8c7-145d-425a-9f5d-5da29c164ba7" style="background-color: #ffffff; display: block; height: 75px; width: 75px; border-radius: 75px; margin-bottom: 10px;" width="75" height="75"></td> </tr></tbody></table>`;
    return (sig);
  },
  nl2br: function (str, is_xhtml) {
    var breakTag = (is_xhtml || typeof is_xhtml === 'undefined') ? '<br ' + '/>' : '<br>';
    return (str + '').replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1' + breakTag + '$2');
  },
  youtube_parser: function (url) {
      var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
      var match = url.match(regExp);
      return (match&&match[7].length==11)? match[7] : false;
  },
  verifyjwtToken: function (res, jwtToken, callback) {
    jwt.verify(jwtToken, process.env.JWT_SECRET_KEY, function (err, authData) {
      if (err) {
        return res.redirect('/login');
      } else {
        return callback(authData);
      }
    })
  },
  verifyjwtTokenTea: function (res, jwtToken, callback) {
    jwt.verify(jwtToken, process.env.JWT_SECRET_KEY, function (err, authData) {
      if (err) {
        return res.redirect('/soho');
      } else {
        return callback(authData);
      }
    })
  },
  refreshSessionVars: function (req, callback) {
    var mom = moment().utc();
    var lastUpdated = moment(req.session.sessionLastUpdated, 'YYYY-MM-DDTHH:mm:ssZ').utc();
    var diff = mom.diff(lastUpdated, 'hours');

    if (diff > 1 || diff < 0 || !req.session.sessionLastUpdated) { // if more than 1 hr has passed or updated is in the future or if session is undefined then reload session variables
      req.session.sessionLastUpdated = moment().utc().format();
      dbjsMethods.getStudentClassForLogin(req.session.csStudentLoggedIn, function (studentClassData) {
        if (studentClassData.length > 0) {
          dbjsMethods.getLessonForLogin(studentClassData[0].sohoCID, function (lessonData) { // get the number of classes that have happened before NOW + 3 hours - in case ppl log in on the dot of the class and they need sth from onboarding
            dbjsMethods.getUnreadMessagesForLogin(req.session.csStudentSlug, function (messagesData) {
              dbjsMethods.getRoomForLogin(studentClassData[0].sohoCID, function (roomData) {
                dbjsMethods.getUnreadHWCount(req.session.csStudentClassID, function (hwData) {
                  var today = moment().utc().startOf('day').format(); // date only
                  dbjsMethods.getTimerForDay(today, studentClassData[0].sohoCID, function (timerData) {
                    dbjsMethods.getPracticalGroupsJoin(studentClassData[0].sohoCID, function (groupData) {
                        dbjsMethods.getPMIForClassroom(studentClassData[0].sohoCID, function (teacherPMIData) {

                          if (timerData.length > 0) {
                            req.session.sStudyTimer = timerData[0].time; // set study session time to previous value for today
                          } else {
                            req.session.sStudyTimer = 0; // no study has been done today
                          }


                           // theory meeting url
                           if (teacherPMIData.length > 0) {
                            req.session.theoryMeetingURL = teacherPMIData[0].videoConfPMI; // personal meeting room for teacher
                        }

                        // practical meeting urls
                        var practicalMeetingArr = [];
                        if (groupData.length > 0) {
                            for (let i = 0; i < groupData.length; i++) {
                                var options = {
                                    tz: 'UTC'
                                };

                                try {
                                    var interval = parser.parseExpression(groupData[i].start, options);
                                    var nextClass = interval.next().toISOString();
                                } catch (err) {
                                    console.log('Error: ' + err.message);
                                }

                                var practicalMeetingObj = {
                                    start: nextClass,
                                    sohoUID: groupData[i].sohoUID,
                                    groupName: groupData[i].groupName,
                                }
                                practicalMeetingArr.push(practicalMeetingObj);
                            }
                        }
                        req.session.practicalMeetingURL = practicalMeetingArr;


                          // set class session vars
                          if (studentClassData.length == 0) {
                            req.session.csStudentReadWriteHskLevel = 7;
                            req.session.csStudentListenSpeakHskLevel = 7;
                            req.session.csStudentClassLang = 'Mandarin'; // default for browsers
                            req.session.csStudentClassExist = 0;
                            req.session.csStudentClassID = 0; // set class id
                          } else {
                            if (studentClassData[0].classType == 'standard') {
                              req.session.csStudentClassType = 'standard';
                            } else { // free
                              req.session.csStudentShowOnboarding = 1; // this is a trial student
                              req.session.csStudentLessonCount = lessonData[0].count;
                              req.session.csStudentClassType = 'free';
                            }

                            if (lessonData[0].count == 0) { // show onboarding stuff if the student has never taken a class in the past
                              req.session.csStudentShowOnboarding = 1; // this is a trial student
                            } else {
                              req.session.csStudentShowOnboarding = 0; // this is not a trial student
                            }

                            req.session.csStudentUnreadMessages = messagesData[0].unreadMessagesCount;
                            req.session.csStudentReadWriteHskLevel = studentClassData[0].readWriteHSKLevel;
                            req.session.csStudentListenSpeakHskLevel = studentClassData[0].listenSpeakHSKLevel;
                            req.session.csStudentClassLang = studentClassData[0].lang; // assuming only 1 class for each student
                            req.session.csStudentClassExist = 1;
                            req.session.csStudentClassID = studentClassData[0].sohoCID; // set class id
                            req.session.csStudentCharType = studentClassData[0].charType; // char Type
                            if (roomData.length > 0) {
                              req.session.csStudentTeachingRoomID = roomData[0].sohoRID; // teaching room ID
                            }


                          }
                          // hw count
                          req.session.csStudentHWNotif = hwData[0].count;
                          return callback();

                        });
                    });
                  });
                });
              });
            });
          });
        }
      });
    } else {
      return callback();
    }
  },
  emailSohoUserthatForgotPassword: function (email, reqHeadersHost, token) {
    console.log('emailSohoUserthatForgotPassword is run');

        // Create sendEmail params 
  var params = {
    Destination: { /* required */
      ToAddresses: [
        email,
        /* more items */
      ]
    },
    Message: { /* required */
      Body: { /* required */
        Html: {
         Charset: "UTF-8",
         Data: '<html><p>You are receiving this email because you (or someone else) have requested the reset of the password for your account.<br><br>' +
         'Please click on the following link, or paste this into your browser to complete the process: ' +
         'http://' + reqHeadersHost + '/sohoreset/' + token + '<br><br>' +
         'If you did not request this, please ignore this email and your password will remain unchanged.</p></html>'
        }
       },
       Subject: {
        Charset: 'UTF-8',
        Data: 'Culturestride Password Reset'
       }
      },
    Source: 'Culturestride <michael@culturestride.com>', /* required */
    };
    // Create the promise and SES service object
  var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
  
  // Handle promise's fulfilled/rejected states
  sendPromise.then(
    function(data) {
      console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
    }).catch(
      function(err) {
      console.error(err, err.stack);
    });

    
  },
  emailStudentthatForgotPassword: function (email, reqHeadersHost, token) {
    console.log('emailSohoUserthatForgotPassword is run');    
        // Create sendEmail params 
  var params = {
    Destination: { /* required */
      ToAddresses: [
        email,
        /* more items */
      ]
    },
    Message: { /* required */
      Body: { /* required */
        Html: {
         Charset: "UTF-8",
         Data: '<html><p>You are receiving this email because you (or someone else) have requested the reset of the password for your account.<br><br>' +
         'Please click on the following link, or paste this into your browser to complete the process: ' +
         'http://' + reqHeadersHost + '/reset/' + token + '<br><br>' +
         'If you did not request this, please ignore this email and your password will remain unchanged.</p></html>'
        }
       },
       Subject: {
        Charset: 'UTF-8',
        Data: 'Culturestride Password Reset'
       }
      },
    Source: 'Culturestride <michael@culturestride.com>', /* required */
    };
    // Create the promise and SES service object
  var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
  
  // Handle promise's fulfilled/rejected states
  sendPromise.then(
    function(data) {
      console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
    }).catch(
      function(err) {
      console.error(err, err.stack);
    });

  },

  emailSohoStudentforRecordClass: function (email, date, firstName, hoursUsed) {
    console.log('emailSohoStudentforRecordClass is run');
    var signature = module.exports.signature() // signature

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email,
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
           Data: '<html><p>Hi ' + firstName + ', <br><br> Your teacher has logged ' + hoursUsed + ' hours of classes with Culturestride on ' + date + '.<br><br>View your class notes and submit homework to your teacher in your <a href="https://culturestride.com/login" target="_blank">Culturestride account</a><br><br>If this is incorrect, please <a href="https://culturestride.com/a/messages" target="_blank">notify your teacher</a>.' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: 'Class Record - ' + date
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });

  },
  emailSohoStudentforRecordClassTypeB: function (email, date, firstName) {
    console.log('emailSohoStudentforRecordClassTypeB is run');
    var signature = module.exports.signature() // signature
    
    var params = {
      Destination: { /* required */
        ToAddresses: [
          email,
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
           Data: '<html><p>Hi ' + firstName + ', <br><br> Your teacher has logged your attendance to 1 hour of Practical class with Culturestride on ' + date + '.<br><br>View your class notes and submit homework to your teacher in your <a href="https://culturestride.com/login" target="_blank">Culturestride account</a><br><br>If this is incorrect, please <a href="https://culturestride.com/a/messages" target="_blank">notify your teacher</a>.' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: 'Class Record Practical - ' + date
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });

  },

  emailMichael: function (subject, content) {
    console.log('emailMichael is run');
  
    var email = 'michael@culturestride.com';

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email,
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data: '<html><p>' + content + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: subject
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  emailStart: function (stuFirstName, stuLastName,practicalSpeakingLevel, langHome, stuEmail, email, teaName, trialTimeStart, trialTimeEnd, organiseGroupClass) {
    console.log('emailStart is run');
    var signature = module.exports.signature() // signature
    
    var params = {
      Destination: { /* required */
        ToAddresses: [
          email,
          'michael+notifications@culturestride.com',
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data: '<html><p>Hi,<br><br>A new student has scheduled in a class:<br><br>Teacher: ' + teaName + '<br>Group Class: ' + organiseGroupClass + '<br>Practical Speaking Level: ' + practicalSpeakingLevel + '<br>Language Spoken at Home (Chinese): ' + langHome + '<br>Start (China time): ' + trialTimeStart + ' UTC<br>End (China time): ' + trialTimeEnd + ' UTC<br><br>Student Email: ' + stuEmail + '<br><br><br>Please confirm you\'re able to take this student otherwise another teacher may be assigned.' + '<br><br><a style="background: #4950F6;color: #fff !important; transition: background .15s ease; border-radius: 10px;font-size: 14px; letter-spacing: 0px; font-weight: 700; text-transform: uppercase; line-height: 16px; text-decoration: none !important;cursor: pointer; justify-content: center; padding: 16px 32px; height: 48px; text-align: center; white-space: nowrap; border: none;" href="https://culturestride.com/sohostudents">Confirm Class</a>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: '[ACTION REQUIRED] You have a new student - ' + stuFirstName + ' ' + stuLastName,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  emailStartNoInput: function (email, className,practicalSpeakingLevel, stuEmail, firstName, lastName, langHome, organiseGroupClass) {
    console.log('emailStartNoInput is run');
    var signature = module.exports.signature() // signature
    var params = {
      Destination: { /* required */
        ToAddresses: [
          'michael+notifications@culturestride.com',
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data: 'Student details:<br><br>Group Class: ' + organiseGroupClass + '<br>Name: ' + firstName + ' ' + lastName + '<br>Email: ' + stuEmail + '<br>Language Spoken at Home (Chinese): ' + langHome + '<br>Practical Speaking Level: ' + practicalSpeakingLevel + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: className + ' signed up but did not book a Theory lesson',
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  emailTeachersEntryForm: function (email, stuFirstName, stuLastName, stuGoal, stuReadingLevel, stuHistory, listeningLevel, writingLevel) {
    console.log('emailTeachersEntryForm is run');
    var signature = module.exports.signature(); // module.exports is needed to call a local function within module.exports
    var btnCSS = module.exports.btnCSS(); // module.exports is needed to call a local function within module.exports

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email,
          'michael+notifications@culturestride.com',
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data: '<html><p>Hi,<br><br>Student Name: ' + stuFirstName + ' ' + stuLastName + '<hr>Learning Context: ' + stuHistory + '<hr>HSK Goal: ' + stuGoal + '<br>Reading Level: HSK ' + stuReadingLevel + '<br>Listening Level: HSK ' + listeningLevel + '<br>Speaking Level: Listen to their speaking level at <a href="https://culturestride.com/sohostudents">https://culturestride.com/sohostudents</a><br>Writing Level: ' + writingLevel + '<br><br><a style="' + btnCSS + '" href="https://culturestride.com/sohostudents">Confirm Class</a><br>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: '[STUDENT ENTRY FORM] - ' + stuFirstName + ' ' + stuLastName,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });

  },

  emailTeacherStuTransferred: function (stuFirstName, stuLastName, level, langHome, stuEmail, email, teaFirstName, teaLastName, confirmed, classType, start, end) {
    console.log('emailTeacherStuTransferred is run');
    var signature = module.exports.signature() // signature
    if (confirmed == 0) { // email teacher to confirm class
      var params = {
        Destination: { /* required */
          ToAddresses: [
            email,
            'michael+notifications@culturestride.com',
            /* more items */
          ]
        },
        Message: { /* required */
          Body: { /* required */
            Html: {
             Charset: "UTF-8",
        Data: '<html><p>Hi,<br><br>A new student has been assigned to you:<br><br>Teacher: ' + teaFirstName + ' ' + teaLastName + '<br>Level: ' + level + '<br>Language Spoken at Home (Chinese): ' + langHome + '<br>Type: ' + classType + '<br>Start (China time): ' + start + ' UTC<br>End (China time): ' + end + ' UTC<br><br>Student Email: ' + stuEmail + '<br><br><br>Please confirm you\'re able to take this student otherwise another teacher may be assigned.' + '<br><br><a style="background: #4950F6;color: #fff !important; transition: background .15s ease; border-radius: 10px;font-size: 14px; letter-spacing: 0px; font-weight: 700; text-transform: uppercase; line-height: 16px; text-decoration: none !important;cursor: pointer; justify-content: center; padding: 16px 32px; height: 48px; text-align: center; white-space: nowrap; border: none;" href="https://culturestride.com/sohostudents">Confirm Class</a>' + signature + '</p></html>'
            }
           },
           Subject: {
            Charset: 'UTF-8',
            Data: '[ACTION REQUIRED] You have a new student - ' + stuFirstName + ' ' + stuLastName,
           }
          },
        Source: 'Culturestride <michael@culturestride.com>', /* required */
        };
        // Create the promise and SES service object
      var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
      
      // Handle promise's fulfilled/rejected states
      sendPromise.then(
        function(data) {
          console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
        }).catch(
          function(err) {
          console.error(err, err.stack);
        });

    } else { // email teacher to message student

      var params = {
        Destination: { /* required */
          ToAddresses: [
            email,
            'michael+notifications@culturestride.com',
            /* more items */
          ]
        },
        Message: { /* required */
          Body: { /* required */
            Html: {
             Charset: "UTF-8",
        Data: '<html><p>Hi,<br><br>A new student has been assigned to you:<br><br>Teacher: ' + teaFirstName + ' ' + teaLastName + '<br>Level: ' + level + '<br>Language Spoken at Home (Chinese): ' + langHome + '<br>Type: ' + classType + '<br>Start (China time): ' + start + ' UTC<br>End (China time): ' + end + ' UTC<br><br>Student Email: ' + stuEmail + '<br><br><br>Please confirm you\'re able to take this student otherwise another teacher may be assigned.' + '<br><br><a style="background: #4950F6;color: #fff !important; transition: background .15s ease; border-radius: 10px;font-size: 14px; letter-spacing: 0px; font-weight: 700; text-transform: uppercase; line-height: 16px; text-decoration: none !important;cursor: pointer; justify-content: center; padding: 16px 32px; height: 48px; text-align: center; white-space: nowrap; border: none;" href="https://culturestride.com/sohomessages">Message Student</a>' + signature + '</p></html>'
            }
           },
           Subject: {
            Charset: 'UTF-8',
            Data: '[ACTION REQUIRED] You have a new student - ' + stuFirstName + ' ' + stuLastName,
           }
          },
        Source: 'Culturestride <michael@culturestride.com>', /* required */
        };
        // Create the promise and SES service object
      var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
      
      // Handle promise's fulfilled/rejected states
      sendPromise.then(
        function(data) {
          console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
        }).catch(
          function(err) {
          console.error(err, err.stack);
        });

    }

    
  },

  emailTeacherMessageStuTransferred: function (stuFirstName, stuLastName, level, langHome, stuEmail, email, teaFirstName, teaLastName) {
    console.log('emailTeacherStuTransferred is run');
    var signature = module.exports.signature() // signature
    var params = {
      Destination: { /* required */
        ToAddresses: [
          email,
          'michael+notifications@culturestride.com',
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi,<br><br>A new student has been assigned to you:<br><br>Teacher: ' + teaFirstName + ' ' + teaLastName + '<br>Level: ' + level + '<br>Language Spoken at Home (Chinese): ' + langHome + '<br><br>Student Email: ' + stuEmail + '<br><br><br>Please confirm you\'re able to take this student otherwise another teacher may be assigned.' + '<br><br><a style="background: #4950F6;color: #fff !important; transition: background .15s ease; border-radius: 10px;font-size: 14px; letter-spacing: 0px; font-weight: 700; text-transform: uppercase; line-height: 16px; text-decoration: none !important;cursor: pointer; justify-content: center; padding: 16px 32px; height: 48px; text-align: center; white-space: nowrap; border: none;" href="https://culturestride.com/sohomessages">Message Student</a>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: '[ACTION REQUIRED] You have a new student - ' + stuFirstName + ' ' + stuLastName,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });

  },


  uploadUsageDataToStripe: async function (subscriptionItemId, usageQty, type) {
    const {
      v4: uuid
    } = require('uuid');

    const subscriptionItemID = subscriptionItemId;

    // The usage number you've been keeping track of in your database for the last 24 hours.
    const usageQuantityMin = usageQty * 60; // convert it into minutes

    // The idempotency key allows you to retry this usage record call if it fails.
    const idempotencyKey = uuid();
    const timestamp = parseInt(Date.now() / 1000 - 300); // 5 mins before execution
    console.log('stripeUpload (' + type + '): ' + subscriptionItemId + ' - ' + usageQuantityMin + ' mins - ' + timestamp);

    // upload data to stripe
    try {
      await stripe.subscriptionItems.createUsageRecord(
        subscriptionItemID, {
          quantity: usageQuantityMin,
          timestamp: timestamp,
          action: 'set',
        }, {
          idempotencyKey,
        }
      );
    } catch (error) {
      console.error(`Usage report failed for item ID ${subscriptionItemID} with
  idempotency key ${idempotencyKey}: ${error.toString()}`);
    }
  },


  createStripeCustomer: async function (sohoSID, email, firstName, lastName) {
    var fullName = firstName + ' ' + lastName;
    const customer = await stripe.customers.create({
      email: email,
      name: fullName,
      metadata: {
        'sohoSID': sohoSID
      }
    });
    dbjsMethods.updateStripeCustomerId(customer.id, sohoSID);
  },

  sendMessageNotificationEmail: function (receiverType, firstName, email, senderFirstName, senderLastName, message) {
    console.log('sendMessageNotificationEmail is run');
    var btnCSS = module.exports.btnCSS(); // module.exports is needed to call a local function within module.exports
    var signature = module.exports.signature(); // module.exports is needed to call a local function within module.exports
    var messageCSS = 'width: fit-content; background: #f6f9fc; margin: 2px; padding: 7px 15px; border-radius: 20px; max-width: 75%;';
    if (receiverType == 'student') {
      var url = "https://culturestride.com/a/messages";
    } else {
      var url = "https://culturestride.com/sohomessages";
    }

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + firstName + ',<br><br>' + senderFirstName + ' ' + senderLastName + ' sent you messages on Culturestride:<br><p style="' + messageCSS + '">' + message + '</p></html><br><a style="' + btnCSS + '" href="' + url + '" target="_blank" >Reply To Messages</a>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: senderFirstName + ' ' + senderLastName + ' sent you new messages',
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  emailStudentStartFree: function (email, firstName, trialLessonStart) {
    console.log('emailStudentStartFree is run');
    var signature = module.exports.signature() // signature

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
           Data: '<html><p>Hi ' + firstName + ',<br><br>Thanks for joining Culturestride! Your Theory lesson is pending teacher acceptance and details are as follows:<br><br>When: ' + trialLessonStart + '<br>Duration: 45 min<br><br>You should expect an email within 48 hours introducing you to your teacher and asking you to confirm your class attendance, please action on this ASAP.<br><br><b>About Practical class</b><br><br>If you selected a Practical class to join, you should receive a separate confirmation about this class in the next 48 hours.<br><br><b>Before class, you need to</b><ul style="padding-left:10px"><li>Install and sign up for <a href="https://voovmeeting.com/download-center.html?from=1001">Voov</a> (primary meeting software)</li><li>Install and sign up for <a href="https://zoom.us/download">Zoom</a> (backup meeting software)</li></ul><br>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: 'Welcome to Culturestride, ' + firstName + '!',
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  emailStudentStartFreeNoTheory: function (email, firstName) {
    console.log('emailStudentStartFreeNoTheory is run');
    var signature = module.exports.signature() // signature
    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + firstName + ',<br><br>Thanks for joining Culturestride! You have no Theory class bookings at the moment.<br><br><b>About Practical class</b><br><br>If you selected a Practical class to join, you should receive a separate email about this class in the next 48 hours.<br><br><b>Before class, you need to</b><ul style="padding-left:10px"><li>Install and sign up for <a href="https://voovmeeting.com/download-center.html?from=1001">Voov</a> (primary meeting software)</li><li>Install and sign up for <a href="https://zoom.us/download">Zoom</a> (backup meeting software)</li></ul><br>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: 'Welcome to Culturestride, ' + firstName + '!',
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  emailStudentBookTheoryClass: function (email, firstName, tFirstName, tLastName, start, timezone, joinLink, repeatNo) {
    console.log('emailStudentBookTheoryClass is run');
    var signature = module.exports.signature() // signature
    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + firstName + ',<br><br>You booked ' + repeatNo + ' Theory class (' + tFirstName + ' ' + tLastName + ') starting ' + start + ' (' + timezone + ').<br><br>Join link: ' + joinLink + '<br><br><b>Before class, you need to</b><ul style="padding-left:10px"><li>Install and sign up starting <a href="https://voovmeeting.com/download-center.html?from=1001">Voov</a> (primary meeting software)</li><li>Install and sign up for <a href="https://zoom.us/download">Zoom</a> (backup meeting software)</li></ul><br>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: repeatNo + ' Theory class booked (' + start + ')',
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  emailStudentBookPracticalClass: function (email, firstName, tFirstName, tLastName, start, timezone, joinLink, repeatNo) {
    console.log('emailStudentBookPracticalClass is run');
    var signature = module.exports.signature() // signature
    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + firstName + ',<br><br>You booked ' + repeatNo + ' Practical class (' + tFirstName + ' ' + tLastName + ') starting ' + start + ' (' + timezone + ').<br><br>Join link: ' + joinLink + '<br><br>Please note your class will be 30 mins in length if you are the only student in this timeslot, otherwise it will be a 1 hour class.<br><br><b>Before class, you need to</b><ul style="padding-left:10px"><li>Install and sign up for <a href="https://voovmeeting.com/download-center.html?from=1001">Voov</a> (primary meeting software)</li><li>Install and sign up for <a href="https://zoom.us/download">Zoom</a> (backup meeting software)</li></ul><br>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: repeatNo + ' Practical class booked (' + start + ')',
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  emailStudentConfirmTrialClass: function (email, firstName, lessonStartTime, teacherName, tProfileImage) {
    console.log('emailStudentConfirmTrialClass is run');
    var signature = module.exports.signature() // signature
    var btnCSS = module.exports.btnCSS() // btncss
    var imgCSS = `width: 60px;
    display: block;
    border-radius: 10px;
    cursor: pointer;`

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + firstName + ',<br><br>Meet your Mandarin teacher who will lead you through your Mandarin learning journey!<br><br><img style="' + imgCSS + '" src="' + tProfileImage + '" ><br>Name: ' + teacherName + '<br>When: ' + lessonStartTime + '<br><br>Please click the confirm attendance button below ASAP, otherwise your class may be cancelled.<br><br><a style="' + btnCSS + '" href="https://culturestride.com/a/onboarding?autoConfirm=1">Confirm Attendance</a><br>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data:'Confirm your Theory class ASAP',
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  emailStudentConfirmPracticalClass: function (firstName, email, time, timezone, link) {
    console.log('emailStudentConfirmPracticalClass is run');
    var signature = module.exports.signature() // signature
    var btnCSS = module.exports.btnCSS() // btncss

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + firstName + ',<br><br>Please confirm your attendance to your Culturestride Practical Class.<br><br>When: ' + time + ' (' + timezone + ' time)<br><br>Please click the confirm attendance button below ASAP, otherwise your attendance may be forfeited.<br><br><a style="' + btnCSS + '" href="'+ link +'">Confirm Attendance</a><br>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data:'Confirm your Practical class ASAP',
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  sendEmailToTeacherAboutTrialProcedure: function (stuFirstName, stuLastName, time, firstName, email, level) {
    console.log('sendEmailToTeacherAboutTrialProcedure is run');
    var signature = module.exports.signature() // signature

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email,
          'michael+notifications@culturestride.com'
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data: '<html><p>Hi ' + firstName + ',<br><br>You have confirmed your lesson at ' + time + ' with ' + stuFirstName + ' ' + stuLastName + ' (' + level + '). This lesson <b> needs to be confirmed by the student and he/she needs to complete the student entry form </b> to actually happen and will be automatically deleted if he/she doesn\'t do both of these actions. <br><br>To prepare for your lesson:<ol><li><a href="https://culturestride.com/sohomessages" target="_blank">Send a message</a> to your student <b>before</b> the lesson to build your relationship with them</li><li>Prepare material relevant to the student\'s current language level</li></ol>If you have problems or lack materials, please reach out to Masae Zhang (wechat: yumiko830250) or Michael Liang (wechat: michaelliangaus).' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data:  'Lesson Pending Student Confirmation - ' + stuFirstName + ' ' + stuLastName,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  notifyStudentAboutHomeworkAssignment: function (stuFirstName, email, taskLevel, taskQuestion) {
    console.log('notifyStudentAboutHomeworkAssignment is run');
    // today's date
    var today = new Date();
    var dd = today.getDate();

    var mm = today.getMonth() + 1;
    var yyyy = today.getFullYear();
    if (dd < 10) {
      dd = '0' + dd;
    }

    if (mm < 10) {
      mm = '0' + mm;
    }
    today = dd + '/' + mm + '/' + yyyy;

    var btnCSS = module.exports.btnCSS(); // module.exports is needed to call a local function within module.exports
    var signature = module.exports.signature(); // module.exports is needed to call a local function within module.exports

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:   '<html><p>Hi ' + stuFirstName + ',<br><br>Question:<br>' + taskQuestion + '<br><br><a style="' + btnCSS + '" href="https://culturestride.com/a/homework" target="_blank">Complete Homework</a><br><br>You can tailor homework type <a href="https://culturestride.com/a/homework" target="_blank">here</a>.<br><br>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data:'You have a new HSK ' + taskLevel + ' Chinese homework task [' + today + ']',
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  notifyStudentAboutHomeworkAssignmentNumber: function (stuFirstName, email, count) {
    console.log('notifyStudentAboutHomeworkAssignmentNumber is run');

    var btnCSS = module.exports.btnCSS(); // module.exports is needed to call a local function within module.exports
    var signature = module.exports.signature(); // module.exports is needed to call a local function within module.exports

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data: '<html><p>Hi ' + stuFirstName + ',<br><br>Your incomplete homework pieces have been deleted and have been assigned ' + count + ' new homework assignments.<br><br><a style="' + btnCSS + '" href="https://culturestride.com/a/homework" target="_blank">View Homework Assignments</a><br><br>You can tailor homework type <a href="https://culturestride.com/a/homework" target="_blank">here</a>.<br><br>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data:  'View your ' + count + ' new homework assignments',
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },

  // UPGR
  freeUpgrade: function (email, stuFirstName) {
    console.log('freeUpgrade is run');
    var signature = module.exports.signature() // signature
    
    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data: '<html><p>Hi ' + stuFirstName + ',<br><br>Your payment details have been updated in Culturestride.<br><br>Check out also our Partners<br><ul style="padding-left:10px"><li><a href="https://www.hackchinese.com/culturestride">Hack Chinese</a> - spaced repetition software to grow and maintain your Mandarin vocabulary - <a href="https://culturestride.com/think/hack-chinese">how do Culturestride students use this?</a></li></ul><br>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: 'Payment details updated',
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  sendCancelEmail: function (email, teaFirstName, className, start) {
    console.log('sendCancelEmail is run');
    var signature = module.exports.signature() // signature
    var params = {
      Destination: { /* required */
        ToAddresses: [
          email,
          'michael+notifications@culturestride.com'
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + teaFirstName + ',<br><br>' + className + ' cancelled the class:<br><br>Start:<br>' + start + '<br><br>If he/she has cancelled within 24 hours of the class time, please record it as a class taken.' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data:  className + ' cancelled class - ' + start,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },

  sendRescheduleRequest: function (email, teaFirstName, className, curClassTime, curClassDuration, newClassTime, comments) {
    console.log('sendRescheduleRequest is run');
    var signature = module.exports.signature() // signature

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email,
          'michael+notifications@culturestride.com'
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + teaFirstName + ',<br><br>' + className + ' wants to reschedule the lesson below:<br><br>Current Class Time:<br>' + curClassTime + '<br><br>New Class Time:<br>' + newClassTime + '<br><br>Duration:<br>' + curClassDuration + ' Hours<br><br>Comments/Reason:<br>' + comments + '<br><br>Please action on this request at <a href="https://culturestride.com/sohostudents">https://culturestride.com/sohostudents</a>.' + signature + '</p></html>'
         },
        },
         Subject: {
          Charset: 'UTF-8',
          Data: className + ' reschedule class - ' + curClassTime,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  emailTeacherBookTheoryClass: function (email, teaFirstName, sFirstName, sLastName, startTime, endTime, repeatNo) {
    console.log('emailTeacherBookTheoryClass is run');
    var signature = module.exports.signature() // signature

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email,
          'michael+notifications@culturestride.com'
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + teaFirstName + ',<br><br>' + sFirstName + ' ' + sLastName + ' booked Theory class repeating ' + repeatNo + ' times.<br><br>Time (Asia/Shanghai): <b>' + startTime + ' - ' + endTime + '</b><br><br>Confirm this class at https://culturestride.com/sohostudents.' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: repeatNo + ' Theory class booked (' + sFirstName + ' ' + sLastName + ') - ' + startTime,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  emailTeacherBookPracticalClass: function (email, teaFirstName, sFirstName, sLastName, startTime, repeatNo) {
    console.log('emailTeacherBookPracticalClass is run');
    var signature = module.exports.signature() // signature

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email,
          'michael+notifications@culturestride.com'
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + teaFirstName + ',<br><br>' + sFirstName + ' ' + sLastName + ' booked Practical class repeating ' + repeatNo + ' times.<br><br>Time (Asia/Shanghai): <b>' + startTime + '</b><br><br>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: repeatNo + ' Practical class booked (' + sFirstName + ' ' + sLastName + ') - ' + startTime,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  teaRejectedBookedClass: function (firstName, email, start, teacherName, timezone) {
    console.log('teaRejectedBookedClass is run');
    var signature = module.exports.signature() // signature
    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + firstName + ',<br><br>' + teacherName + ' has rejected your class booking. Please schedule another class at https://culturestride.com/a/book.' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: teacherName + ' rejected your class booking at ' + start + ' (' + timezone + ')',
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },

  // UP TO HERE
  sendLessonTimeMinus36HrEmail: function (email, firstName, teacherName, lessonStartTime) {
    console.log('sendLessonTimeMinus36HrEmail is run');
    var signature = module.exports.signature() // signature
  console.log("file: custom.js ~ line 1281 ~ email", email)
   
    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + firstName + ',<br><br>Your lesson with ' + teacherName + ' at ' + lessonStartTime + ' is unconfirmed and will be cancelled in 24 hours if you do not confirm your attendance and complete your student entry form.<br><br>Please do this in <a href="https://culturestride.com/a/onboarding"> your student portal </a><br>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: 'Confirm your Chinese class ASAP to avoid cancellation (24 hours left)'
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  sendLessonTimeMinus24HrEmail: function (email, firstName, teacherName, lessonStartTime) {
    console.log('sendLessonTimeMinus24HrEmail is run');
    var signature = module.exports.signature() // signature
    
    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:   '<html><p>Hi ' + firstName + ',<br><br>Your lesson with ' + teacherName + ' at ' + lessonStartTime + ' is unconfirmed and will be cancelled in 12 hours if you do not confirm your attendance and complete your student entry form.<br><br>Please do this and all other action items in <a href="https://culturestride.com/a/onboarding"> your student portal </a><br>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: 'Confirm your Chinese class now to avoid cancellation (12 hours left)',
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  sendLessonDeletedEmail: function (email, firstName, lessonStartTime) {
    console.log('sendLessonDeletedEmail is run');
    var signature = module.exports.signature() // signature

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + firstName + ',<br><br>Your lesson at ' + lessonStartTime + ' has been automatically cancelled because you did not confirm your attendance or complete the student entry form.<br><br>If you wish to reschedule another lesson please book in a class at <a href="https://culturestride.com/a/book">https://culturestride.com/a/book</a>.' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: 'Your lesson been automatically cancelled - ' + lessonStartTime,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  sendLessonReminderEmail12: function (email, firstName, lessonStartTime) {
    console.log('sendLessonReminderEmail12 is run');
    var signature = module.exports.signature() // signature
    var btnCSS = module.exports.btnCSS() // btn

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + firstName + ',<br><br>Your lesson at ' + lessonStartTime + ' is happening in 12 hours!<br><br>You can find the meeting link in the Google calendar invite you received or you can click the "Join Class" button in your student portal.<br><br><a style="' + btnCSS + '" href="https://culturestride.com/a/classroom">Enter Student Portal</a>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: 'Your Chinese class is in 12 hours - ' + lessonStartTime,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },

  sendLessonReminderEmail24: function (email, firstName, lessonStartTime) {
    console.log('sendLessonReminderEmail24 is run');
    var signature = module.exports.signature() // signature
    var btnCSS = module.exports.btnCSS() // btn

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data: '<html><p>Hi ' + firstName + ',<br><br>Your lesson at ' + lessonStartTime + ' is happening in 24 hours!<br><br>You can find the meeting link in the Google calendar invite you received or you can click the "Join Next Class" button in your student portal.<br><br><a style="' + btnCSS + '" href="https://culturestride.com/a/classroom">Enter Student Portal</a>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: 'Your Chinese class is in 24 hours - ' + lessonStartTime,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  sendLessonDeletedEmailTea: function (email, sName, lessonStartTime) {
    console.log('sendLessonDeletedEmailTea is run');
    var signature = module.exports.signature() // signature
   
    var params = {
      Destination: { /* required */
        ToAddresses: [
          email,
          'michael+notiifications@culturestride.com'
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi,<br><br>' + sName + ' lesson at ' + lessonStartTime + ' has been automatically cancelled because he/she did not confirm attendance and complete the student entry form.<br><br>If he/she wishes to reschedule another time, please ask him/her to sign up again at <a href="https://culturestride.com/a/book">https://culturestride.com/a/book</a>s.' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: sName + ' class been automatically cancelled - ' + lessonStartTime,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  emailTeacherStuConfirmAttendance: function (email, stuName, lessonStartTime) {
    console.log('emailTeacherStuConfirmAttendance is run');
    var signature = module.exports.signature() // signature
    var params = {
      Destination: { /* required */
        ToAddresses: [
          email,
          'michael+notifications@culturestride.com'
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:   '<html><p>Hi,<br><br>' + stuName + ' has confirmed attendance at lesson ' + lessonStartTime + '. Please make sure the student has also completed his/her student entry form otherwise the class will be automatically cancelled 12 hours prior to lesson time.<br><br>Go to <a href="https://culturestride.com/sohostudents">https://culturestride.com/sohostudents</a> to see more details about the student.' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: stuName + ' confirmed attendance to class - ' + lessonStartTime,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },

  reminderEmail36HoursBeforeLessonCRON: function (ce, dataObj, sohoCRID) {
    // THE CRONS DONT WORK RIGHT NOW BECAUSE THE GROUPSLUGS ARE FUCKED
    var reminderEmail36HoursBeforeLessonTask = cron.schedule(ce, () => {
      console.log("file: custom.js ~ line 1153 ~ dataObj", dataObj)
      dbjsMethods.getUnconfirmedLessonCheck(dataObj.groupSlug, function (checkData) {
        try {
          if (checkData[0].entryGoal == 'null' || checkData[0].confirmed != 2) { // check if confirmed status in lessonlog and student entry form completion - if either of these are not done then cancel class
            module.exports.sendLessonTimeMinus36HrEmail(dataObj.stuEmail, dataObj.stuFirstName, dataObj.teacherName, dataObj.startTime); // module.exports is needed to call a local function within module.exports
            console.log('reminderEmail36HoursBeforeLessonCRON succeeded: ' + sohoCRID + ' (sohoCRID)')
          } else {
            console.log('reminderEmail36HoursBeforeLessonCRON did not send email - student completed SEF and confirmed: ' + sohoCRID + ' (sohoCRID)')
          }
        } catch (e) {
          console.log('reminderEmail36HoursBeforeLessonCRON failed: ' + sohoCRID + ' (sohoCRID)')
        }
        dbjsMethods.deleteCron(sohoCRID); // remove from cron table
        reminderEmail36HoursBeforeLessonTask.destroy(); // this destroys the task once it runs
      });
    }, {
      scheduled: true,
      timezone: "Etc/UTC" // converts to UTC time
    });
    reminderEmail36HoursBeforeLessonTask.start();
  },

  reminderEmail24HoursBeforeLessonCRON: function (ce, dataObj, sohoCRID) {
    var reminderEmail24HoursBeforeLessonTask = cron.schedule(ce, () => {
      console.log("file: custom.js ~ line 1153 ~ dataObj", dataObj)
      dbjsMethods.getUnconfirmedLessonCheck(dataObj.groupSlug, function (checkData) {
        try {
          if (checkData[0].entryGoal == 'null' || checkData[0].confirmed != 2) { // check if confirmed status in lessonlog and student entry form completion - if either of these are not done then cancel class
            module.exports.sendLessonTimeMinus24HrEmail(dataObj.stuEmail, dataObj.stuFirstName, dataObj.teacherName, dataObj.startTime); // module.exports is needed to call a local function within module.exports
            console.log('reminderEmail24HoursBeforeLessonCRON succeeded: ' + sohoCRID + ' (sohoCRID)')
          } else {
            module.exports.sendLessonReminderEmail24(dataObj.stuEmail, dataObj.stuFirstName, dataObj.startTime); // module.exports is needed to call a local function within module.exports
            console.log('reminderEmail24HoursBeforeLessonCRON sent reminder email - student completed SEF and confirmed: ' + sohoCRID + ' (sohoCRID)')
          }
        } catch (e) {
          console.log('reminderEmail24HoursBeforeLessonCRON failed: ' + sohoCRID + ' (sohoCRID)')
        }
        dbjsMethods.deleteCron(sohoCRID); // remove from cron table
        reminderEmail24HoursBeforeLessonTask.destroy(); // this destroys the task once it runs
      });
    }, {
      scheduled: true,
      timezone: "Etc/UTC" // converts to UTC time
    });
    reminderEmail24HoursBeforeLessonTask.start();
  },
  lessonCheck12HoursBeforeCRON: function (ce, dataObj, sohoCRID) {
    var lessonCheck12HoursBeforeTask = cron.schedule(ce, () => {
      dbjsMethods.getUnconfirmedLessonCheck(dataObj.groupSlug, function (checkData) {
        try {
          if (checkData[0].entryGoal == 'null' || checkData[0].confirmed != 2) { // check if confirmed status in lessonlog and student entry form completion - if either of these are not done then cancel class
            // cancel the class - straight up delete it
            // get aids by slug
            dbjsMethods.getsohoAIDsByGroupSlug(dataObj.groupSlug, function (calData) {
              var sohoAIDArr = [];
              for (let i = 0; i < calData.length; i++) {
                sohoAIDArr.push(calData[i].sohoAID);
              }
              dbjsMethods.sohoDeleteCalendar(sohoAIDArr);
              // should also delete the google calendar at some point in the future
            });
            // notify student
            module.exports.sendLessonDeletedEmail(dataObj.stuEmail, dataObj.stuFirstName, dataObj.startTime); // module.exports is needed to call a local function within module.exports

            // notify teacher
            module.exports.sendLessonDeletedEmailTea(dataObj.tEmail, dataObj.studentName, dataObj.startTime); // module.exports is needed to call a local function within module.exports

            console.log('lessonCheck12HoursBeforeCRON succeeded: ' + sohoCRID + ' (sohoCRID)')
          } else {
            // remind the student they have a class in 12 hours
            module.exports.sendLessonReminderEmail12(dataObj.stuEmail, dataObj.stuFirstName, dataObj.startTime); // module.exports is needed to call a local function within module.exports
          }
        } catch (e) {
          console.log('lessonCheck12HoursBeforeCRON failed: ' + sohoCRID + ' (sohoCRID)')
        }
        // remove from cron table
        dbjsMethods.deleteCron(sohoCRID);
        lessonCheck12HoursBeforeTask.destroy(); // this destroys the task once it runs
      });

    }, {
      scheduled: true,
      timezone: "Etc/UTC" // converts to UTC time
    });
    lessonCheck12HoursBeforeTask.start();
  },
  emailReschedule: function (stuFirstName, email, teaFirstName, oldLessonTime, newLessonTime) {
    console.log('emailReschedule is run');
    var signature = module.exports.signature() // signature

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + stuFirstName + ',<br><br>' + teaFirstName + ' has confirmed a reschedule of lesson at ' + oldLessonTime + ' to be shifted to ' + newLessonTime + '.' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: teaFirstName + ' rescheduled class - ' + oldLessonTime + ' to ' + newLessonTime,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  emailStudentUpdatedPracticalClass: function (sFirstName, email, tFirstName, tLastName, start, timezone, oldEventStart) {
    console.log('emailStudentUpdatedPracticalClass is run');
    var signature = module.exports.signature() // signature
    var btnCSS = module.exports.btnCSS() // btncss

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + sFirstName + ',<br><br>Your teacher ('  + tFirstName + ' ' + tLastName + ') has rescheduled your Practical class to ' + start + ' (' + timezone + ' time) from ' + oldEventStart + ' (' + timezone + ' time).<br><br> <a style="' + btnCSS + '" href="https://culturestride.com/a/classadmin">Manage Classes</a><br><br>'+ signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: 'Practical class rescheduled by teacher to ' + start,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  emailStudentCancelledPracticalClass: function (sFirstName, email, tFirstName, tLastName, start, timezone) {
    console.log('emailStudentCancelledPracticalClass is run');
    var signature = module.exports.signature() // signature
    var btnCSS = module.exports.btnCSS() // btncss

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + sFirstName + ',<br><br>Your teacher ('  + tFirstName + ' ' + tLastName + ') has cancelled your Practical class at ' + start + ' (' + timezone + ' time). You will not be charged for this class.<br><br> <a style="' + btnCSS + '" href="https://culturestride.com/a/classadmin">Rebook Class</a><br><br>'+ signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: 'Practical class cancelled by teacher (' + start + ')',
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  emailStudentCancelledTheoryClass: function (sFirstName, email, tFirstName, tLastName, start, timezone) {
    console.log('emailStudentCancelledTheoryClass is run');
    var signature = module.exports.signature() // signature
    var btnCSS = module.exports.btnCSS() // btncss

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + sFirstName + ',<br><br>Your teacher ('  + tFirstName + ' ' + tLastName + ') has cancelled your Theory class at ' + start + ' (' + timezone + ' time). You will not be charged for this class.<br><br> <a style="' + btnCSS + '" href="https://culturestride.com/a/classadmin">Rebook Class</a><br><br>'+ signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: 'Theory class cancelled by teacher (' + start + ')',
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  emailDeleteClassReschedule: function (stuFirstName, email, teaFirstName, oldLessonTime, newLessonTime) {
    console.log('emailDeleteClassReschedule is run');
    var signature = module.exports.signature() // signature

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + stuFirstName + ',<br><br>' + teaFirstName + ' has cancelled the lesson at ' + oldLessonTime + '.' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data:teaFirstName + ' has cancelled the class - ' + oldLessonTime,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },

  gCalCreateRecurring: function (credentials, data, callback) {
    const {
      client_secret,
      client_id,
      redirect_uris
    } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
      if (err) return getAccessToken(oAuth2Client, callback);
      oAuth2Client.setCredentials(JSON.parse(token));

      var auth = oAuth2Client;

      const calendar = google.calendar({
        version: 'v3',
        auth
      });

      if (data.location === null) {
        var location = 'Message your teacher for a Voov link before the class';
      } else {
        var location = data.location;
      }

      var newEvent = {
        'summary': data.summary,
        'location': location,
        'description': data.description,
        'colorId': data.colorId,
        'guestsCanModify': true,
        "start": {
          "dateTime": data.eventStart,
          "timeZone": "UTC"
        },
        "end": {
          "dateTime": data.eventEnd,
          "timeZone": "UTC"
        },
        "recurrence": [
          "RRULE:FREQ=WEEKLY;COUNT=" + data.recurringNo,
        ],
        'attendees': data.email
      };

      calendar.events.insert({
        auth: auth,
        calendarId: 'primary',
        resource: newEvent,
        sendNotifications: true,
      }, function (err, event) {
        if (err) {
          console.log('There was an error contacting the Calendar service: ' + err);
          return;
        }
        console.log('Event Created ID: %s', event.data.id);
        // save the id
        callback(event.data.id);
      })
    });
  },
  gCalGetInstanceId: function (credentials, eventId, callback) {
    const {
      client_secret,
      client_id,
      redirect_uris
    } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
      if (err) return getAccessToken(oAuth2Client, callback);
      oAuth2Client.setCredentials(JSON.parse(token));
      var auth = oAuth2Client;

      const calendar = google.calendar({
        version: 'v3',
        auth
      });

      calendar.events.instances({
        auth: auth,
        calendarId: 'primary',
        eventId: eventId,
        timeZone: 'UTC'
      }, function (err, event) {
        if (err) {
          console.log('There was an error contacting the Calendar service: ' + err);
          return;
        }
        callback(event);
      });

    });
  },
  gCalGetEvent: function (credentials, data, callback) {
    const {
      client_secret,
      client_id,
      redirect_uris
    } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
      if (err) return getAccessToken(oAuth2Client, callback);
      oAuth2Client.setCredentials(JSON.parse(token));
      var auth = oAuth2Client;

      const calendar = google.calendar({
        version: 'v3',
        auth
      });

      calendar.events.get({
        auth: auth,
        calendarId: 'primary',
        eventId: data.gcEventId,
        timeZone: 'UTC'
      }, function (err, event) {
        if (err) {
          console.log('There was an error contacting the Calendar service: ' + err);
          return;
        }
        callback(event);
      });

    });
  },

  gCalUpdateAttendees: function (credentials, data, callback) {
    const {
      client_secret,
      client_id,
      redirect_uris
    } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
      if (err) return getAccessToken(oAuth2Client, callback);
      oAuth2Client.setCredentials(JSON.parse(token));

      var auth = oAuth2Client;

      const calendar = google.calendar({
        version: 'v3',
        auth
      });

      var updatedEvent = {
        "attendees": data.attendees
      };

      calendar.events.patch({
        auth: auth,
        calendarId: 'primary',
        eventId: data.gcEventId,
        resource: updatedEvent,
        sendUpdates: 'all',
      }, function (err, event) {
        if (err) {
          console.log('There was an error contacting the Calendar service: ' + err);
          return;
        } else {
          console.log('Event updated');
        }
        // this callback is used in update recurring all to fetch new instance but not used elsewhere hence the try catch statement to reduce junk logging
        try {
          callback();
        } catch (e) {

        }

      });
    });
  },

  gCalGetInstanceId: function (credentials, eventId, callback) {
    const {
      client_secret,
      client_id,
      redirect_uris
    } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
      if (err) return getAccessToken(oAuth2Client, callback);
      oAuth2Client.setCredentials(JSON.parse(token));
      var auth = oAuth2Client;

      const calendar = google.calendar({
        version: 'v3',
        auth
      });

      calendar.events.instances({
        auth: auth,
        calendarId: 'primary',
        eventId: eventId,
        timeZone: 'UTC'
      }, function (err, event) {
        if (err) {
          console.log('There was an error contacting the Calendar service: ' + err);
          return;
        }
        callback(event);
      });

    });
  },
  gCalCreateSingle: function (credentials, data, callback) {
    const {
      client_secret,
      client_id,
      redirect_uris
    } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
      if (err) return getAccessToken(oAuth2Client, callback);
      oAuth2Client.setCredentials(JSON.parse(token));

      var auth = oAuth2Client;

      const calendar = google.calendar({
        version: 'v3',
        auth
      });
      if (data.location === null) {
        var location = 'Message your teacher for a Voov link before the class';
      } else {
        var location = data.location;
      }

      var newEvent = {
        'summary': data.summary,
        'location': location,
        'description': data.description,
        'colorId': data.colorId, // red
        'guestsCanModify': true,
        "start": {
          "dateTime": data.eventStart,
          "timeZone": "UTC"
        },
        "end": {
          "dateTime": data.eventEnd,
          "timeZone": "UTC"
        },
        'attendees': data.email
      };


      calendar.events.insert({
        auth: auth,
        calendarId: 'primary',
        resource: newEvent,
        sendNotifications: true,
      }, function (err, event) {
        if (err) {
          console.log('There was an error contacting the Calendar service: ' + err);
          return;
        }
        console.log('Event Created ID: %s', event.data.id);
        // save the id
        callback(event.data.id);
      })
    })
  },

  gCalUpdate: function (credentials, data, callback) {
    const {
      client_secret,
      client_id,
      redirect_uris
    } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
      if (err) return getAccessToken(oAuth2Client, callback);
      oAuth2Client.setCredentials(JSON.parse(token));

      var auth = oAuth2Client;

      const calendar = google.calendar({
        version: 'v3',
        auth
      });

      var updatedEvent = {
        "start": {
          "dateTime": data.start,
          "timeZone": "UTC"
        },
        "end": {
          "dateTime": data.end,
          "timeZone": "UTC"
        },
      };
      calendar.events.patch({
        auth: auth,
        calendarId: 'primary',
        eventId: data.gcEventId,
        resource: updatedEvent
      }, function (err, event) {
        if (err) {
          console.log('There was an error contacting the Calendar service: ' + err);
          return;
        } else {
          console.log('Event updated');
        }
        // this callback is used in update recurring all to fetch new instance but not used elsewhere hence the try catch statement to reduce junk logging
        try {
          callback();
        } catch (e) {

        }

      });
    });
  },

  gCalUpdateRecurrence: function (credentials, data, callback) {
    const {
      client_secret,
      client_id,
      redirect_uris
    } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
      if (err) return getAccessToken(oAuth2Client, callback);
      oAuth2Client.setCredentials(JSON.parse(token));

      var auth = oAuth2Client;

      const calendar = google.calendar({
        version: 'v3',
        auth
      });

      var mom = moment(data.start,'YYYY-MM-DDTHH:mm:ssZ');
      mom.subtract(1,'seconds');
      var startFormatted = mom.utc().format().replace(/-/g, "").replace(/:/g, "");
      console.log("file: custom.js ~ line 2130 ~ fs.readFile ~ startFormatted", startFormatted)

      var updatedEvent = {
        "recurrence": [
          "RRULE:FREQ=WEEKLY;UNTIL=" + startFormatted,
        ],
      };
      calendar.events.patch({
        auth: auth,
        calendarId: 'primary',
        eventId: data.gcEventId,
        resource: updatedEvent
      }, function (err, event) {
        if (err) {
          console.log('There was an error contacting the Calendar service: ' + err);
          return;
        } else {
          console.log('Event updated');
        }
        // this callback is used in update recurring all to fetch new instance but not used elsewhere hence the try catch statement to reduce junk logging
        try {
          callback();
        } catch (e) {

        }

      });
    });
  },




  gCalDelete: function (credentials, data) {
    const {
      client_secret,
      client_id,
      redirect_uris
    } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
      if (err) return getAccessToken(oAuth2Client, callback);
      oAuth2Client.setCredentials(JSON.parse(token));

      var auth = oAuth2Client;

      const calendar = google.calendar({
        version: 'v3',
        auth
      });

      calendar.events.delete({
        auth: auth,
        calendarId: 'primary',
        eventId: data.gcEventId,
      }, function (err, event) {
        if (err) {
          console.log('There was an error contacting the Calendar service: ' + err);
          return;
        } else {
          console.log('Event deleted');
        }
      });
    });

  },
  emailStuAcceptJoinGroupClass: function (firstName, email, time, timezone, joinlink) {
    console.log('emailStuAcceptJoinGroupClass is run');
    var signature = module.exports.signature() // signature

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + firstName + ',<br><br>Your attendance has been approved for a confirmed Practical class.<br><br>When: ' + time + ' (' + timezone + ' time)<br><br>Your classmates count on you attending to do group activities so please be courteous and reply back to this email at least 24 hours before the class time if you cannot make it.<br><br>Join link: '+joinlink+'<br><br><b>Before class, you need to</b><ul style="padding-left:10px"><li>Install and sign up for <a href="https://voovmeeting.com/download-center.html?from=1001">Voov</a> (primary meeting software)</li><li>Install and sign up for <a href="https://zoom.us/download">Zoom</a> (backup meeting software)</li></ul><b>Expectations for your first class</b><br><br>The first class lets you test communicative learning and the proficiency levels of your group members. Please <a href="https://culturestride.com/a/book/practical">request to join</a> other Practical class if you wish to join different level classes after.<br>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: 'You\'re attending Practical class - ' + time,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  emailStuAcceptJoinGroupClassUnconfirmed: function (firstName, email, time, timezone) {
    console.log('emailStuAcceptJoinGroupClassUnconfirmed is run');
    var signature = module.exports.signature() // signature

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + firstName + ',<br><br>Your request to join this weekly Practical class has been processed but your class needs one more member to join before beginning. Until then, this class will not occur.<br><br>When: ' + time + ' (' + timezone + ' time)<br><br>We will notify you as soon as another member joins this group and then your group will begin learning in the next weekly class.<br><br><b>Before class, you need to</b><ul style="padding-left:10px"><li>Install and sign up for <a href="https://voovmeeting.com/download-center.html?from=1001">Voov</a> (primary meeting software)</li><li>Install and sign up for <a href="https://zoom.us/download">Zoom</a> (backup meeting software)</li></ul>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: 'Waiting for one more student in your Practical class - ' + time,
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  sendResourceHowToNotWaste6Months: function (fullName, email) {
    console.log('sendResourceHowToNotWaste6Months is run');
    var signature = module.exports.signature() // signature
    var btnCSS = module.exports.btnCSS(); // module.exports is needed to call a local function within module.exports

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + fullName + ',<br><br>Here is your copy of the resource - How To Not Waste 6 Months Learning Chinese Naively (It\'s Hard!). Enjoy!<br><br><a style="' + btnCSS + '" href="https://culturestride.com/media/how-to-not-waste-6-months.pdf">Read Link</a>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: 'How To Not Waste 6 Months Learning Chinese Naively (It\'s Hard!) Resource',
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
  sendResourceStarterPack: function (fullName, email) {
    console.log('sendResourceStarterPack is run');
    var signature = module.exports.signature() // signature

    var params = {
      Destination: { /* required */
        ToAddresses: [
          email
          /* more items */
        ]
      },
      Message: { /* required */
        Body: { /* required */
          Html: {
           Charset: "UTF-8",
      Data:  '<html><p>Hi ' + fullName + ',<br><br>Here is your Starter Chinese Pack to get you started with Chinese. In this pack is:<br><br>- 5 recorded videos of HSK 1 (beginner) lectures to teach you the basics (<a href="https://www.youtube.com/watch?v=V0SWBAqOxU4&list=PLzdaw1rT9xmqKD3ZXX2oun4DH22shOkP3">Access here</a>)<br>- <a href="https://culturestride.com/media/how-to-not-waste-6-months.pdf">How to Not Waste 6 Months Learning Chinese Naively (It\'s Hard!) PDF</a> with <a href="https://culturestride.com/media/umbrella-concept.pdf">bonus resource on the "umbrella concept" within</a><br>- 1 Free Practical class credit (<a href="https://culturestride.com/start">Access here</a>)<br>- 1 Free Theory class credit (<a href="https://culturestride.com/start">Access here</a>)<br><br>How to book your Theory or Practical class<br>Create an account using this <a href="https://culturestride.com/start">special link</a> to claim your 2 class credits. Then use the website prompts to book a Theory or Practical class, the first classes of Theory and Practical will be automatically free.<br><br>Enjoy!<br>' + signature + '</p></html>'
          }
         },
         Subject: {
          Charset: 'UTF-8',
          Data: fullName + ', your Starter Chinese Pack',
         }
        },
      Source: 'Culturestride <michael@culturestride.com>', /* required */
      };
      // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    
    // Handle promise's fulfilled/rejected states
    sendPromise.then(
      function(data) {
        console.log('Message sent to: ' + email + '(id: ' + data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  },
}