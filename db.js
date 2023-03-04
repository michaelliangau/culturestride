// ************************ PRODUCTION VARIABLE ***********************
var production = process.env.PROD_VARIABLE; // 0 for development and 1 for production
// ************************ PRODUCTION VARIABLE ***********************

if (process.env.NODE_ENV == "development") {
    require('dotenv').config(); //need this for environment variables
}

// mySQL database configuration
const mysql = require('mysql2');
if (production == 1) {
    console.log('Database production mode is engaged');
    // production configs
    var config = {
        host: process.env.AWS_DB_LINK,
        user: '',
        password: process.env.PROD_DB_PWD,
        database: '',
        port: 1,
        ssl: false,
        connectTimeout: 60000
    };
} else {
    console.log('Database development mode is engaged');
    // local configs
    var config = {
        host: 'localhost',
        user: '',
        password: process.env.LOCAL_DB_PWD, // add your own password
        database: '',
        port: 1,
        ssl: false,
        connectTimeout: 60000
    };
}
// Open up a database connection
const conn = new mysql.createConnection(config);

module.exports = { // This function exports these methods so that they can be used anywhere in the app (as long as the file imports db.js)

    getStudentforLogin: function (email, callback) {
        conn.query(`select * from sohostudents where email = ?`, [email],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getStudentforDoubleSignUpCheck: function (email, callback) {
        conn.query(`SELECT * FROM sohostudents WHERE email IN (?)`, [email],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getClassforDashLogin: function (studentID, callback) {
        conn.query(`SELECT * FROM sohoclasses WHERE sohoSID IN (?)`, [studentID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getClassforDashAddBalance: function (studentID, callback) {
        conn.query(`SELECT * FROM sohoclasses WHERE sohoSID IN (?)`, [studentID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getLessonLogforClassAdmin: function (sohoCID, callback) {
        conn.query(`select count(sohoREID) as 'reviewExists', soholessonlog.sohoLID, start, end, dateOfClass, soholessonlog.lessonType, firstName as 'tFirstName', lastName as 'tLastName', profileImage, soholessonlog.sohoUID from soholessonlog left outer join sohocalendar on sohocalendar.sohoAID = soholessonlog.sohoAID left outer join sohousers on sohousers.sohoUID = soholessonlog.sohoUID left outer join sohoreview on sohoreview.sohoLID = soholessonlog.sohoLID where (end < UTC_TIMESTAMP() OR end is null)  and soholessonlog.sohoCID = ?  group by soholessonlog.sohoLID order by start desc, dateOfClass desc;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getUpcomingLessons: function (sohoCID, callback) {
        conn.query(`select sohocalendar.sohoAID, a.sohoLID, start, end, a.lessonType, a.ts, title, confirmed, videoConfPMI, firstName as 'tFirstName', lastName as 'tLastName', profileImage, count(b.sohoLID) as 'sCount' from soholessonlog a left outer join sohocalendar on sohocalendar.sohoAID = a.sohoAID left outer join sohousers on sohousers.sohoUID = a.sohoUID left outer join soholessonlog b on b.sohoAID = sohocalendar.sohoAID where end > UTC_TIMESTAMP() and a.sohoCID = ? group by a.sohoAID order by start asc;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getEmailofStudentsForgotPassword: function (email, callback) {
        conn.query(`select * from sohostudents where email = ?`, [email],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    allocateTokenandExpiryDateForgotPassword: function (email, token, expiryDate, callback) {
        conn.query(`UPDATE sohostudents SET resetPasswordToken = ?, resetPasswordExpires = ? WHERE email = ?`, [token, expiryDate, email],
            function (err, results, fields) {
                if (err) throw err;
                else return callback(results);
            });
    },
    getExpiryDateOfTokenForgotPassword: function (token, callback) {
        conn.query(`SELECT * FROM sohostudents WHERE resetPasswordToken = ?`, [token],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    clearTokenandExpiryDateForgotPassword: function (token) {
        conn.query(`UPDATE sohostudents SET resetPasswordToken = '', resetPasswordExpires = '' WHERE resetPasswordToken = ?`, [token],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    resetPasswordForgotPassword: function (hash, token) {
        conn.query(`UPDATE sohostudents SET pw = ?, resetPasswordToken = ?, resetPasswordExpires = ? WHERE resetPasswordToken = ?`, [hash, '', '', token],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    addPaymentTransactionLog: function (studentID, paymentAmount, convertedPaymentAmount, description, paymentMethod) {
        conn.query(`INSERT INTO sohotransactionlog (sohoSID, paymentAmount, convertedPaymentAmount, bankDescription, paymentMethod) VALUES (?,?,?,?,?)`, [studentID, paymentAmount, convertedPaymentAmount, description, paymentMethod],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    addHomework: function (lessonID, homework) {
        conn.query(`UPDATE soholessonlog SET homework = ? WHERE sohoLID = ?`, [homework, lessonID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getTrialClassforTrialOnboarding: function (sohoCID, callback) {
        conn.query(`select * from sohocalendar where sohoCID = ? and lessonType in ('trial','free') order by start asc limit 1;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    confirmStudentAttendanceForLesson: function (confirmed, sohoAID) {
        conn.query(`UPDATE sohocalendar SET confirmed = ? WHERE sohoAID in (?);`, [confirmed, sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getHomeworkforHomework: function (homeworkID, callback) {
        conn.query(`SELECT homework, dateOfClass FROM soholessonlog where sohoLID = ?`, [homeworkID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getNotesforNotes: function (notesID, callback) {
        conn.query(`SELECT notes, dateOfClass, sohousers.firstName, sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName'  FROM soholessonlog join sohousers on sohousers.sohoUID = soholessonlog.sohoUID join sohostudents on soholessonlog.sohoSID = sohostudents.sohoSID where sohoLID = ?;`, [notesID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getStudentforNotesCheck: function (sohoLID, callback) {
        conn.query(`select sohoSID from soholessonlog where sohoLID = ?`, [sohoLID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getStudentClassForLogin: function (sohoSID, callback) {
        conn.query(`SELECT * FROM sohoclasses WHERE sohoSID = ?`, [sohoSID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getLessonForLogin: function (sohoCID, callback) {
        conn.query(`select count(sohoLID) as 'count' from soholessonlog where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getTextforReading: function (hskLevel, callback) {
        conn.query(`SELECT * FROM sohotexts WHERE hskLevel = ? ORDER BY RAND() LIMIT 1`, [hskLevel],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    createStudentForStartOnboarding: function (firstName, lastName, email, pw, lang, slug, langHome, profileImage, timezone, refCode, callback) {
        conn.query(`INSERT INTO sohostudents (firstName, lastName, email, pw, lang, slug, langHome, profileImage, timezone, refCode) VALUES (?,?,?,?,?,?,?,?,?,?)`, [firstName, lastName, email, pw, lang, slug, langHome, profileImage, timezone, refCode],
            function (err, results, fields) {
                if (err) throw err;
                else {
                    console.log('Updated ' + results.affectedRows + ' row(s).')
                };
                return callback(results.insertId);
            });
    },
    checkIfSlugExists: function (slug, callback) {
        conn.query(`select slug from sohostudents where slug = ?;`, [slug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getStudentNameFromSlug: function (slug, callback) {
        conn.query(`select firstName, lastName from sohostudents where slug = ?;`, [slug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getSlugForRefer: function (sohoSID, callback) {
        conn.query(`select slug from sohostudents where sohoSID = ?;`, [sohoSID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getNumOfLessonsForLang: function (callback) {
        conn.query(`select sohoUID, count(sohoLID) as 'count' from soholessonlog where sohoUID in (2,5,6,10,13) group by sohoUID;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getStripeCustomerData: function (sohoSID, callback) {
        conn.query(`select firstName, lastName, stripeCustomerId, stripeSubscriptionItemId, email from sohostudents where sohoSID = ?;`, [sohoSID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    updateStripeCustomerId: function (stripeCustomerId, sohoSID) {
        conn.query(`UPDATE sohostudents SET stripeCustomerId = ? where sohoSID = ?`, [stripeCustomerId, sohoSID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    updateStripeSubscriptionItemId: function (stripeSubscriptionItemId, stripeGroupItemId, sohoSID) {
        conn.query(`UPDATE sohostudents SET stripeSubscriptionItemId = ?, stripeGroupItemId = ? where sohoSID = ?;`, [stripeSubscriptionItemId, stripeGroupItemId, sohoSID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getMessagesforRoom: function (sohoRID, callback) {
        conn.query(`select sender, content, messageType, sohomessages.ts, sohostudents.firstName as 'stuFirstName', sohostudents.lastName as 'stuLastName', sohostudents.profileImage as 'stuProfileImage', sohousers.firstName as 'teaFirstName', sohousers.lastName as 'teaLastName', sohousers.profileImage as 'teaProfileImage' from sohomessages left outer join sohostudents on sohomessages.sender = sohostudents.slug left outer join sohousers on sohomessages.sender = sohousers.slug where sohoRID = ? order by ts asc;`, [sohoRID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    saveMessage: function (content, sender, messageType, state, sohoRID) {
        conn.query(`INSERT INTO sohomessages (content, sender, messageType, state, sohoRID) VALUES (?,?,?,?,?)`, [content, sender, messageType, state, sohoRID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    saveMessageforChat: function (sohoRID, sender, content, state, messageType) {
        conn.query(`INSERT INTO sohomessages (sohoRID, sender, content, state, messageType) VALUES (?,?,?,?,?)`, [sohoRID, sender, content, state, messageType],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getRoomListForSohoMessages: function (slug, sohoUID, permission, callback) {
            conn.query(`select sohorooms.sohoRID, roomType, sender, state, content, sohomessages.ts, title from sohoroomsusers join sohorooms on sohorooms.sohoRID = sohoroomsusers.sohoRID left outer join sohomessages on sohomessages.sohoRID = sohorooms.sohoRID and sohoEID in (select max(sohoEID) from sohomessages group by sohoRID) where slug = ? group by sohorooms.sohoRID order by COALESCE(sohomessages.ts, sohorooms.ts) desc;`, [slug],
                function (err, results, fields) {
                    if (err) throw err;
                    return callback(results);
                });
    },
    createMessagingRoom: function (roomType, sohoCID, callback) {
        conn.query(`INSERT INTO sohorooms (roomType, sohoCID) VALUES (?,?);`, [roomType, sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                else {
                    console.log('Updated ' + results.affectedRows + ' row(s).')
                };
                return callback(results.insertId);
            });
    },
    createMessagingRoomPrac: function (roomType, title, sohoGID, callback) {
        conn.query(`INSERT INTO sohorooms (roomType, title, sohoGID) VALUES (?,?,?);`, [roomType, title, sohoGID],
            function (err, results, fields) {
                if (err) throw err;
                else {
                    console.log('Updated ' + results.affectedRows + ' row(s).')
                };
                return callback(results.insertId);
            });
    },
    getSpecificUserInRoom: function (sohoRID, slug, callback) {
        conn.query(`select sohoRID from sohoroomsusers where sohoRID = ? and slug = ?;`, [sohoRID, slug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getRoomIdJoinPractical: function (sohoAID, callback) {
        conn.query(`select sohoRID from sohocalendar left outer join sohorooms on sohorooms.sohoGID = sohocalendar.sohoGID where sohoAID = ?;`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getTeacherforMessages: function (sohoSID, callback) {
        conn.query(`select sohousers.firstName as 'teaFirstName', sohousers.lastName as 'teaLastName', seekingDialogue, dialogueFreq, wechat from sohoclasses join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where sohoclasses.sohoSID = ?;`, [sohoSID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getLastMessage: function (sohoRID, callback) {
        conn.query(`select DATE_FORMAT(ts, '%Y-%m-%dT%TZ') as 'ts' from sohomessages where  sohomessages.sohoRID = ? order by sohomessages.ts desc limit 1;`, [sohoRID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getEmailAddressBySlug: function (slug, callback) {
        conn.query(`SELECT firstName, lastName, email, slug, 'students' as 'source' FROM sohostudents WHERE slug = ? UNION ALL SELECT firstName, lastName, email, slug, 'teachers' as 'source' FROM sohousers WHERE slug = ?;`, [slug, slug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getMessagesSentByOtherPeople: function (sender, sohoRID, callback) {
        conn.query(`select sohoEID from sohomessages where sender != ? and sohoRID = ? and state = 'sent';`, [sender, sohoRID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    updateStateOfMessagesToRead: function (sohoEIDArr) {
        conn.query(`UPDATE sohomessages set state = 'read' where sohoEID in (?);`, [sohoEIDArr],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getFreeTimes: function (start, end, callback) {
        conn.query(`select sohoAID, start, GROUP_CONCAT(DISTINCT(lang) SEPARATOR ',') as 'lang' from sohocalendar join sohousers on sohousers.sohoUID = sohocalendar.sohoUID where start >= ? and end <= ? and free = 1 and acceptClass != '0' group by start order by start asc;`, [start, end],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getSelectedTeachers: function (selectedTimestamp, dialect, callback) {
        conn.query(`select sohocalendar.sohoUID, firstName, lastName, sohoAID, count(sohoclasses.sohoCID) as 'stuCount', start, rate, email, videoConfPMI from sohocalendar join sohousers on sohousers.sohoUID = sohocalendar.sohoUID left outer join sohoclasses on sohoclasses.sohoUID = sohousers.sohoUID and active = 1 where start = ? and free = 1 and acceptClass != '0' group by sohoclasses.sohoUID order by FIELD(sohousers.lang, FIND_IN_SET(?, sohousers.lang)) asc, stuCount asc limit 1;`, [selectedTimestamp, dialect],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    addClassforStart: function (sohoSID, sohoUID, className, hoursPurchased, hoursUsed, readWriteHSKLevel, listenSpeakHSKLevel, lang, classType, plan, callback) {
        conn.query(`INSERT INTO sohoclasses (sohoSID, sohoUID, className, hoursPurchased, hoursUsed, readWriteHSKLevel, listenSpeakHSKLevel, lang, classType, plan) VALUES (?,?,?,?,?,?,?,?,?,?)`, [sohoSID, sohoUID, className, hoursPurchased, hoursUsed, readWriteHSKLevel, listenSpeakHSKLevel, lang, classType, plan],
            function (err, results, fields) {
                if (err) throw err;
                else {
                    console.log('Updated ' + results.affectedRows + ' row(s).')
                };
                return callback(results.insertId);
            });
    },
    createUpcomingLessonStart: function (sohoSID, sohoUID, sohoCID, start, end, title, free, confirmed, lessonType) {
        conn.query(`INSERT INTO sohocalendar (sohoSID, sohoUID, sohoCID, start, end, title, free, confirmed, lessonType) VALUES (?,?,?,?,?,?,?,?,?)`, [sohoSID, sohoUID, sohoCID, start, end, title, free, confirmed, lessonType],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    updateFreeEventFromTeacherCalendar: function (sohoSID, sohoCID, title, sohoAID) {
        conn.query(`UPDATE sohocalendar set sohoSID = ?, sohoCID = ?, free = 0, title = ? where sohoAID = ?`, [sohoSID, sohoCID, title, sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getActiveClassesForHomeworkAssignment: function (callback) {
        conn.query(`select sohoclasses.readWriteHSKLevel ,sohoclasses.listenSpeakHSKLevel, homeworkAssigned,sohoclasses.sohoCID, sohoclasses.sohoUID, sohostudents.firstName as 'stuFirstName', sohostudents.email as 'stuEmail', sohousers.firstName as 'teaFirstName', toggleDailyHW, count(sohoHAID) as 'hwCount' from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID join sohousers on sohousers.sohoUID = sohoclasses.sohoUID left outer join sohohomeworkassignment on sohohomeworkassignment.sohoCID = sohoclasses.sohoCID and sohohomeworkassignment.state = 'stuAction' where active = 1 and listenSpeakHSKLevel != 1.0 and readWriteHSKLevel != 1.0 and toggleDailyHW != 0 group by sohoclasses.sohoCID;
        `,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getHomeworkForDailySchedule: function (order1, order2, order3, order4, callback) {
        conn.query(`select * from sohohomework where state = 'active' order by level asc, questionType = ? desc, questionType = ? desc, questionType = ? desc, questionType = ? desc;`, [order1, order2, order3, order4],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getHomeworkAssignments: function (sohoCID, sohoHID, callback) {
        conn.query(`select sohoHAID from sohohomeworkassignment where sohoCID = ? and sohoHID = ?;`, [sohoCID, sohoHID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    insertHomeworkAssignment: function (sohoHID, sohoCID, assignedBy, assignDate) {
        conn.query(`INSERT INTO sohohomeworkassignment (sohoHID, sohoCID, assignedBy, assignDate) VALUES (?,?,?,?);`, [sohoHID, sohoCID, assignedBy, assignDate],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    updateHomeworkAssigned: function (homeworkAssigned, sohoCID) {
        conn.query(`UPDATE sohoclasses set homeworkAssigned = ? where sohoCID = ?`, [homeworkAssigned, sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getAssignedHomeworkforHomework: function (sohoCID, callback) {
        conn.query(`select sohohomeworkassignment.sohoHAID, sohohomeworkassignment.sohoHID, sohoCID, answer, answerType, assignDate, assignedBy, sohohomeworkassignment.sohoHID, question, questionType, level, difficulty, sohohomeworkassignment.state, count(sohoHLID) as 'likeCount',  GROUP_CONCAT(sohousers.firstName, ' ', sohousers.lastName SEPARATOR ', ') as 'likeNames', content, lc.tFirstName, lc.tLastName, lc.sFirstName, lc.sLastName from sohohomeworkassignment join sohohomework on sohohomeworkassignment.sohoHID = sohohomework.sohoHID left outer join sohohomeworklike on sohohomeworklike.sohoHAID = sohohomeworkassignment.sohoHAID left outer join sohousers on sohousers.slug = sohohomeworklike.liker left outer join (select sohoHAID, content, sohousers.firstName as 'tFirstName', sohousers.lastName  as 'tLastName', sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName' from sohohomeworkcomment left outer join sohousers on sohousers.slug = sohohomeworkcomment.sender left outer join sohostudents on sohostudents.slug = sohohomeworkcomment.sender where sohoCOID in ( SELECT MAX(sohoCOID) FROM sohohomeworkcomment GROUP BY sohoHAID )) as lc on lc.sohoHAID = sohohomeworkassignment.sohoHAID where sohoCID = ? and sohohomeworkassignment.state in ('stuAction') group by sohohomeworkassignment.sohoHAID order by assignDate desc;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getHomeworkforHomeworkCompleted: function (sohoCID, callback) {
        conn.query(`select sohohomeworkassignment.sohoHAID, sohohomeworkassignment.sohoHID, sohoCID, answer, answerType, assignDate, assignedBy, sohohomeworkassignment.sohoHID, question, questionType, level, difficulty, sohohomeworkassignment.state, count(sohoHLID) as 'likeCount',  GROUP_CONCAT(sohousers.firstName, ' ', sohousers.lastName SEPARATOR ', ') as 'likeNames', content, lc.tFirstName, lc.tLastName, lc.sFirstName, lc.sLastName from sohohomeworkassignment join sohohomework on sohohomeworkassignment.sohoHID = sohohomework.sohoHID left outer join sohohomeworklike on sohohomeworklike.sohoHAID = sohohomeworkassignment.sohoHAID left outer join sohousers on sohousers.slug = sohohomeworklike.liker left outer join (select sohoHAID, content, sohousers.firstName as 'tFirstName', sohousers.lastName  as 'tLastName', sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName' from sohohomeworkcomment left outer join sohousers on sohousers.slug = sohohomeworkcomment.sender left outer join sohostudents on sohostudents.slug = sohohomeworkcomment.sender where sohoCOID in ( SELECT MAX(sohoCOID) FROM sohohomeworkcomment GROUP BY sohoHAID )) as lc on lc.sohoHAID = sohohomeworkassignment.sohoHAID where sohoCID = ? and sohohomeworkassignment.state in ('teaAction','complete','corrected') group by sohohomeworkassignment.sohoHAID order by assignDate desc;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getClassDataForHomework: function (sohoCID, callback) {
        conn.query(`select toggleDailyHW from sohoclasses where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    updateAnswerforHomeworkAssignmentStu: function (sohoHAID, state, text, answerType) {
        conn.query(`UPDATE sohohomeworkassignment set answer = ?, state = ?, answerType = ? where sohoHAID = ?`, [text, state, answerType, sohoHAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    updateAnswerforHomeworkAssignmentTea: function (sohoHAID, state, text) {
        conn.query(`UPDATE sohohomeworkassignment set answer = ?, state = ? where sohoHAID = ?`, [text, state, sohoHAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    updateAnswerforHomeworkAssignmentAutosaveStu: function (sohoHAID, text) {
        conn.query(`UPDATE sohohomeworkassignment set answer = ? where sohoHAID = ?;`, [text, sohoHAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    updateToggleDailyHW: function (toggle, sohoCID) {
        conn.query(`UPDATE sohoclasses set toggleDailyHW = ? where sohoCID = ?`, [toggle, sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getNotesForClassroom: function (sohoCID, callback) {
        conn.query(`select * from sohonotes where sohoCID = ? order by ts desc;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getMaxShuffleNoInNotes: function (sohoCID, callback) {
        conn.query(`select max(shuffle) as 'shuffle' from sohonotes where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    insertNewPageInNotes: function (sohoCID, shuffle, callback) {
        conn.query(`INSERT INTO sohonotes (sohoCID, shuffle, title) VALUES (?,?,'Untitled Page');`, [sohoCID, shuffle],
            function (err, results, fields) {
                if (err) throw err;
                else {
                    console.log('Updated ' + results.affectedRows + ' row(s).')
                };
                return callback(results.insertId);
            });
    },
    saveNotesForClassroomNotes: function (sohoNID, text) {
        conn.query(`UPDATE sohonotes set text = ? where sohoNID = ?`, [text, sohoNID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    saveNotesForClassroomGroupNotes: function (sohoCID, title, text, shuffle) {
        conn.query(`INSERT INTO sohonotes (sohoCID, title, text, shuffle) VALUES (?,?,?,?);`, [sohoCID, title, text, shuffle],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    deleteNotesForClassroomNotes: function (sohoNID) {
        conn.query(`DELETE FROM sohonotes where sohoNID = ?;`, [sohoNID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Deleted ' + results.affectedRows + ' rows(s).');
            });
    },
    updateTitleForClassroomNotes: function (text, notesID) {
        conn.query(`UPDATE sohonotes set title = ? where sohoNID = ?`, [text, notesID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getEmailAddressOfTeacherForSocketChat: function (slug, callback) {
        conn.query(`select sohousers.firstName, sohousers.email from sohostudents join sohoclasses on sohoclasses.sohoSID = sohostudents.sohoSID join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where sohostudents.slug = ?;`, [slug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getEmailDataForHomeworkAssignmentStu: function (sohoHAID, callback) {
        conn.query(`select answer, email as 'teaEmail', firstName as 'teaFirstName', className, question from sohohomeworkassignment join sohohomework on sohohomework.sohoHID = sohohomeworkassignment.sohoHID join sohoclasses on sohohomeworkassignment.sohoCID = sohoclasses.sohoCID join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where sohoHAID = ?;`, [sohoHAID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getEmailDataForHomeworkAssignmentTea: function (sohoHAID, callback) {
        conn.query(`select answer, email as 'stuEmail', firstName as 'stuFirstName', question from sohohomeworkassignment join sohohomework on sohohomework.sohoHID = sohohomeworkassignment.sohoHID join sohoclasses on sohohomeworkassignment.sohoCID = sohoclasses.sohoCID join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID where sohoHAID = ?;`, [sohoHAID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getAnswersForHomework: function (sohoHID, sohoCID, callback) {
        conn.query(`select sohoHAID, answer, assignDate, firstName, lastName from sohohomeworkassignment join sohoclasses on sohoclasses.sohoCID = sohohomeworkassignment.sohoCID join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID where sohoHID = ? and sohohomeworkassignment.sohoCID != ? and answer is not null and answer != '';`, [sohoHID, sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    updateAnswerforHomeworkSpeaking: function (sohoHAID, answer) {
        conn.query(`UPDATE sohohomeworkassignment set answer = ? where sohoHAID = ?`, [answer, sohoHAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getUnreadMessagesForLogin: function (slug, callback) {
        conn.query(`select count(*) as 'unreadMessagesCount' from sohoroomsusers join sohomessages on sohomessages.sohoRID = sohoroomsusers.sohoRID where slug = ? and state != 'read' and sender != ?;`, [slug, slug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },

    updateClassType: function (sohoCID, classType) {
        conn.query(`UPDATE sohoclasses set classType = ? where sohoCID = ?`, [classType, sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getEmailFreeUpgrade: function (slug, callback) {
        conn.query(`select sohostudents.email as 'stuEmail', sohousers.email as 'teaEmail', sohousers.firstName as 'teaFName' from sohostudents join sohoclasses on sohostudents.sohoSID = sohoclasses.sohoSID join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where sohostudents.slug = ?;`, [slug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getTeacherNameForSchedule: function (sohoCID, callback) {
        conn.query(`select firstName, lastName from sohoclasses join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getCalendarForSchedule: function (sohoUID, callback) {
        conn.query(`select * from sohocalendar where sohoUID = ? and free = 1`, [sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    getStudentDetailsForBookTheory: function (sohoCID, callback) {
        conn.query(`select className, email, timezone, firstName, lastName from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getTeacherEmailForScheduleRequest: function (sohoUID, callback) {
        conn.query(`select email, firstName, lastName, slug from sohousers where sohoUID = ?;`, [sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    getTeacherEmailForCancel: function (sohoCID, callback) {
        conn.query(`select firstName, email, className from sohoclasses join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    getEntryFormDataForBookTheory: function (sohoSID, callback) {
        conn.query(`select count(entryReadingLevel) as 'exist' from sohostudents where sohoSID = ?;`, [sohoSID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    updateStudentEntryForm: function (sohoSID, entryGoal, entryReadingLevel, entryListeningLevel, entryWritingLevel, entryHistory) {
        conn.query(`UPDATE sohostudents set entryGoal = ?, entryReadingLevel = ?, entryListeningLevel = ?, entryWritingLevel = ?, entryHistory = ? where sohoSID = ?`, [entryGoal, entryReadingLevel, entryListeningLevel, entryWritingLevel, entryHistory, sohoSID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    updateStudentEntryFormSpeaking: function (sohoSID, entrySpeakingLevel) {
        conn.query(`UPDATE sohostudents set entrySpeakingLevel = ? where sohoSID = ?`, [entrySpeakingLevel, sohoSID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getTeacherOfClass: function (sohoCID, callback) {
        conn.query(`select email from sohoclasses join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where sohoCID = ?`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    getLessonDataForConfirm: function (sohoAID, callback) {
        conn.query(`select start, sohostudents.firstName as 'sFirstName' , sohostudents.lastName as 'sLastName' ,sohostudents.email as 'sEmail',  sohousers.email as 'tEmail', sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName', sohocalendar.sohoUID from sohocalendar join sohousers on sohousers.sohoUID = sohocalendar.sohoUID join sohostudents on sohostudents.sohoSID = sohocalendar.sohoSID where sohoAID = ?;`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    get8EventForAcceptTrial: function (start, sohoUID, callback) {
        conn.query(`select sohoAID, start from sohocalendar where start in (?) and sohoUID = ?;`, [start, sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    storeCron: function (cronExpression, task, data, callback) {
        conn.query(`INSERT INTO sohocron (cronExpression, task, data) VALUES (?,?,?)`, [cronExpression, task, data],
            function (err, results, fields) {
                if (err) throw err;
                else {
                    console.log('Updated ' + results.affectedRows + ' row(s).')
                };
                return callback(results.insertId);
            });
    },
    deleteCron: function (sohoCRID) {
        conn.query(`DELETE FROM sohocron where sohoCRID in (?);`, [sohoCRID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Deleted ' + results.affectedRows + ' rows(s).');
            });
    },
    getFutureCrons: function (callback) {
        conn.query(`select * from sohocron;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    getUnconfirmedLessonCheck: function (groupSlug, callback) {
        conn.query(`select confirmed, entryGoal from sohocalendar join sohostudents on sohostudents.sohoSID = sohocalendar.sohoSID where groupSlug = ? and start > UTC_TIMESTAMP() order by start asc limit 1;`, [groupSlug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    deleteLesson: function (sohoLID) {
        conn.query(`DELETE FROM soholessonlog where sohoLID = ?;`, [sohoLID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Deleted ' + results.affectedRows + ' rows(s).');
            });
    },
    getCalendarDataUpdateFutureRecurring: function (sohoAID, callback) {
        conn.query(` select firstName as 'tFirstName', lastName as 'tLastName', groupName, sohocalendar.sohoUID from sohocalendar join sohousers on sohousers.sohoUID = sohocalendar.sohoUID join sohogroups on sohocalendar.sohoGID = sohogroups.sohoGID where sohoAID = ?;`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getEmailDataDeleteTheory: function (sohoAID, callback) {
        conn.query(`select sohostudents.timezone, sohostudents.firstName as 'sFirstName', sohousers.firstName as 'tFirstName',sohousers.lastName as 'tLastName', sohostudents.email, start from soholessonlog join sohocalendar on sohocalendar.sohoAID = soholessonlog.sohoAID join sohostudents on sohostudents.sohoSID = soholessonlog.sohoSID join sohousers on sohousers.sohoUID = soholessonlog.sohoUID where soholessonlog.sohoAID in (?);`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    deleteClassByCalendarId: function (sohoAID) {
        conn.query(`DELETE FROM soholessonlog where sohoAID in (?);`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Deleted ' + results.affectedRows + ' rows(s).');
            });
    },
    deleteEvent: function (sohoAID) {
        conn.query(`delete from sohocalendar where sohoAID in (?);`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Deleted ' + results.affectedRows + ' row(s).');
            });
    },
    deleteLessonAndCalendarEvent: function (sohoAID) {
        conn.query(`delete from soholessonlog where sohoAID in (?);`, [sohoAID],
        function (err, results, fields) {
            if (err) throw err;
            else console.log('Deleted ' + results.affectedRows + ' row(s).');
        });
        conn.query(`delete from sohocalendar where sohoAID in (?);`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Deleted ' + results.affectedRows + ' row(s).');
            });
    },
    createLessonEvent: function (sohoSID, sohoUID, sohoCID, start, end, title, free, groupSlug) {
        conn.query(`INSERT INTO sohocalendar (sohoSID, sohoUID, sohoCID, start, end, title, free, groupSlug) VALUES (?,?,?,?,?,?,?,?);`, [sohoSID, sohoUID, sohoCID, start, end, title, free, groupSlug],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },

    getStudentDataForStripeCreateSubscription: function (sohoCID, callback) {
        conn.query(`select rate from sohoclasses join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    updateTeacherRateForStripeCreateSubscription: function (sohoCID, rate) {
        conn.query(`update sohoclasses set teacherRate = ? where sohoCID = ?;`, [rate, sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    createLessonEventInstance: function (sohoSID, sohoUID, sohoCID, start, end, title, free, groupSlug, gcEventID, confirmed, lessonType) {
        conn.query(`INSERT INTO sohocalendar (sohoSID, sohoUID, sohoCID, start, end, title, free, groupSlug, gcEventID, confirmed, lessonType) VALUES (?,?,?,?,?,?,?,?,?,?,?);`, [sohoSID, sohoUID, sohoCID, start, end, title, free, groupSlug, gcEventID, confirmed, lessonType],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    createLessonEventInstanceSingle: function (sohoSID, sohoUID, sohoCID, start, end, title, free, gcEventID, groupSlug, confirmed, lessonType) {
        conn.query(`INSERT INTO sohocalendar (sohoSID, sohoUID, sohoCID, start, end, title, free, gcEventID, groupSlug, confirmed, lessonType) VALUES (?,?,?,?,?,?,?,?,?,?,?);`, [sohoSID, sohoUID, sohoCID, start, end, title, free, gcEventID, groupSlug, confirmed, lessonType],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    createLessonEventInstanceGroup: function (sohoUID, sohoGID, start, end, title, free, groupSlug, gcEventID, confirmed, lessonType) {
        conn.query(`INSERT INTO sohocalendar (sohoUID, sohoGID, start, end, title, free, groupSlug, gcEventID, confirmed, lessonType) VALUES (?,?,?,?,?,?,?,?,?,?);`, [sohoUID, sohoGID, start, end, title, free, groupSlug, gcEventID, confirmed, lessonType],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getStudentDataForStripeCreateSubscription: function (sohoCID, callback) {
        conn.query(`select rate from sohoclasses join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetUpcomingClassesForSohoStudents: function (sohoUID, callback) {
        conn.query(`select title, start, end, meetingUrl, sohocalendar.sohoCID, confirmed, CONCAT('[',GROUP_CONCAT(
            JSON_OBJECT(
              'className', className
            )
          ),']') as 'memberJSON',  count(sohoLID) as 'sCount', sohocalendar.lessonType
      from sohocalendar join soholessonlog on soholessonlog.sohoAID = sohocalendar.sohoAID left outer join sohoclasses on sohoclasses.sohoCID = soholessonlog.sohoCID where sohocalendar.sohoUID = ? and end > UTC_TIMESTAMP() and start < DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 DAY) and free = 0 and title is not null group by sohocalendar.sohoAID order by start asc;`, [sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    cancelUpcomingClass: function (title, sohoAID) {
        conn.query(`update sohocalendar set sohoSID = null, sohoCID = null, title = ? where sohoAID = ?;`, [title, sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getClassDataForCancel: function (sohoCID, callback) {
        conn.query(`select className from sohoclasses where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    getStudentEntryFormForOnboarding: function (sohoSID, callback) {
        conn.query(`select entryGoal from sohostudents where sohoSID = ?;`, [sohoSID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    getPMIForClassroom: function (sohoCID, callback) {
        conn.query(`select videoConfPMI from sohoclasses join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where sohoCID = ? limit 1;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    addRescheduleRequest: function (rescheduleRequest, sohoAID) {
        conn.query(`update sohocalendar set rescheduleRequest = ? where sohoAID = ?;`, [rescheduleRequest, sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getUnreadMessagesForMessages: function (slug, callback) {
        conn.query(`select sohoroomsusers.sohoRID, count(sohoroomsusers.sohoRID) as 'unreadMessagesCount' from sohoroomsusers join sohomessages on sohomessages.sohoRID = sohoroomsusers.sohoRID where slug = ? and state != 'read' and sender != ? group by sohoroomsusers.sohoRID;`, [slug, slug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    updateStateHomeworkAssignment: function (state, sohoHAID) {
        conn.query(`update sohohomeworkassignment set state = ? where sohoHAID = ?;`, [state, sohoHAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    updateStateHomework: function (state, sohoHID) {
        conn.query(`update sohohomework set state = ? where sohoHID = ?;`, [state, sohoHID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getUnreadHWCount: function (sohoCID, callback) {
        conn.query(`select count(sohoHAID) as 'count' from sohohomeworkassignment where sohoCID = ? and state in ('stuAction','corrected');`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getSuitableDialoguePartner: function (minListenSpeakLevel, maxListenSpeakLevel, listenSpeakLevel, slug, callback) {
        conn.query(`select slug, sohoCID from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID where listenSpeakHSKLevel >= ? and listenSpeakHSKLevel <= ? and slug != ? and seekingDialogue = 1 order by abs(listenSpeakHSKLevel - ?) asc;`, [minListenSpeakLevel, maxListenSpeakLevel, slug, listenSpeakLevel],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    updateSeekingDialogue: function (toggle, sohoCID) {
        conn.query(`update sohoclasses set seekingDialogue = ? where sohoCID = ?;`, [toggle, sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    addDialogueRoom: function (roomType, callback) {
        conn.query(`INSERT INTO sohorooms (roomType) VALUES (?);`, [roomType],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results.insertId);
            });
    },
    addRoomsUser: function (sohoRID, slug) {
        conn.query(`INSERT INTO sohoroomsusers (sohoRID, slug) VALUES (?,?);`, [sohoRID, slug],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getRoomsForMessages: function (slug, callback) {
        conn.query(`select sohorooms.sohoRID, roomType, sender, state, content, sohomessages.ts, title from sohoroomsusers join sohorooms on sohorooms.sohoRID = sohoroomsusers.sohoRID left outer join sohomessages on sohomessages.sohoRID = sohorooms.sohoRID and sohoEID in (select max(sohoEID) from sohomessages group by sohoRID) where slug = ? group by sohorooms.sohoRID  order by COALESCE(sohomessages.ts, sohorooms.ts) desc;`, [slug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getUsersInRoomsForMessages: function (sohoRID, slug, callback) {
        conn.query(`select sohoRID, sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName', sohostudents.profileImage 'sProfileImage', sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName', sohousers.profileImage as 'tProfileImage', dialogueFreq from sohoroomsusers left outer join sohostudents on sohoroomsusers.slug = sohostudents.slug left outer join sohousers on sohoroomsusers.slug = sohousers.slug  left outer join sohoclasses on sohoclasses.sohoSID = sohostudents.sohoSID where sohoRID in (?) and sohoroomsusers.slug != ?;`, [sohoRID, slug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getRoomUsers: function (sohoRID, callback) {
        conn.query(`select sohoroomsusers.slug, roomType, firstName, lastName, dialogueFreq from sohoroomsusers join sohorooms on sohorooms.sohoRID = sohoroomsusers.sohoRID left outer join sohostudents on sohoroomsusers.slug = sohostudents.slug left outer join sohoclasses on sohoclasses.sohosID = sohostudents.sohoSID where sohoroomsusers.sohoRID = ?;`, [sohoRID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getUserDataForDialogueAssign: function (sSlug, partnerSlug, callback) {
        conn.query(`select firstName, lastName, email, slug from sohostudents where slug in (?,?) UNION ALL select firstName, lastName, email, slug from sohousers where slug in (?,?) order by slug = ? desc;`, [sSlug, partnerSlug, sSlug, partnerSlug, sSlug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    updateDialogueFreq: function (dialogueFreq, sohoCID) {
        conn.query(`update sohoclasses set dialogueFreq = ? where sohoCID = ?;`, [dialogueFreq, sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getSimilarCRONsForDialogue: function (sohoRID, callback) {
        conn.query(`select * from sohocron where task = 'dialogueReminderTask' and JSON_UNQUOTE(JSON_EXTRACT(data, "$.sohoRID")) = ?;`, [sohoRID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    updateProfileImage: function (profileImage, sohoSID) {
        conn.query(`update sohostudents set profileImage = ? where sohoSID = ?;`, [profileImage, sohoSID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getStudentRoomsDialogueAssignment: function (slug, callback) {
        conn.query(`select sohorooms.sohoRID from sohoroomsusers join sohorooms on sohoroomsusers.sohoRID = sohorooms.sohoRID where slug = ? and roomType = 'dialogue';`, [slug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getMembersInDialogueRooms: function (sohoRID, slug, callback) {
        conn.query(`select distinct(slug) from sohoroomsusers where sohoRID in (?) and slug != ?;`, [sohoRID, slug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getRoomForLogin: function (sohoCID, callback) {
        conn.query(`SELECT sohoRID FROM sohorooms where sohoCID = ? and roomType = 'teaching';`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getStudentSlugDialogues: function (sohoUID, callback) {
        conn.query(`select slug from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID where sohoUID = ?;`, [sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getRoomsFromSlugsDialogues: function (slugArr, callback) {
        conn.query(`select sohoroomsusers.sohoRID from sohoroomsusers join sohorooms on sohorooms.sohoRID = sohoroomsusers.sohoRID where slug in (?) and roomType = 'dialogue' group by sohoroomsusers.sohoRID;`, [slugArr],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getStudentsFromRoomsDialogues: function (roomsArr, permission, callback) {
        if (permission == 0) { // admin
            conn.query(`select firstName, lastName, sohoroomsusers.sohoRID from sohoroomsusers join sohorooms on sohorooms.sohoRID = sohoroomsusers.sohoRID join sohostudents on sohostudents.slug = sohoroomsusers.slug where roomType = 'dialogue';`,
                function (err, results, fields) {
                    if (err) throw err;
                    return callback(results);
                });
        } else { // teacher
            conn.query(`select sohoRID, firstName, lastName from sohoroomsusers join sohostudents on sohostudents.slug = sohoroomsusers.slug where sohoRID in (?);`, [roomsArr],
                function (err, results, fields) {
                    if (err) throw err;
                    return callback(results);
                });
        }
    },
    getFreeSlotsBetween: function (start, end, sohoUID, callback) {
        conn.query(`select sohoAID from sohocalendar where start >= ? and end <= ? and sohoUID = ? and free = 1;`, [start, end, sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    bookSingleClass: function (sohoSID, sohoUID, sohoCID, start, end, title, free, groupSlug, confirmed, lessonType, manualBook, callback) {
        conn.query(`INSERT INTO sohocalendar (sohoSID, sohoUID, sohoCID, start, end, title, free, groupSlug, confirmed, lessonType, manualBook) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [sohoSID, sohoUID, sohoCID, start, end, title, free, groupSlug, confirmed, lessonType, manualBook],
        function (err, results, fields) {
            if (err) throw err;
            else {
                console.log('Inserted ' + results.affectedRows + ' row(s).')
            };
            return callback(results.insertId);
        });
    },
    bookSingleClassTypeB: function (sohoSID, sohoUID, sohoCID, start, end, title, free, groupSlug, confirmed, lessonType, manualBook, level) {
        conn.query(`INSERT INTO sohocalendar (sohoSID, sohoUID, sohoCID, start, end, title, free, groupSlug, confirmed, lessonType, manualBook, typebLevel) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [sohoSID, sohoUID, sohoCID, start, end, title, free, groupSlug, confirmed, lessonType, manualBook, level],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getEmailDataForRejectClass: function (sohoCID, callback) {
        conn.query(`select firstName, email from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getTimerForDay: function (date, sohoCID, callback) {
        conn.query(`select * from sohotimer where date = ? and sohoCID = ?;`, [date, sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    insertTime: function (sohoCID, date, time) {
        conn.query(`INSERT INTO sohotimer (sohoCID, date, time) VALUES (?,?,?);`, [sohoCID, date, time],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    updateTime: function (sohoTID, newTime) {
        conn.query(`update sohotimer set time = ? where sohoTID = ?;`, [newTime, sohoTID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getIncompleteHomework: function (sohoCID, callback) {
        conn.query(`select sohoHAID from sohohomeworkassignment where sohoCID = ? and assignedBy is null and state = 'stuAction' and answer is null;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    deleteHomework: function (sohoHAID) {
        conn.query(`DELETE FROM sohohomeworkassignment where sohoHAID in (?);`, [sohoHAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Deleted ' + results.affectedRows + ' rows(s).');
            });
    },
    getHomeworkStuAction: function (sohoCID, callback) {
        conn.query(`select count(*) as 'count' from sohohomeworkassignment where sohoCID = ? and state = 'stuAction';`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getHomeworkAssignmentDataForAuto: function (sohoCID, callback) {
        conn.query(`select sohoclasses.readWriteHSKLevel ,sohoclasses.listenSpeakHSKLevel, homeworkAssigned,sohoclasses.sohoCID, sohoclasses.sohoUID, sohostudents.firstName as 'stuFirstName', sohostudents.email as 'stuEmail', sohousers.firstName as 'teaFirstName', toggleDailyHW, count(sohoHAID) as 'hwCount' from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID join sohousers on sohousers.sohoUID = sohoclasses.sohoUID left outer join sohohomeworkassignment on sohohomeworkassignment.sohoCID = sohoclasses.sohoCID and sohohomeworkassignment.state = 'stuAction' where active = 1 and listenSpeakHSKLevel != 1.0 and readWriteHSKLevel != 1.0 and toggleDailyHW != 0 and sohoclasses.sohoCID = ? group by sohoclasses.sohoCID;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getSyllabus: function (callback) {
        conn.query(`select sohoYID, title from sohosyllabus;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getSyllabusViewByClass: function (sohoCID, callback) {
        conn.query(`select title, sohosyllabus.sohoYID from sohosyllabusview join sohosyllabus on sohosyllabus.sohoYID = sohosyllabusview.sohoYID where sohoCID = ? order by sohosyllabusview.ts desc;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getTeachersTypeB: function (callback) {
    conn.query(`select sohoUID, firstName, lastName from sohousers where typeb = 1;`,
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getTypeBClasses: function (callback) {
    conn.query(`select title, sohocalendar.sohoAID,  sohousers.sohoUID, sohousers.profileImage, sohocalendar.sohoUID, sohocalendar.start, level, sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName',count(distinct sohoLID) as 'sCount'   
         from sohocalendar join sohogroups on sohogroups.sohoGID = sohocalendar.sohoGID join sohousers on sohogroups.sohoUID = sohousers.sohoUID left outer join soholessonlog on soholessonlog.sohoAID = sohocalendar.sohoAID  left outer join sohostudents on sohostudents.sohoSID = soholessonlog.sohoSID  where sohocalendar.start BETWEEN UTC_TIMESTAMP() AND DATE_ADD(UTC_TIMESTAMP(),INTERVAL 14 DAY) and sohocalendar.sohoGID is not null group by sohocalendar.sohoAID order by level asc, start asc;`,
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getTypeBClassesBookPractical: function (sohoSID, callback) {
    conn.query(`select sohocalendar.sohoGID, sohoLID, title,  sohousers.sohoUID, sohousers.profileImage, sohocalendar.sohoAID, sohocalendar.sohoUID, sohocalendar.start, level, sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName', count(sohoLID) as 'groupMemberCount', SUM(soholessonlog.sohoSID = ? ) as userSignedUp from sohocalendar left outer join soholessonlog on soholessonlog.sohoAID = sohocalendar.sohoAID left outer join sohostudents on sohostudents.sohoSID = soholessonlog.sohoSID join sohogroups on sohogroups.sohoGID = sohocalendar.sohoGID join sohousers on sohogroups.sohoUID = sohousers.sohoUID where sohocalendar.start BETWEEN UTC_TIMESTAMP() AND DATE_ADD(UTC_TIMESTAMP(),INTERVAL 14 DAY) and sohocalendar.sohoGID is not null group by sohocalendar.sohoAID order by level asc, start asc;`,[sohoSID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getUniqueTeachersBookPractical: function (callback) {
    conn.query(`select distinct(sohocalendar.sohoUID), firstName, lastName from sohocalendar join sohousers on sohousers.sohoUID = sohocalendar.sohoUID where start BETWEEN UTC_TIMESTAMP() AND DATE_ADD(UTC_TIMESTAMP(),INTERVAL 14 DAY) and sohoGID is not null order by firstName asc;`,
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
insertCalendarEventRegister: function (sohoAID, sohoSID, sohoCID) {
    conn.query(`insert into sohocalendar (sohoSID, sohoUID, sohoCID, start, end, title, free, groupSlug, meetingUrl, rescheduleRequest, gcEventID, confirmed, lessonType, manualBook, typebLevel)
    select ?, sohoUID, ?, start, end, title, free, groupSlug, meetingUrl, rescheduleRequest, gcEventID, confirmed, lessonType, manualBook, typebLevel
    from sohocalendar where sohoAID = ?;`, [sohoSID, sohoCID, sohoAID],
        function (err, results, fields) {
            if (err) throw err;
            else console.log('Updated ' + results.affectedRows + ' row(s).');
        });
},
getCalendarEventsByGroupSlugRegister: function (groupSlug, callback) {
    conn.query(`select count(distinct(sohoCID)) as 'count' from sohocalendar where groupSlug = ?;`, [groupSlug],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getCalendarEventsByGroupSlug: function (groupSlug, callback) {
    conn.query(`select sohoAID from sohocalendar where groupSlug = ?;`, [groupSlug],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
updateEventWithGcalEventId: function (sohoAID, eventId) {
    conn.query(`update sohocalendar set gcEventID = ? where sohoAID = ?;`, [eventId, sohoAID],
        function (err, results, fields) {
            if (err) throw err;
            else console.log('Updated ' + results.affectedRows + ' row(s).');
        });
},







    sohoGetUserforLogin: function (email, callback) {
        conn.query(`select * from sohousers where email = ?`, [email],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoGetUserData: function (sohoUserLoggedIn, callback) {
        conn.query(`select * from sohousers where sohoUID = ?`, [sohoUserLoggedIn],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoGetSohoUsers: function (callback) {
        conn.query(`select * from sohousers;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoGetSohoUsersforAddClass: function (callback) {
        conn.query(`select * from sohousers`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoGetSohoStudentsforAddClass: function (callback) {
        conn.query(`select sohoSID, firstName, lastName, email from sohostudents order by sohoSID desc;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetStudentsData: function (sohoUID, permission, callback) {
        if (permission == 0) {
            conn.query(`select sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName', sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName', sohostudents.email, classType, primaryLevel, entryGoal, entryReadingLevel, entryHistory, entrySpeakingLevel, entryWritingLevel, entryListeningLevel, className, sohoclasses.sohoUID, sohoclasses.sohoCID, notes,toggleDailyHW, sohoclasses.readWriteHSKLevel, sohoclasses.listenSpeakHSKLevel, max(dateOfClass) as 'lastClass', min(start) as 'nextClass', count(distinct sohoLID) as 'classCount'from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID join sohousers on sohousers.sohoUID = sohoclasses.sohoUID left outer join soholessonlog on soholessonlog.sohoCID = sohoclasses.sohoCID  left outer join sohocalendar on sohocalendar.sohoCID = sohoclasses.sohoCID and sohocalendar.end > UTC_TIMESTAMP() where active = 1 group by sohoclasses.sohoCID order by lastClass desc;`,
                function (err, results, fields) {
                    if (err) throw err;
                    return callback(results);
                });
        } else { // teacher
            conn.query(`select sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName', sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName', sohostudents.email, classType, primaryLevel, entryGoal, entryReadingLevel, entryHistory, entrySpeakingLevel, entryWritingLevel, entryListeningLevel, className, sohoclasses.sohoUID, sohoclasses.sohoCID, notes,toggleDailyHW, sohoclasses.readWriteHSKLevel, sohoclasses.listenSpeakHSKLevel, max(dateOfClass) as 'lastClass', min(start) as 'nextClass', count(distinct sohoLID) as 'classCount' from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID join sohousers on sohousers.sohoUID = sohoclasses.sohoUID left outer join soholessonlog on soholessonlog.sohoCID = sohoclasses.sohoCID left outer join sohocalendar on sohocalendar.sohoCID = sohoclasses.sohoCID and sohocalendar.end > UTC_TIMESTAMP() where sohoclasses.sohoUID = ? and active = 1 group by sohoclasses.sohoCID order by lastClass desc;`, [sohoUID],
                function (err, results, fields) {
                    if (err) throw err;
                    return callback(results);
                });
        }

    },
    sohoGetInactiveStudentsData: function (callback) {
        conn.query(`select  sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName', sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName', sohostudents.email, sohoclasses.lang, className, sohoclasses.sohoUID, sohoCID from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where active = 0;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetFirstClasses: function (sohoUID, callback) {
        conn.query(`select sohoAID, sohoCID, firstName, lastName, start, end, confirmed, lessonType, manualBook, title from sohocalendar join sohostudents on sohostudents.sohoSID = sohocalendar.sohoSID where sohoUID = ? and confirmed in (0,-1);`, [sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetClassesPending: function (callback) {
        conn.query(`select sohoAID, classType,sohousers.firstName 'teaFirstName' ,sohousers.lastName 'teaLastName' , sohostudents.firstName as 'stuFirstName', sohostudents.lastName as 'stuLastName',langHome, entryGoal, entryHistory, entryReadingLevel, entrySpeakingLevel,  start, end, primaryLevel, confirmed, lessonType from sohocalendar join sohostudents on sohostudents.sohoSID = sohocalendar.sohoSID join sohousers on sohousers.sohoUID = sohocalendar.sohoUID join sohoclasses on sohocalendar.sohoCID = sohoclasses.sohoCID where confirmed in (-1,0,1) order by start asc;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetFutureClasses: function (callback) {
        conn.query(`select sohocalendar.sohoCID,sohousers.firstName 'teaFirstName' ,sohousers.lastName 'teaLastName' , sohostudents.firstName as 'stuFirstName', sohostudents.lastName as 'stuLastName',langHome, entryGoal, entryHistory, entryReadingLevel, entrySpeakingLevel,  start, end, primaryLevel, confirmed, classType from sohocalendar join sohostudents on sohostudents.sohoSID = sohocalendar.sohoSID join sohousers on sohousers.sohoUID = sohocalendar.sohoUID join sohoclasses on sohoclasses.sohoCID = sohocalendar.sohoCID where confirmed in (2) and start > UTC_TIMESTAMP() order by start asc;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetStudentsDataforRecordClass: function (sohoUID, callback) {
        conn.query(`select * from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID where sohoclasses.sohoUID = ? and active = 1;`, [sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetClassOfStudent: function (sohoCID, callback) {
        conn.query(`select className, hoursUsed, sohoclasses.sohoSID, hoursPurchased, classType, count(sohoLID) as 'lessonCount' from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID left outer join soholessonlog on soholessonlog.sohoCID = sohoclasses.sohoCID where sohoclasses.sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetClassOfStudentTypeB: function (sohoCIDArr, callback) {
        conn.query(`select className, hoursUsed, sohoclasses.sohoCID, sohoclasses.sohoSID, hoursPurchased, classType, count(sohoLID) as 'lessonCount' from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID left outer join soholessonlog on soholessonlog.sohoCID = sohoclasses.sohoCID where sohoclasses.sohoCID in (?) group by sohoclasses.sohoCID;`, [sohoCIDArr],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    getStudentDetailsSohoMessages: function (sohoCID, callback) {
        conn.query(`select className, sohoRID from sohoclasses join sohorooms on sohorooms.sohoCID = sohoclasses.sohoCID where sohoclasses.sohoCID = ? and roomType = 'teaching' limit 1;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetStudentsDataforLessonHistory: function (sohoCID, callback) {
        conn.query(`select dateOfClass, hours, soholessonlog.ts, sohoLID, sohoCID, lessonType from soholessonlog join sohostudents where sohostudents.sohoSID = soholessonlog.sohoSID and sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetStudentsNameforLessonHistory: function (sohoCID, callback) {
        conn.query(`select firstName, lastName from sohostudents join sohoclasses where sohostudents.sohoSID = sohoclasses.sohoSID and sohoclasses.sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetClassDataforPurchasedHours: function (callback) {
        conn.query(`select * from sohoclasses`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetUnapprovedTransactions: function (callback) {
        conn.query(`select * from sohotransactionlog join sohostudents where sohostudents.sohoSID = sohotransactionlog.sohoSID and approval = 0;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetHoursPurchasedforAddPurchasedHours: function (sohoCID, callback) {
        conn.query(`select * from sohoclasses where sohoCID = ?`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },

    sohoGetEmailsofUsers: function (email, callback) {
        conn.query(`select * from sohousers where email = ?`, [email],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetExpiryDateOfToken: function (token, callback) {
        conn.query(`SELECT * FROM sohousers WHERE resetPasswordToken = ?`, [token],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoGetStudentDataforRecordClassEmail: function (sohoCID, callback) {
        conn.query(`select * from sohostudents join sohoclasses where sohostudents.sohoSID = sohoclasses.sohoSID and sohoCID in (?);`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },

    sohoGetStudentDataFromID: function (sohoSID, callback) {
        conn.query(`select * from sohostudents where sohoSID = ?;`, [sohoSID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoAddNewUser: function (firstName, lastName, email, rate, password, slug) {
        conn.query(`INSERT INTO sohousers (firstName, lastName, email, rate, pw, slug) VALUES (?,?,?,?,?,?)`, [firstName, lastName, email, rate, password, slug],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoAddClasstoLessonLog: function (sohoCID, sohoSID, sohoUID, hours, hoursLeft, dateOfClass, readWriteHSKLevel, listenSpeakHSKLevel, payment, lessonType) {
        conn.query(`INSERT INTO soholessonlog (sohoCID, sohoSID, sohoUID, hours, hoursLeft, dateOfClass, readWriteHSKLevel, listenSpeakHSKLevel, payment, lessonType) VALUES (?,?,?,?,?,?,?,?,?,?)`, [sohoCID, sohoSID, sohoUID, hours, hoursLeft, dateOfClass, readWriteHSKLevel, listenSpeakHSKLevel, payment, lessonType],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoAddClasstoLessonLogV2: function (sohoCID, sohoSID, sohoUID, hours, hoursLeft, dateOfClass, readWriteHSKLevel, listenSpeakHSKLevel, payment, lessonType, sohoAID) {
        conn.query(`INSERT INTO soholessonlog (sohoCID, sohoSID, sohoUID, hours, hoursLeft, dateOfClass, readWriteHSKLevel, listenSpeakHSKLevel, payment, lessonType, sohoAID) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [sohoCID, sohoSID, sohoUID, hours, hoursLeft, dateOfClass, readWriteHSKLevel, listenSpeakHSKLevel, payment, lessonType, sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoUpdateClassDetails: function (totalHoursUsed, sohoCID, readWriteHSKLevel, listenSpeakHSKLevel) {
        conn.query(`update sohoclasses set hoursUsed = ?, readWriteHSKLevel = ?, listenSpeakHSKLevel = ? where sohoCID = ?;`, [totalHoursUsed, readWriteHSKLevel, listenSpeakHSKLevel, sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoUpdateHoursPurchasedforAddPurchasedHours: function (hoursTotal, sohoCID) {
        conn.query(`update sohoclasses set hoursPurchased = ? where sohoCID = ?;`, [hoursTotal, sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    //allocates a token and expiry date of token for society that forgot password
    sohoAllocateTokenandExpiryDate: function (email, token, expiryDate, callback) {
        conn.query(`UPDATE sohousers SET resetPasswordToken = ?, resetPasswordExpires = ? WHERE email = ?`, [token, expiryDate, email],
            function (err, results, fields) {
                if (err) throw err;
                else return callback(results);
            });
    },
    sohoClearTokenandExpiryDate: function (token) {
        conn.query(`UPDATE sohousers SET resetPasswordToken = '', resetPasswordExpires = '' WHERE resetPasswordToken = ?`, [token],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoResetPassword: function (hash, token) {
        conn.query(`UPDATE sohousers SET pw = ?, resetPasswordToken = ?, resetPasswordExpires = ? WHERE resetPasswordToken = ?`, [hash, '', '', token],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoApproveTransaction: function (sohoTID) {
        conn.query(`UPDATE sohotransactionlog SET approval = 1 where sohoTID = ?`, [sohoTID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoGetClassDataforSalary: function (callback) {
        conn.query(`select sohoCID, firstName, lastName, className, sohoclasses.sohoUID, active, classType, rate from sohoclasses join sohousers on sohoclasses.sohoUID = sohousers.sohoUID order by active desc;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoGetLessonLogforSalaryTheory: function (callback) {
        conn.query(`select * from soholessonlog where lessonType in ('standard','free');`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoGetLessonLogforSalaryPractical: function (sohoUID, permission, callback) {
        if (permission == 0) {
            conn.query(`select soholessonlog.sohoUID, soholessonlog.sohoCID, rate, firstName as 'tFirstName', lastName as 'tLastName', className, dateOfClass, soholessonlog.ts, hours, lessonType from soholessonlog join sohoclasses on sohoclasses.sohoCID = soholessonlog.sohoCID join sohousers on sohousers.sohoUID = soholessonlog.sohoUID where lessonType in ('typeb') order by dateOfClass asc;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
        } else {
            conn.query(`select soholessonlog.sohoUID, soholessonlog.sohoCID, rate, firstName as 'tFirstName', lastName as 'tLastName', className, dateOfClass, soholessonlog.ts, hours, lessonType from soholessonlog join sohoclasses on sohoclasses.sohoCID = soholessonlog.sohoCID join sohousers on sohousers.sohoUID = soholessonlog.sohoUID where lessonType in ('typeb') and soholessonlog.sohoUID = ? order by dateOfClass asc;`, [sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
        }
    },
    sohoGetLessonLogDateRangeforSalary: function (startDate, endDate, callback) {
        conn.query(`SELECT * FROM soholessonlog WHERE dateOfClass between ? and ? and lessonType in ('standard','free');`, [startDate, endDate], // This is an super inefficient way of doing it but it works... in the future need to change the db storage of date of class from varchar to date
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoGetLessonLogDateRangeSalaryPractical: function (startDate, endDate,  sohoUID, permission, callback) {
        if (permission == 0) {
            conn.query(`select soholessonlog.sohoUID, soholessonlog.sohoCID, rate, firstName as 'tFirstName', lastName as 'tLastName', className, dateOfClass, soholessonlog.ts, hours, lessonType from soholessonlog join sohoclasses on sohoclasses.sohoCID = soholessonlog.sohoCID join sohousers on sohousers.sohoUID = soholessonlog.sohoUID where lessonType in ('typeb') and dateOfClass between ? and ? order by dateOfClass asc;`, [startDate, endDate], // This is an super inefficient way of doing it but it works... in the future need to change the db storage of date of class from varchar to date
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
        } else {
            conn.query(`select soholessonlog.sohoUID, soholessonlog.sohoCID, rate, firstName as 'tFirstName', lastName as 'tLastName', className, dateOfClass, soholessonlog.ts, hours, lessonType from soholessonlog join sohoclasses on sohoclasses.sohoCID = soholessonlog.sohoCID join sohousers on sohousers.sohoUID = soholessonlog.sohoUID where lessonType in ('typeb') and dateOfClass between ? and ? and soholessonlog.sohoUID = ? order by dateOfClass asc;`, [startDate, endDate, sohoUID], // This is an super inefficient way of doing it but it works... in the future need to change the db storage of date of class from varchar to date
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
        }
        
    },
    sohoGetSumOfHoursDateRangeforAnalytics: function (startDate, endDate, callback) {
        conn.query(`SELECT sum(hours) as 'hours' FROM soholessonlog join sohoclasses on sohoclasses.sohoCID = soholessonlog.sohoCID WHERE classType in ('standard','free') and dateOfClass between ? and ?;`, [startDate, endDate], // This is an super inefficient way of doing it but it works... in the future need to change the db storage of date of class from varchar to date
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoGetLessonLogDateRangeforAnalytics: function (startDate, endDate, callback) {
        conn.query(`SELECT DATE_FORMAT(dateOfClass, '%d-%m-%Y') as 'dateOfClassFormatted', sum(soholessonlog.hours) as 'hours' FROM soholessonlog join sohoclasses on soholessonlog.sohoCID = sohoclasses.sohoCID WHERE classType in ('standard','free') and dateOfClass BETWEEN ? and ? group by day(dateOfClass) order by dateOfClass desc;`, [startDate, endDate], // This is an super inefficient way of doing it but it works... in the future need to change the db storage of date of class from varchar to date
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoGetUniqueStudentDataforAnalytics: function (startDate, endDate, callback) {
        conn.query(`SELECT count(distinct(soholessonlog.sohoCID)) as 'count' FROM soholessonlog join sohoclasses on soholessonlog.sohoCID = sohoclasses.sohoCID WHERE classType in ('standard','free') and dateOfClass between ? and ?`, [startDate, endDate], // This is an super inefficient way of doing it but it works... in the future need to change the db storage of date of class from varchar to date
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoGetUserDataforSalary: function (callback) {
        conn.query(`select * from sohousers`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoGetStudentforStartClass: function (teacherID, permission, callback) {
        if (permission == 0) { // admin
            conn.query(`select className, sohoclasses.sohoCID, sohoclasses.readWriteHSKLevel, sohoclasses.listenSpeakHSKLevel, classType, ifnull(count(sohoLID),0) as 'lessonCount' from sohoclasses left outer join soholessonlog on soholessonlog.sohoCID = sohoclasses.sohoCID where active = 1 group by sohoclasses.sohoCID order by className asc;`, [teacherID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
        } else { // teacher
            conn.query(`select className, sohoclasses.sohoCID, sohoclasses.readWriteHSKLevel, sohoclasses.listenSpeakHSKLevel, classType, ifnull(count(sohoLID),0) as 'lessonCount' from sohoclasses left outer join soholessonlog on soholessonlog.sohoCID = sohoclasses.sohoCID where sohoclasses.sohoUID = ? and active = 1 group by sohoclasses.sohoCID order by className asc;`, [teacherID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
        }
       
    },
    sohoGetAllActiveStudentforStartClass: function (callback) {
        conn.query(`select className, sohoclasses.sohoCID, classType, ifnull(count(sohoLID),0) as 'lessonCount' from sohoclasses left outer join soholessonlog on soholessonlog.sohoCID = sohoclasses.sohoCID where active = 1 group by sohoclasses.sohoCID order by className asc;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoGetAllStudentforGroupNotes: function (callback) {
        conn.query(`select className, sohoclasses.sohoCID from sohoclasses order by className asc;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoGetStudentEmailforAddClass: function (sohoSID, callback) {
        conn.query(`select firstName, lastName, email from sohostudents where sohoSID = ?;`, [sohoSID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoDeleteLesson: function (sohoLID) {
        conn.query(`DELETE FROM soholessonlog where sohoLID = ?;`, [sohoLID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Deleted ' + results.affectedRows + ' rows(s).');
            });
    },
    sohoDeleteCalendar: function (sohoAID) {
        conn.query(`DELETE FROM sohocalendar where sohoAID in (?);`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Deleted ' + results.affectedRows + ' rows(s).');
            });
    },
    sohoGetSohoClasses: function (sohoCID, callback) {
        conn.query(`select * from sohoclasses where sohoCID = ?`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetCalendarForSohoCalendar: function (sohoUID, callback) {
        conn.query(`select sohocalendar.sohoAID, start, end, title, groupSlug, sohoGID, gcEventID, count(sohoLID) as 'stuCount',
        CONCAT('[',GROUP_CONCAT(
                            JSON_OBJECT(
                                'sohoSID', sohostudents.sohoSID,
                              'sFirstName', sohostudents.firstName,
                               'sLastName', sohostudents.lastName
                            )
                          ),']') as 'studentJSON'
        
         from sohocalendar left outer join soholessonlog on soholessonlog.sohoAID = sohocalendar.sohoAID left outer join sohostudents on sohostudents.sohoSID = soholessonlog.sohoSID where free = 0 and sohocalendar.sohoUID = ? group by sohoAID;`, [sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    getCalendarForStart: function (momStart, mom2Weeks, callback) {
        conn.query(`select sohocalendar.sohoUID, lang, start from sohocalendar join sohousers on sohousers.sohoUID = sohocalendar.sohoUID where start > ? and start < ? and free = 1 and acceptClass != '0' order by start asc;`, [momStart, mom2Weeks],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    updateHoursUsed: function (sohoCID, hoursUsed) {
        conn.query(`UPDATE sohoclasses SET hoursUsed = ? where sohoCID = ?;`, [hoursUsed, sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getStudentsForCalendarAdd: function (sohoUID, callback) {
        conn.query(`select sohoCID, className from sohoclasses where sohoUID = ? and active = 1;`, [sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    getGroupsForCalendarAdd: function (sohoUID, callback) {
        conn.query(`select sohoGID, groupName from sohogroups where sohoUID = ?;`, [sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    getStudentFromClasses: function (sohoCID, callback) {
        conn.query(`SELECT sohoclasses.sohoSID, sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName', sohostudents.email as 'sEmail', sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName', sohousers.email as 'tEmail', sohoclasses.sohoUID from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },

    sohoGetEvent: function (sohoAID, callback) {
        conn.query(`SELECT * from sohocalendar where sohoAID = ?;`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoCalendarRemoveEvent: function (sohoAID) {
        conn.query(`DELETE FROM sohocalendar where sohoAID in (?);`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Deleted ' + results.affectedRows + ' rows(s).');
            });
    },
    getCalendarIdByGroupSlugFuture: function (groupSlug, start, callback) {
        conn.query(` select sohoAID, gcEventId from sohocalendar where groupSlug = ? and start >= ?;`, [groupSlug, start],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getEarliestInstanceOfGroupSlugCalendar: function (groupSlug, callback) {
        conn.query(`select min(start) as 'earliestEvent' from sohocalendar where groupSlug = ?;`, [groupSlug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getCalendarIdByGroupSlugFutureRecurring: function (groupSlug, start, callback) {
        conn.query(` select sohocalendar.sohoAID, gcEventId,   CONCAT('[',GROUP_CONCAT(
            JSON_OBJECT(
              'sEmail', sohostudents.email,
              'sFirstName', sohostudents.firstName,
              'tFirstName', sohousers.firstName,
              'tLastName', sohousers.lastName,
              'timezone', sohostudents.timezone          )
          ),']') as 'memberJSON',sohousers.email as 'tEmail', start as 'oldStart' from sohocalendar left outer join soholessonlog on soholessonlog.sohoAID = sohocalendar.sohoAID left outer join sohostudents on sohostudents.sohoSID = soholessonlog.sohoSID left outer  join sohousers on sohousers.sohoUID = soholessonlog.sohoUID where groupSlug = ? and start >= ? group by sohocalendar.sohoAID;`, [groupSlug, start],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getStartByCalendarId: function (sohoAID, callback) {
        conn.query(` select start from sohocalendar where sohoAID = ?;`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoCalendarRemoveEventWithArray: function (sohoAIDs, callback) {
        conn.query(`DELETE FROM sohocalendar where sohoAID IN (?);`, [sohoAIDs],
            function (err, results, fields) {
                if (err) throw err;
                else {
                    console.log('Deleted ' + results.affectedRows + ' rows(s).');
                    return callback(results);
                }
            });
    },
    sohoCalendarAddEventFree: function (sohoUID, start, end, free, groupSlug) {
        conn.query(`INSERT INTO sohocalendar (sohoUID, start, end, free, groupSlug) VALUES (?,?,?,?,?)`, [sohoUID, start, end, free, groupSlug],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoCalendarUpdateEvent: function (sohoAID, start, end) {
        conn.query(`UPDATE sohocalendar SET start = ?, end = ? where sohoAID = ?;`, [start, end, sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoCalendarUpdateEventRescheduleFuture: function (sohoAID, start, end, gcEventId) {
        conn.query(`UPDATE sohocalendar SET start = ?, end = ?, gcEventID = ? where sohoAID = ?;`, [start, end, gcEventId, sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoCalendarUpdateEventRecurringAll: function (sohoAID, start, end, gcEventID, callback) {
        conn.query(`UPDATE sohocalendar SET start = ?, end = ?, gcEventID = ? where sohoAID = ?;`, [start, end, gcEventID, sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else {
                    console.log('Updated ' + results.affectedRows + ' row(s).');
                    return callback(results);
                }
            });
    },
    sohoUpdateStudentLimit: function (sohoUID, studentLimit) {
        conn.query(`UPDATE sohousers SET acceptClass = ? where sohoUID = ?;`, [studentLimit, sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getsohoAIDsByGroupSlug: function (groupSlug, callback) {
        conn.query(`select sohoAID from sohocalendar where groupSlug = ?;`, [groupSlug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getCalendarDataByGroupSlug: function (groupSlug, callback) {
        conn.query(`select gcEventID, sohoAID from sohocalendar where groupSlug = ?;`, [groupSlug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getDataForConfirmAttendance: function (sohoCID, callback) {
        conn.query(`select sohostudents.email as 'sEmail', sohostudents.firstName, sohousers.email as 'tEmail' from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getStripeUsagePerMonth: function (startOfMonth, endOfMonth, callback) {
        conn.query(`SELECT sohostudents.sohoSID, sum(IF((lessonType='standard' OR lessonType = 'theory'), hours, 0)) as 'theoryQty', sum(IF((lessonType='typeb' OR lessonType ='practical'), hours, 0)) as 'pracQty', stripeSubscriptionItemId, stripeGroupItemId, firstName, lastName, email, practicalCredit FROM soholessonlog join sohostudents on sohostudents.sohoSID = soholessonlog.sohoSID join sohoclasses on sohoclasses.sohoSID = sohostudents.sohoSID WHERE lessonType in ('standard', 'typeb', 'practical','theory') and dateOfClass BETWEEN ?
        AND ? and payment = 'card' group by sohoSID;`, [startOfMonth, endOfMonth],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
            
            // can't remove dateofclass yet because some classes dont have start - manual book - SELECT sohostudents.sohoSID, sum(IF((soholessonlog.lessonType='standard' OR soholessonlog.lessonType = 'theory'), hours, 0)) as 'theoryQty', sum(IF((soholessonlog.lessonType='typeb' OR soholessonlog.lessonType ='practical'), hours, 0)) as 'pracQty', stripeSubscriptionItemId, stripeGroupItemId, firstName, lastName, email, practicalCredit FROM soholessonlog join sohostudents on sohostudents.sohoSID = soholessonlog.sohoSID left outer join sohocalendar on sohocalendar.sohoAID = soholessonlog.sohoAID WHERE soholessonlog.lessonType in ('standard', 'typeb', 'practical','theory') and dateOfClass BETWEEN '2021-11-01T00:00:00Z'
            // AND  '2021-12-01T00:00:00Z' and payment = 'card' group by sohoSID;
    },
    sohoConfirmTrialClass: function (sohoLID) {
        conn.query(`UPDATE sohocalendar SET confirmed = 1 where sohoAID = ?;`, [sohoLID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoConfirmBookedClass: function (sohoLID) {
        conn.query(`UPDATE sohocalendar SET confirmed = 2 where sohoAID = ?;`, [sohoLID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    updateStateCalendarEvent: function (confirmed, sohoAID) {
        conn.query(`UPDATE sohocalendar SET confirmed = ? where sohoAID in (?);`, [confirmed, sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoSetActiveClass: function (sohoCID) {
        conn.query(`UPDATE sohoclasses SET active = 1 where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoRejectTrialClass: function (sohoAID) {
        conn.query(`UPDATE sohocalendar SET confirmed = '-1' where sohoAID = ?;`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoGetDataAcceptTrialStudent: function (sohoAID, callback) {
        conn.query(`select sohocalendar.sohoSID as 'sohoSID', sohocalendar.sohoCID as 'sohoCID', className, sohousers.sohoUID, sohostudents.email as 'sEmail', sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName', primaryLevel, start,end , sohousers.email as 'tEmail', sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName', sohousers.slug as 'tSlug', videoConfPMI, sohousers.profileImage as 'tProfileImage' from sohocalendar join sohostudents on sohostudents.sohoSID = sohocalendar.sohoSID join sohousers on sohousers.sohoUID = sohocalendar.sohoUID join sohoclasses on sohoclasses.sohoCID = sohocalendar.sohoCID where sohoAID = ?;`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetDataRejectTrialStudent: function (sohoAID, callback) {
        conn.query(`select sohostudents.timezone, sohostudents.email as 'sEmail', sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName',start, sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName' from sohocalendar join sohostudents on sohostudents.sohoSID = sohocalendar.sohoSID join sohousers on sohousers.sohoUID = sohocalendar.sohoUID join sohoclasses on sohoclasses.sohoCID = sohocalendar.sohoCID where sohoAID = ?;`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoAddAutomatedTeacherMessageForTrial: function (sohoRID, teaSlug, content, state) {
        conn.query(`INSERT INTO sohomessages (sohoRID, sender, content, state) VALUES (?,?,?,?)`, [sohoRID, teaSlug, content, state],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getAllGroupClasses: function (permission, sohoUID, callback) {
        if (permission == 0) {
            conn.query(`select sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName', sohogroups.sohoGID, groupName, start, level from sohogroups join sohousers on sohousers.sohoUID = sohogroups.sohoUID left outer join sohogroupsmembers on sohogroupsmembers.sohoGID = sohogroups.sohoGID left outer join sohoclasses on sohoclasses.sohoCID = sohogroupsmembers.sohoCID group by sohogroups.sohoGID order by level asc;`,
                function (err, results, fields) {
                    if (err) throw err;
                    return callback(results);
                })
        } else {
            conn.query(`select sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName', sohogroups.sohoGID, groupName, start, level from sohogroups join sohousers on sohousers.sohoUID = sohogroups.sohoUID left outer join sohogroupsmembers on sohogroupsmembers.sohoGID = sohogroups.sohoGID left outer join sohoclasses on sohoclasses.sohoCID = sohogroupsmembers.sohoCID where sohogroups.sohoUID = ? group by sohogroups.sohoGID order by level asc;`,[sohoUID],
                function (err, results, fields) {
                    if (err) throw err;
                    return callback(results);
                })
        }
    },
    getTeachersGroupClassCreate: function (callback) {
        conn.query(`select firstName, lastName, sohoUID from sohousers;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getFreeRuleTeacher: function (sohoUID, callback) {
        conn.query(`select freeRule,timezone from sohousers where sohoUID = ?;`,[sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    createNewGroupClass: function (sohoUID, groupName, start, level, callback) {
        conn.query(`INSERT INTO sohogroups (sohoUID, groupName, start, level) VALUES (?,?,?,?);`, [sohoUID, groupName, start, level],
        function (err, results, fields) {
            if (err) throw err;
            else {
                console.log('Updated ' + results.affectedRows + ' row(s).')
            };
            return callback(results.insertId);
        });
    },
    sohoGetClassesForSohoHomework: function (sohoUID, permission, callback) {
        if (permission == 0) {
            conn.query(`select sohoclasses.sohoCID, className, sum(state='teaAction') as 'sumTeaAction', firstName, lastName, sohoclasses.sohoUID from sohoclasses left outer join sohohomeworkassignment on sohohomeworkassignment.sohoCID = sohoclasses.sohoCID join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where active = 1 group by sohoclasses.sohoCID order by sohoclasses.sohoUID = ? desc, sohoclasses.sohoUID asc, className asc;`, [sohoUID],
                function (err, results, fields) {
                    if (err) throw err;
                    return callback(results);
                });
        } else { // teacher
            conn.query(`select sohoclasses.sohoCID, className, sum(state='teaAction') as 'sumTeaAction', sohoclasses.sohoUID from sohoclasses left outer join sohohomeworkassignment on sohohomeworkassignment.sohoCID = sohoclasses.sohoCID where active = 1 and sohoUID = ? group by sohoclasses.sohoCID order by className asc;`, [sohoUID],
                function (err, results, fields) {
                    if (err) throw err;
                    return callback(results);
                });
        }
    },
    sohoGetHomeworkToMarkForSohoHomework: function (sohoCIDArr, permission, preloadClassID, slug, callback) {
        if (preloadClassID == null) { // only get unmarked homework if there is no specified preload class id
            if (permission == 0) { // admin
                conn.query(`select sohohomeworkassignment.sohoCID, sohohomeworkassignment.sohoHID, sohohomeworkassignment.sohoHAID, level, questionType, lastUpdated, assignedBy, difficulty, question, answer, answerType, toggleDailyHW, sohohomeworkassignment.state, className, count(sohoHLID) as 'likeCount', sum(case when liker = ? then 1 else 0 end) as 'userLikeCount', content, lc.tFirstName, lc.tLastName, lc.sFirstName, lc.sLastName from sohohomeworkassignment join sohohomework on sohohomework.sohoHID = sohohomeworkassignment.sohoHID join sohoclasses on sohohomeworkassignment.sohoCID = sohoclasses.sohoCID left outer join sohohomeworklike on sohohomeworklike.sohoHAID = sohohomeworkassignment.sohoHAID left outer join (select sohoHAID, content, sohousers.firstName as 'tFirstName', sohousers.lastName  as 'tLastName', sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName' from sohohomeworkcomment left outer join sohousers on sohousers.slug = sohohomeworkcomment.sender left outer join sohostudents on sohostudents.slug = sohohomeworkcomment.sender where sohoCOID in ( SELECT MAX(sohoCOID) FROM sohohomeworkcomment GROUP BY sohoHAID )) as lc on lc.sohoHAID = sohohomeworkassignment.sohoHAID where sohohomeworkassignment.sohoCID in (?) and sohohomeworkassignment.state = 'teaAction' group by sohohomeworkassignment.sohoHAID order by lastUpdated asc;
            `, [slug, sohoCIDArr],
                    function (err, results, fields) {
                        if (err) throw err;
                        return callback(results);
                    });
            } else { // teacher
                conn.query(`select sohohomeworkassignment.sohoCID, sohohomeworkassignment.sohoHID, sohohomeworkassignment.sohoHAID, level, questionType, lastUpdated, assignedBy, difficulty, question, answer, answerType, toggleDailyHW, sohohomeworkassignment.state, className, count(sohoHLID) as 'likeCount', sum(case when liker = ? then 1 else 0 end) as 'userLikeCount', content, lc.tFirstName, lc.tLastName, lc.sFirstName, lc.sLastName from sohohomeworkassignment join sohohomework on sohohomework.sohoHID = sohohomeworkassignment.sohoHID join sohoclasses on sohohomeworkassignment.sohoCID = sohoclasses.sohoCID left outer join sohohomeworklike on sohohomeworklike.sohoHAID = sohohomeworkassignment.sohoHAID  left outer join (select sohoHAID, content, sohousers.firstName as 'tFirstName', sohousers.lastName  as 'tLastName', sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName' from sohohomeworkcomment left outer join sohousers on sohousers.slug = sohohomeworkcomment.sender left outer join sohostudents on sohostudents.slug = sohohomeworkcomment.sender where sohoCOID in ( SELECT MAX(sohoCOID) FROM sohohomeworkcomment GROUP BY sohoHAID )) as lc on lc.sohoHAID = sohohomeworkassignment.sohoHAID where sohohomeworkassignment.sohoCID in (?) and sohohomeworkassignment.state = 'teaAction' group by sohohomeworkassignment.sohoHAID order by lastUpdated asc;`, [slug, sohoCIDArr],
                    function (err, results, fields) {
                        if (err) throw err;
                        return callback(results);
                    });
            }
        } else { // if there is a preloaded class then return empty hwtomark object
            return callback(null);
        }
    },

    sohoGetHomeworkForHomeworkAll: function (callback) {
        conn.query(`select sohoHID, questionType, level, state from sohohomework where state != 'inactive' order by state = 'teaRepo' desc, state = 'active' desc, INET_ATON(level), questionType, ts;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetHomeworkForHomeworkCollection: function (teacherSlug, callback) {
        conn.query(`select sohoHID, question, questionType, level, difficulty, firstName, lastName,DATE_FORMAT(sohohomework.ts, '%Y-%m-%dT%TZ') as 'ts' from sohohomework join sohousers on sohohomework.teacherCreated = sohousers.slug where sohohomework.teacherCreated = ? order by INET_ATON(level), questionType, ts;`, [teacherSlug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetHomeworkAssignmentsForSohoHomework: function (sohoCID, lastUpdatedDate, slug, callback) {
        if (lastUpdatedDate == '' || lastUpdatedDate == 'null') { // there is no last updated date defined in the query - normal homework view
            conn.query(`select sohohomeworkassignment.sohoCID, sohohomeworkassignment.sohoHID, sohohomeworkassignment.sohoHAID, level, questionType, assignedBy, difficulty, question, answer, answerType, sohohomeworkassignment.state, lastUpdated, count(sohoHLID) as 'likeCount', sum(case when liker = ? then 1 else 0 end) as 'userLikeCount', content, lc.tFirstName, lc.tLastName, lc.sFirstName, lc.sLastName from sohohomeworkassignment join sohohomework on sohohomework.sohoHID = sohohomeworkassignment.sohoHID join sohoclasses on sohohomeworkassignment.sohoCID = sohoclasses.sohoCID left outer join sohohomeworklike on sohohomeworklike.sohoHAID = sohohomeworkassignment.sohoHAID left outer join (select sohoHAID, content, sohousers.firstName as 'tFirstName', sohousers.lastName  as 'tLastName', sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName' from sohohomeworkcomment left outer join sohousers on sohousers.slug = sohohomeworkcomment.sender left outer join sohostudents on sohostudents.slug = sohohomeworkcomment.sender where sohoCOID in ( SELECT MAX(sohoCOID) FROM sohohomeworkcomment GROUP BY sohoHAID )) as lc on lc.sohoHAID = sohohomeworkassignment.sohoHAID where sohohomeworkassignment.sohoCID = ? group by sohohomeworkassignment.sohoHAID order by sohohomeworkassignment.state = 'teaAction' desc,  sohohomeworkassignment.state = 'corrected' desc, sohohomeworkassignment.state = 'stuAction' desc, sohohomeworkassignment.state = 'complete' desc, assignDate desc;`, [slug, sohoCID],
                function (err, results, fields) {
                    if (err) throw err;
                    return callback(results);
                })
        } else { // lastupdated date is defined, filtered view
            conn.query(`select sohohomeworkassignment.sohoCID, sohohomeworkassignment.sohoHID, sohohomeworkassignment.sohoHAID, level, questionType, assignedBy, difficulty, question, answer, answerType, sohohomeworkassignment.state, lastUpdated, count(sohoHLID) as 'likeCount', sum(case when liker = ? then 1 else 0 end) as 'userLikeCount', content, lc.tFirstName, lc.tLastName, lc.sFirstName, lc.sLastName from sohohomeworkassignment join sohohomework on sohohomework.sohoHID = sohohomeworkassignment.sohoHID join sohoclasses on sohohomeworkassignment.sohoCID = sohoclasses.sohoCID left outer join sohohomeworklike on sohohomeworklike.sohoHAID = sohohomeworkassignment.sohoHAID left outer join (select sohoHAID, content, sohousers.firstName as 'tFirstName', sohousers.lastName  as 'tLastName', sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName' from sohohomeworkcomment left outer join sohousers on sohousers.slug = sohohomeworkcomment.sender left outer join sohostudents on sohostudents.slug = sohohomeworkcomment.sender where sohoCOID in ( SELECT MAX(sohoCOID) FROM sohohomeworkcomment GROUP BY sohoHAID )) as lc on lc.sohoHAID = sohohomeworkassignment.sohoHAID where sohohomeworkassignment.sohoCID = ? and lastUpdated > ? and answer is not null order by sohohomeworkassignment.state = 'teaAction' desc, sohohomeworkassignment.state = 'stuAction' desc, sohohomeworkassignment.state = 'complete' desc, assignDate desc;`, [slug, sohoCID, lastUpdatedDate],
                function (err, results, fields) {
                    if (err) throw err;
                    return callback(results);
                })
        }
    },
    sohoGetHomeworkForHomeworkCreate: function (sohoHID, callback) {
        conn.query(`select * from sohohomework where sohoHID = ?;`, [sohoHID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoCreateNewHomework: function (questionType, question, level, difficulty, teacherCreated, state, callback) {
        conn.query(`INSERT INTO sohohomework (question, questionType, level, difficulty, teacherCreated, state) VALUES (?,?,?,?,?,?)`, [question, questionType, level, difficulty, teacherCreated, state],
            function (err, results, fields) {
                if (err) throw err;
                else {
                    console.log('Updated ' + results.affectedRows + ' row(s).')
                };
                return callback(results.insertId);
            });
    },
    sohoGetActiveClasses: function (sohoUID, permission, callback) {
        if (permission == 0) { // admin
            conn.query(`select sohoclasses.sohoUID, className, sohoCID, firstName, lastName from sohoclasses join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where active = 1 order by sohoclasses.sohoUID = ? desc, sohoclasses.sohoUID asc;`, [sohoUID],
                function (err, results, fields) {
                    if (err) throw err;
                    return callback(results);
                });
        } else { // teacher
            conn.query(`select sohoclasses.sohoUID, className, sohoCID from sohoclasses where active = 1 and sohoUID = ?;`, [sohoUID],
                function (err, results, fields) {
                    if (err) throw err;
                    return callback(results);
                });
        }

    },
    sohoCreateNewHomeworkAssignment: function (sohoHID, sohoCID, sohoUID, assignDate) {
        conn.query(`INSERT INTO sohohomeworkassignment (sohoHID, sohoCID, assignedBy, assignDate) VALUES (?,?,?,?)`, [sohoHID, sohoCID, sohoUID, assignDate],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoGetClassDataForSohoHomeworkCreate: function (sohoCID, callback) {
        conn.query(`select sohostudents.email, sohostudents.firstName as 'stuFirstName', sohousers.firstName as 'teaFirstName'  from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetClassDataForSohoHomeworkAssign: function (sohoCID, callback) {
        conn.query(`select sohostudents.email, sohostudents.firstName as 'stuFirstName', sohousers.firstName as 'teaFirstName'  from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetClassesForSohoClassNotes: function (sohoUID, callback) {
            conn.query(`select sohoclasses.sohoUID, className, firstName, lastName, sohoclasses.sohoCID from sohoclasses join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where active = 1 order by sohoclasses.sohoUID = ? desc, sohoclasses.sohoUID asc, className asc;`, [sohoUID],
                function (err, results, fields) {
                    if (err) throw err;
                    return callback(results);
                });
    },
    sohoGetClassNotes: function (sohoCID, callback) {
        conn.query(`select * from sohonotes where sohoCID = ? order by ts desc;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoGetLessonLogDataForAnalytics: function (callback) {
        conn.query(`select * from soholessonlog;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    sohoUpdateHomework: function (question, questionType, level, difficulty, sohoHID) {
        conn.query(`update sohohomework set question = ?, questionType = ?, level = ?, difficulty = ? where sohoHID = ?;`, [question, questionType, level, difficulty, sohoHID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoGetHomeworkStatusData: function (callback) {
        conn.query(`select sohohomeworkassignment.sohoCID, count(answer) as 'answered', count(*) as 'total'  from sohohomeworkassignment join sohoclasses on sohoclasses.sohoCID = sohohomeworkassignment.sohoCID group by className order by assignDate asc;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
    getUnreadMessagesForSohoLogin: function (slug, callback) {
        conn.query(`select count(*) as 'unreadMsgCount' from sohoroomsusers join sohomessages on sohomessages.sohoRID = sohoroomsusers.sohoRID where slug = ? and state != 'read' and sender != ?;`, [slug, slug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getUnreadHWForSoho: function (permission, sohoUID, callback) {
        if (permission == 0) {
            conn.query(`select sum(state='teaAction') as 'unreadHWCount' from sohoclasses left outer join sohohomeworkassignment on sohohomeworkassignment.sohoCID = sohoclasses.sohoCID where active = 1;`,
                function (err, results, fields) {
                    if (err) throw err;
                    return callback(results);
                });
        } else { // teacher
            conn.query(`select sum(state='teaAction') as 'unreadHWCount' from sohoclasses left outer join sohohomeworkassignment on sohohomeworkassignment.sohoCID = sohoclasses.sohoCID where active = 1 and sohoUID = ?;`, [sohoUID],
                function (err, results, fields) {
                    if (err) throw err;
                    return callback(results);
                });
        }
    },
    deletePendingClass: function (sohoLID) {
        conn.query(`DELETE FROM sohocalendar where sohoAID = ?;`, [sohoLID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Deleted ' + results.affectedRows + ' rows(s).');
            });
    },
    sohoCalendarGetFreeEvent: function (sohoUID, start, end, callback) {
        conn.query(`select sohoAID from sohocalendar where sohoUID = ? and start = ? and end = ? and free = 1;`, [sohoUID, start, end],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoCalendarGetEventStart: function (sohoUID, start, end, callback) {
        conn.query(`select sohoAID, start, end from sohocalendar where sohoUID = ? and start >= ? and start < ? and free = 0;`, [sohoUID, start, end],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoCalendarGetFreeClash: function (sohoUID, start, end, callback) {
        conn.query(`select sohoAID, start, end from sohocalendar where sohoUID = ? and start >= ? and end <= ? and free = 1;`, [sohoUID, start, end],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoCalendarGetEventCount: function (sohoUID, groupSlug, callback) {
        conn.query(`select count(*) as count from sohocalendar where sohoUID = ? and groupSlug = ?;`, [sohoUID, groupSlug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getAllTeachersForCalendar: function (callback) {
        conn.query(`select firstName, lastName, sohoUID from sohousers;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getUserDataForCalendar: function (sohoUID, callback) {
        conn.query(`select sohousers.acceptClass, count(*) as numStudents from sohousers join sohoclasses on sohoclasses.sohoUID = sohousers.sohoUID where sohousers.sohoUID = ? and active = 1 limit 1;`, [sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getUserDataForLimit: function (sohoUID, callback) {
        conn.query(`select sohousers.acceptClass, count(*) as numStudents from sohousers join sohoclasses on sohoclasses.sohoUID = sohousers.sohoUID where sohousers.sohoUID = ? and active = 1 limit 1;`, [sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getStudentLimitCalendar: function (sohoUID, callback) {
        conn.query(`select acceptClass from sohousers where sohoUID = ? limit 1;`, [sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    makeInactiveClass: function (sohoCID) {
        conn.query(`update sohoclasses set active = 0 where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    makeActiveClass: function (sohoCID) {
        conn.query(`update sohoclasses set active = 1 where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoGetRescheduleRequests: function (sohoUID, callback) {
        conn.query(`select a.sohoCID, a.sohoUID, a.sohoSID, a.sohoAID, a.start, a.end, a.title, b.sohoAID as 'newSohoAID', b.start as 'newStart' from sohocalendar a join sohocalendar b on a.rescheduleRequest = b.sohoAID where a.sohoUID = ? and a.rescheduleRequest is not null order by a.start asc;`, [sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    deleteOldClassFromCalendar: function (sohoAID) {
        conn.query(`DELETE from sohocalendar where sohoAID = ?;`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Deleted ' + results.affectedRows + ' rows(s).');
            });
    },
    rescheduleNewClassFromCalendar: function (sohoSID, sohoCID, end, title, sohoAID) {
        conn.query(`update sohocalendar set sohoSID = ?, sohoCID = ?, end = ?, title = ?, free = 0 where sohoAID = ?;`, [sohoSID, sohoCID, end, title, sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    deleteRescheduleRequest: function (sohoAID) {
        conn.query(`update sohocalendar set rescheduleRequest = null where sohoAID = ?;`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    rescheduleNewClassManual: function (start, end, sohoAID) {
        conn.query(`update sohocalendar set start = ?, end = ?, groupSlug = null, rescheduleRequest = null where sohoAID = ?;`, [start, end, sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    deleteClassReschedule: function (sohoAID) {
        conn.query(`DELETE from sohocalendar where sohoAID = ?;`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Deleted ' + results.affectedRows + ' rows(s).');
            });
    },
    getEmailDataforReschedule: function (sohoSID, callback) {
        conn.query(`select firstName, email from sohostudents where sohoSID = ?;`, [sohoSID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getSupportChannels: function (callback) {
        conn.query(`select className, sohorooms.sohoRID, active, sohoclasses.sohoUID, roomType, SUM(IF(state != 'read', 1, 0)) as 'unreadMsgCount', sohorooms.sohoCID, firstName, lastName from sohorooms join sohoclasses on sohoclasses.sohoCID = sohorooms.sohoCID join sohousers on sohousers.sohoUID = sohoclasses.sohoUID left outer join sohomessages on sohomessages.sohoRID = sohorooms.sohoRID where roomType = 'support' group by sohorooms.sohoRID order by active desc, unreadMsgCount desc;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getClassForChangeTeacher: function (callback) {
        conn.query(`select sohoCID, className, sohostudents.slug as 'stuSlug', sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName', sohousers.slug as 'teaSlug' from sohoclasses join sohousers on sohousers.sohoUID = sohoclasses.sohoUID join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID order by sohoCID desc;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getEmailDataFromCalendar: function (sohoAID, callback) {
        conn.query(`select sohostudents.email as 'sEmail', sohousers.email as 'tEmail', gcEventID from soholessonlog join sohostudents on sohostudents.sohoSID = soholessonlog.sohoSID join sohousers on soholessonlog.sohoUID = sohousers.sohoUID join sohocalendar on sohocalendar.sohoAID = soholessonlog.sohoAID where soholessonlog.sohoAID = ?;`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getEmailDataFromCalendarCancelPrac: function (sohoAID, callback) {
        conn.query(`select sohostudents.email as 'sEmail', sohousers.email as 'tEmail', gcEventID from sohocalendar left outer join sohousers on sohocalendar.sohoUID = sohousers.sohoUID left outer join soholessonlog on sohocalendar.sohoAID = soholessonlog.sohoAID left outer join sohostudents on sohostudents.sohoSID = soholessonlog.sohoSID where sohocalendar.sohoAID = ?;`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getUsersForChangeTeacher: function (callback) {
        conn.query(`select firstName, lastName, slug, sohoUID from sohousers;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    updateTeacherinClasses: function (sohoCID, sohoUID) {
        conn.query(`update sohoclasses set sohoUID = ? where sohoCID = ?;`, [sohoUID, sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getRoomChangeTeacher: function (sohoCID, slug, callback) {
        conn.query(`select sohoRUID from sohorooms join sohoroomsusers on sohoroomsusers.sohoRID = sohorooms.sohoRID where sohoCID = ? and roomType = 'teaching' and slug != ?;`, [sohoCID, slug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    updateRoomsChangeTeacher: function (slug, sohoRUID) {
        conn.query(`update sohoroomsusers set slug = ? where sohoRUID = ?;`, [slug, sohoRUID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getUpcomingClassesChangeTeacher: function (sohoCID, callback) {
        conn.query(`select sohoAID from sohocalendar where sohoCID = ? and start > UTC_TIMESTAMP();`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    updateTeacherUpcomingClassesChangeTeacher: function (upcomingClassArr, sohoUID) {
        conn.query(`update sohocalendar set sohoUID = ? where sohoAID in (?)`, [sohoUID, upcomingClassArr],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getTeacherForStuTransferred: function (sohoCID, callback) {
        conn.query(`select firstName, lastName, email, sohoSID from sohoclasses join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getStudentForStuTransferred: function (sohoSID, callback) {
        conn.query(`select firstName, lastName, email, primaryLevel, langHome, confirmed, start, end, lessonType from sohostudents join sohocalendar on sohocalendar.sohoSID = sohostudents.sohoSID where sohostudents.sohoSID = ? and start > UTC_TIMESTAMP();`, [sohoSID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getStudentDetailsForStuTransferred: function (sohoSID, callback) {
        conn.query(`select firstName, lastName, email, primaryLevel, langHome from sohostudents where sohostudents.sohoSID = ?`, [sohoSID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    setInactiveHomework: function (sohoHID) {
        conn.query(`update sohohomework set state = 'inactive' where sohoHID = ?;`, [sohoHID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    sohoGetHomeworkForSohoHomeworkAssign: function (sohoHID, callback) {
        conn.query(`select question, level from sohohomework where sohoHID = ? limit 1;`, [sohoHID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoGetLastLesson: function (sohoCID, callback) {
        conn.query(`select max(dateOfClass) as 'lastLessonDate' from soholessonlog where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    sohoGetHomeworkUpdated: function (lastLessonDate, sohoCID, callback) {
        conn.query(`select count(*) as 'count' from sohohomeworkassignment where lastUpdated > ? and sohoCID = ? and answer is not null;`, [lastLessonDate, sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getLevelsOfClass: function (sohoCID, callback) {
        conn.query(`select readWriteHSKLevel, listenSpeakHSKLevel from sohoclasses where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    createSyllabus: function (title, callback) {
        conn.query(`INSERT INTO sohosyllabus (title) VALUES (?);`, [title],
            function (err, results, fields) {
                if (err) throw err;
                else {
                    console.log('Updated ' + results.affectedRows + ' row(s).')
                };
                return callback(results.insertId);
            });
    },
    createSyllabusPage: function (sohoYID, callback) {
        conn.query(`INSERT INTO sohosyllabuspages (sohoYID) VALUES (?);`, [sohoYID],
            function (err, results, fields) {
                if (err) throw err;
                else {
                    console.log('Updated ' + results.affectedRows + ' row(s).')
                };
            });
    },
    getSyllabusIDByPageID: function (sohoYPID, callback) {
        conn.query(`select sohoYID from sohosyllabuspages where sohoYPID = ?;`, [sohoYPID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getSyllabus: function (callback) {
        conn.query(`select sohoYID, title from sohosyllabus;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getSyllabusPagesByID: function (sohoYID, callback) {
        conn.query(`select sohoYPID, content, notes from sohosyllabuspages where sohoYID = ?;`, [sohoYID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getSyllabusViewByClassIdStartClass: function (sohoCID, sohoYID, callback) {
        conn.query(`select sohoYVID from sohosyllabusview where sohoCID = ? and sohoYID = ?;`, [sohoCID, sohoYID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    insertSyllabusView: function (sohoCID, sohoYID) {
        conn.query(`INSERT INTO sohosyllabusview (sohoCID, sohoYID) VALUES (?,?);`, [sohoCID, sohoYID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getSyllabusDataByID: function (sohoYID, callback) {
        conn.query(`select sohoYPID, content, notes, title from sohosyllabuspages join sohosyllabus on sohosyllabus.sohoYID = sohosyllabuspages.sohoYID where sohosyllabuspages.sohoYID = ?;`, [sohoYID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    addSyllabusPage: function (sohoYID) {
        conn.query(`INSERT INTO sohosyllabuspages (sohoYID) VALUES (?);`, [sohoYID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    saveSyllabus: function (sohoYPID, content, notes) {
        conn.query(`update sohosyllabuspages set content = ?, notes = ? where sohoYPID = ?;`, [content, notes, sohoYPID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    saveSyllabusTitle: function (title, sohoYID) {
        conn.query(`update sohosyllabus set title = ? where sohoYID = ?;`, [title, sohoYID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    updateSyllabus: function (title, content, sohoYID) {
        conn.query(`update sohosyllabus set title = ?, content = ? where sohoYID = ?;`, [title, content, sohoYID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    addLikeHomeworkAssignment: function (liker, sohoHAID) {
        conn.query(`INSERT INTO sohohomeworklike (liker, sohoHAID) VALUES (?,?)`, [liker, sohoHAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    addCommentHomework: function (sender, content, sohoHAID) {
        conn.query(`INSERT INTO sohohomeworkcomment (sender, content, sohoHAID) VALUES (?,?,?);`, [sender, content, sohoHAID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getComments: function (sohoHAID, callback) {
        conn.query(`SELECT sender, content, sohousers.firstName as 'tFirstName', sohousers.lastName  as 'tLastName', sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName' from sohohomeworkcomment left outer join sohousers on sohousers.slug = sohohomeworkcomment.sender left outer join sohostudents on sohostudents.slug = sohohomeworkcomment.sender where sohoHAID = ? order by sohohomeworkcomment.ts asc;`, [sohoHAID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    updateStudentDetailsNotes: function (text, sohoCID) {
        conn.query(`update sohoclasses set notes = ? where sohoCID = ?;`, [text, sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getHomeworkById: function (sohoHID, callback) {
        conn.query(`select sohoHID, difficulty, firstName, lastName, questionType, DATE_FORMAT(sohohomework.ts, '%Y-%m-%dT%TZ') as 'ts', state, question, level from sohohomework join sohousers on sohousers.slug = sohohomework.teacherCreated where sohoHID = ?;`, [sohoHID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getOldHomeworkAssignment: function (sohoHAID, callback) {
        conn.query(`select answer from sohohomeworkassignment where sohoHAID = ?;`, [sohoHAID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getTeacherDataBySlug: function (senderSlug, receiverSlug, callback) {
        conn.query(`select videoConfPMI from sohousers where slug in (?, ?);`, [senderSlug, receiverSlug],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getTeacherDataById: function (sohoUID, callback) {
        conn.query(`select email, firstName, lastName from sohousers where sohoUID in (?);`, [sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getSyllabusforStartClass: function (callback) {
        conn.query(`select sohoYID, title from sohosyllabus;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    updatePlanSubscription: function (plan, sohoCID) {
        conn.query(`update sohoclasses set plan = ?, classType = 'standard' where sohoCID = ?;`, [plan, sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getClassPlan: function (sohoCID, callback) {
        conn.query(`select plan from sohoclasses where sohoCID = ?;`, [sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    updateGroupNotesTeacher: function (sohoUID, text) {
        conn.query(`update sohousers set groupNotes = ? where sohoUID = ?;`, [text, sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getSavedGroupNotes: function (sohoUID, callback) {
        conn.query(`select groupnotes from sohousers where sohoUID = ?;`, [sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getTeacherMeetingData: function (sohoUID, callback) {
        conn.query(`select videoConfPMI from sohousers where sohoUID = ?;`, [sohoUID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getAllStudentBackground: function (callback) {
        conn.query(`select sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName', sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName', sohostudents.email, classType, primaryLevel, entryGoal, entryReadingLevel, entryHistory, entrySpeakingLevel, entryWritingLevel, entryListeningLevel, className, sohoclasses.sohoUID, sohoclasses.sohoCID, notes,toggleDailyHW, sohoclasses.readWriteHSKLevel, sohoclasses.listenSpeakHSKLevel from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID join sohousers on sohousers.sohoUID = sohoclasses.sohoUID where classType != 'test';`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getAllStudentsGroupClass: function (callback) {
        conn.query(`select className, sohoclasses.sohoCID from sohoclasses order by className asc;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    insertGroupMemberGroupClass: function (sohoCID, sohoGID) {
        conn.query(`insert into sohogroupsmembers(sohoCID, sohoGID) values (?,?);`, [sohoCID, sohoGID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    removeGroupMemberGroupClass: function (sohoGMID) {
        conn.query(`delete from sohogroupsmembers where sohoGMID = ?;`, [sohoGMID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    addPendingMemberToGroup: function (state, sohoGID, sohoCID) {
        conn.query(`insert into sohogroupsmembers(state, sohoGID, sohoCID) values (?,?,?);`, [state, sohoGID, sohoCID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    getPendingGroupMembers: function (permission, callback) {
        if (permission == 0) { // admins only
        conn.query(`select a.sohoGMID, a.sohoCID, c.className, a.sohoGID, level, groupName, start, firstName as 'tFirstName', lastName as 'tLastName', CONCAT('[',GROUP_CONCAT(
            JSON_OBJECT(
              'className', d.className,
              'state', b.state
            )
          ),']') as 'memberJSON'  from sohogroupsmembers a join sohoclasses c on c.sohoCID = a.sohoCID join sohogroups on sohogroups.sohoGID = a.sohoGID join sohousers on sohousers.sohoUID = sohogroups.sohoUID join sohogroupsmembers b on b.sohoGID = sohogroups.sohoGID join sohoclasses d on d.sohoCID = b.sohoCID where a.state = 'pending' group by a.sohoGMID;`,
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
        } else {
            var data = {};
            return callback(data);
        }
    },
    getAttendeeDataByCalendarId: function (sohoAID, callback) {
        conn.query(` select sohocalendar.sohoAID, sohousers.email as 'tEmail', start,  CONCAT('[',GROUP_CONCAT(
            JSON_OBJECT(
              'sEmail', sohostudents.email            )
          ),']') as 'memberJSON' from soholessonlog join sohocalendar on sohocalendar.sohoAID = soholessonlog.sohoAID join sohostudents on sohostudents.sohoSID = soholessonlog.sohoSID join sohousers on sohousers.sohoUID = soholessonlog.sohoUID where soholessonlog.sohoAID in (?) group by soholessonlog.sohoAID;`, [sohoAID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    updateGroupMemberState: function (state, sohoGMID) {
        conn.query(`update sohogroupsmembers set state = ? where sohoGMID = ?;`, [state, sohoGMID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
    deleteGroupMember: function (sohoGMID) {
        conn.query(`delete from sohogroupsmembers where sohoGMID = ?;`, [sohoGMID],
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Deleted ' + results.affectedRows + ' row(s).');
            });
    },
    getGroupDataForAcceptJoinGroup: function (sohoGMID, callback) {
        conn.query(`select groupName, start, sohogroups.sohoUID, sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName', sohousers.email as 'tEmail', sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName', sohostudents.email as 'sEmail' from sohogroupsmembers join sohogroups on sohogroups.sohoGID = sohogroupsmembers.sohoGID join sohousers on sohousers.sohoUID = sohogroups.sohoUID join sohoclasses on sohoclasses.sohoCID = sohogroupsmembers.sohoCID join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID where sohoGMID = ?;`, [sohoGMID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getGroupAddDataForCalendarAdd: function (sohoGID, callback) {
        conn.query(`select groupName, sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName', sohostudents.email as 'sEmail',sohogroups.sohoUID, sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName', sohousers.email as 'tEmail' from sohogroups join sohousers on sohousers.sohoUID = sohogroups.sohoUID join sohogroupsmembers on sohogroupsmembers.sohoGID = sohogroups.sohoGID join sohoclasses on sohoclasses.sohoCID = sohogroupsmembers.sohoCID join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID where sohogroups.sohoGID = ?;`, [sohoGID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getGroupDataForInvite: function (sohoGID, callback) {
        conn.query(`select groupName, start, level, sohostudents.firstName as 'sFirstName', sohostudents.lastName as 'sLastName', sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName', sohogroupsmembers.sohoCID, sohousers.profileImage as 'tImage' from sohogroups join sohousers on sohousers.sohoUID = sohogroups.sohoUID join sohogroupsmembers on sohogroupsmembers.sohoGID = sohogroups.sohoGID  join sohoclasses on sohoclasses.sohoCID = sohogroupsmembers.sohoCID join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID where sohogroups.sohoGID = ?;`, [sohoGID],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getPracticalGroupsOpen: function (level, callback) {
        conn.query(`select sohogroups.sohoGID, start, level, groupName, count(sohogroupsmembers.sohoGMID) as 'memberCount', firstName, lastName from sohogroups join sohousers on sohousers.sohoUID = sohogroups.sohoUID left outer join sohogroupsmembers on sohogroupsmembers.sohoGID = sohogroups.sohoGID where level = ? group by sohogroups.sohoGID order by start asc;`, [level],
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            });
    },
    getStudentDataForAcceptJoinGroup: function (sohoGMID, callback) {
    conn.query(`select sohogroups.sohoUID, firstName, email, timezone, sohogroupsmembers.sohoGID, gcEventID from sohogroupsmembers join sohogroups on sohogroups.sohoGID = sohogroupsmembers.sohoGID join sohoclasses on sohoclasses.sohoCID = sohogroupsmembers.sohoCID join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID left outer join sohocalendar on sohocalendar.sohoGID = sohogroupsmembers.sohoGID where sohoGMID = ? group by sohogroupsmembers.sohoGID;`, [sohoGMID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getDataForGroupClassCreate: function (sohoUID, callback) {
    conn.query(`select firstName as 'tFirstName', lastName as 'tLastName' from sohousers where sohoUID = ?;`, [sohoUID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getCalendarDataForAcceptJoinGroupClass: function (sohoGID, callback) {
    conn.query(`select sohostudents.email as 'sEmail', sohousers.email as 'tEmail' from sohogroups join sohogroupsmembers on sohogroupsmembers.sohoGID = sohogroups.sohoGID join sohoclasses on sohoclasses.sohoCID = sohogroupsmembers.sohoCID join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID left outer join sohousers on sohousers.sohoUID = sohogroups.sohoUID where sohogroups.sohoGID = ? and sohogroupsmembers.state = 'confirmed';`, [sohoGID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getCalendarDataForRemoveStudentFromGroup: function (sohoGID, sohoGMIDArr, callback) {
    conn.query(`select sohostudents.email as 'sEmail', sohousers.email as 'tEmail' from sohogroups join sohogroupsmembers on sohogroupsmembers.sohoGID = sohogroups.sohoGID join sohoclasses on sohoclasses.sohoCID = sohogroupsmembers.sohoCID join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID left outer join sohousers on sohousers.sohoUID = sohogroups.sohoUID where sohogroups.sohoGID = ? and sohoGMID not in (?) and sohogroupsmembers.state = 'confirmed';`, [sohoGID, sohoGMIDArr],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getEmailDataForAddStudentToGroup: function (sohoCIDArr, callback) {
    conn.query(`select email, firstName, timezone from sohoclasses join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID where sohoCID in (?);`, [sohoCIDArr],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getGcEventIDBySohoGID: function (sohoGID, callback) {
    conn.query(`select gcEventID from sohocalendar where sohoGID = ?;`, [sohoGID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getGcEventIDBySohoAID: function (sohoGID, callback) {
    conn.query(`select gcEventID from sohocalendar where sohoAID = ?;`, [sohoGID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getPracticalGroups: function (sohoCID, callback) {
    conn.query(`select sohoGID from sohogroupsmembers where sohoCID = ? and state = 'confirmed';`, [sohoCID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getPracticalGroupsJoin: function (sohoCID, callback) {
    conn.query(`select sohoUID, start, groupName from sohogroupsmembers join sohogroups on sohogroups.sohoGID = sohogroupsmembers.sohoGID where sohoCID = ? and state = 'confirmed';`, [sohoCID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getGroupsForClassNotes: function (sohoUID, callback) {
    conn.query(`select className, groupName, GROUP_CONCAT(sohogroupsmembers.sohoCID) as classIDArr, CONCAT('[',GROUP_CONCAT(
        JSON_OBJECT(
          'className', className
        )
      ),']') as 'memberJSON' from sohogroups join sohogroupsmembers on sohogroupsmembers.sohoGID = sohogroups.sohoGID join sohoclasses on sohoclasses.sohoCID = sohogroupsmembers.sohoCID where sohogroups.sohoUID = ? group by sohogroups.sohoGID;`, [sohoUID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getPracticalClassOnboarding: function (sohoCID, callback) {
    conn.query(`select sohogroupsmembers.sohoGMID, state, start from sohogroupsmembers join sohogroups on sohogroups.sohoGID = sohogroupsmembers.sohoGID where sohoCID = ?;`, [sohoCID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getPracticalGroupDetails: function (sohoGID, callback) {
    conn.query(`select count(sohogroupsmembers.sohoGMID) as 'count', sohogroups.sohoUID from sohogroups join sohogroupsmembers on sohogroupsmembers.sohoGID = sohogroups.sohoGID where sohogroups.sohoGID = ? and state = 'confirmed';`, [sohoGID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getEmailDataForAddStudentToGroup2: function (sohoGID, callback) {
    conn.query(`select email, firstName, timezone, sohogroups.sohoUID from sohogroups join sohogroupsmembers on sohogroupsmembers.sohoGID = sohogroups.sohoGID join sohoclasses on sohoclasses.sohoCID = sohogroupsmembers.sohoCID join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID where sohogroups.sohoGID in (?);`, [sohoGID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getEmailDataForDeleteStudentFromGroup: function (sohoGID, callback) {
    conn.query(`select firstName, email, timezone, start from sohogroupsmembers join sohogroups on sohogroups.sohoGID = sohogroupsmembers.sohoGID join sohoclasses on sohoclasses.sohoCID = sohogroupsmembers.sohoCID join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID where sohogroupsmembers.sohoGID = ?;`, [sohoGID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
deletePracticalClass: function (sohoGID) {
    conn.query(`delete from sohocalendar where sohoGID = ?;`, [sohoGID],
        function (err, results, fields) {
            if (err) throw err;
            else console.log('Deleted ' + results.affectedRows + ' row(s).');
        });
        conn.query(`delete from sohogroupsmembers where sohoGID = ?;`, [sohoGID],
        function (err, results, fields) {
            if (err) throw err;
            else console.log('Deleted ' + results.affectedRows + ' row(s).');
        });
        conn.query(`delete from sohogroups where sohoGID = ?;`, [sohoGID],
        function (err, results, fields) {
            if (err) throw err;
            else console.log('Deleted ' + results.affectedRows + ' row(s).');
        });
},
updateCharTypeTea: function (charType, sohoUID) {
    conn.query(`update sohousers set charType = ? where sohoUID = ?;`, [charType, sohoUID],
        function (err, results, fields) {
            if (err) throw err;
            else console.log('Updated ' + results.affectedRows + ' row(s).');
        });
},
getSettingsDataTea: function (sohoUID, callback) {
    conn.query(`select charType from sohousers where sohoUID = ?;`, [sohoUID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
updateCharType: function (charType, sohoCID) {
    conn.query(`update sohoclasses set charType = ? where sohoCID = ?;`, [charType, sohoCID],
        function (err, results, fields) {
            if (err) throw err;
            else console.log('Updated ' + results.affectedRows + ' row(s).');
        });
},
getSettingsData: function (sohoCID, callback) {
    conn.query(`select charType from sohoclasses where sohoCID = ?;`, [sohoCID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getTeachersForBookTheory: function (callback) {
    conn.query(`select sohousers.sohoUID, firstName, lastName, profileImage, location, video1, count(soholessonlog.sohoLID) as expCount,ROUND(count(soholessonlog.sohoLID) / count(distinct(soholessonlog.sohoSID)), 1) as 'avgExp',ROUND(SUM(sohoreview.stars) / count(sohoreview.sohoREID), 1) as 'avgStars', count(distinct(sohoREID)) as 'noReviews' from sohousers left outer join soholessonlog on soholessonlog.sohoUID = sohousers.sohoUID left outer join sohoreview on sohoreview.sohoUID = sohousers.sohoUID where availableToBeBooked = 1 group by sohousers.sohoUID order by avgExp desc;`,
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getTeacherDataForBookTheory: function (sohoUID, callback) {
    conn.query(`select sohousers.sohoUID, firstName, lastName, lang, desc1, desc2, location, profileImage, slug, video1, video2, ROUND(SUM(sohoreview.stars) / count(sohoreview.sohoREID), 1) as 'avgStars', count(distinct(sohoREID)) as 'noReviews' from sohousers left outer join sohoreview on sohoreview.sohoUID = sohousers.sohoUID where sohousers.sohoUID = ?;`, [sohoUID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getTeacherDataForBookPractical: function (sohoAID, callback) {
    conn.query(`select sohocalendar.sohoGID, sohousers.firstName, sohousers.lastName, sohousers.sohoUID, sohousers.lang, desc1, desc2, location, sohousers.profileImage, video1, video3, level, sohocalendar.start,count(distinct soholessonlog.sohoLID) as 'sCount',
    CONCAT('[',GROUP_CONCAT(
               JSON_OBJECT(
                 'sFirstName', sohostudents.firstName,
                 'sLastName', sohostudents.lastName,
                 'sProfileImage', sohostudents.profileImage
               )
             ),']') as 'memberJSON'
             from sohocalendar join sohousers on sohousers.sohoUID = sohocalendar.sohoUID join sohogroups on sohogroups.sohoGID = sohocalendar.sohoGID left outer join soholessonlog on soholessonlog.sohoAID = sohocalendar.sohoAID  left outer join sohostudents on sohostudents.sohoSID = soholessonlog.sohoSID where sohocalendar.sohoAID = ?;`, [sohoAID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getTeacherDataForBookPracticalInternal: function (sohoAID, sohoSID, callback) {
    conn.query(`select sohocalendar.sohoGID, sohousers.firstName, sohousers.lastName, sohousers.sohoUID, sohousers.lang, desc1, desc2, location, sohousers.profileImage, video1, video3, level, sohocalendar.start,count(distinct soholessonlog.sohoLID) as 'sCount',
    CONCAT('[',GROUP_CONCAT(
               JSON_OBJECT(
                 'sFirstName', sohostudents.firstName,
                 'sLastName', sohostudents.lastName,
                 'sProfileImage', sohostudents.profileImage
               )
             ),']') as 'memberJSON',SUM(soholessonlog.sohoSID = ? ) as userSignedUp
             from sohocalendar join sohousers on sohousers.sohoUID = sohocalendar.sohoUID join sohogroups on sohogroups.sohoGID = sohocalendar.sohoGID left outer join soholessonlog on soholessonlog.sohoAID = sohocalendar.sohoAID  left outer join sohostudents on sohostudents.sohoSID = soholessonlog.sohoSID where sohocalendar.sohoAID = ?;`, [sohoSID, sohoAID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getClassCount: function (sohoSID, callback) {
    conn.query(`select IFNULL(SUM(lessonType='practical' OR lessonType='typeb'),0) as practicalCount, IFNULL(SUM(lessonType='standard' OR lessonType = 'theory'),0) as theoryCount from soholessonlog where sohoSID = ?;`, [sohoSID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getTeacherDataProfile: function (sohoUID, callback) {
    conn.query(`select firstName, lastName, location, lang, desc1, desc2, videoConfPMI, profileImage, video1, video2, video3, availableToBeBooked from sohousers where sohoUID = ?;`, [sohoUID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
updateSohoUserProfile: function (sohoUID, availableToBeBooked, firstName, lastName, location, languages, desc1, desc2, videoConfPMI, profileImage, video1, video2, video3) {
    if (profileImage == null) { // no image uploaded
        conn.query(`update sohousers set availableToBeBooked = ?, firstName = ?, lastName = ?, location = ?, lang = ?, desc1 = ?, desc2 = ?, videoConfPMI = ?, video1 = ?, video2 = ?, video3 = ? where sohoUID = ?;`, [availableToBeBooked, firstName, lastName, location, languages, desc1, desc2, videoConfPMI, video1, video2, video3, sohoUID],
        function (err, results, fields) {
            if (err) throw err;
            else console.log('Updated ' + results.affectedRows + ' row(s).');
        });
    } else {
        conn.query(`update sohousers set availableToBeBooked = ?, firstName = ?, lastName = ?, location = ?, lang = ?, desc1 = ?, desc2 = ?, videoConfPMI = ?, video1 = ?, video2 = ?, video3 = ?, profileImage = ? where sohoUID = ?;`, [availableToBeBooked, firstName, lastName, location, languages, desc1, desc2, videoConfPMI, video1, video2, video3, profileImage, sohoUID],
        function (err, results, fields) {
            if (err) throw err;
            else console.log('Updated ' + results.affectedRows + ' row(s).');
        });
    }

},
getRoomBetweenTwoUsers: function (slug1, slug2, callback) {
    conn.query(`select count(DISTINCT(slug)) as roomExist from sohoroomsusers where slug = ? OR slug = ? group by sohoRID having roomExist > 1;`, [slug1, slug2],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getTeacherEventsCalendarEvents: function (sohoUID, start, end, callback) {
    conn.query(`select sohoAID, start, end from sohocalendar where sohoUID = ? and free = 0 and start >= ? and end <= ? order by start asc;`, [sohoUID, start, end],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
updateFreeRule: function (sohoUID, rule) {
    conn.query(`update sohousers set freeRule = ? where sohoUID = ?;`, [rule, sohoUID],
        function (err, results, fields) {
            if (err) throw err;
            else console.log('Updated ' + results.affectedRows + ' row(s).');
        });
},
getFreeRule: function (sohoUID, callback) {
    conn.query(`select freeRule, timezone from sohousers where sohoUID = ?;`, [sohoUID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getPastClassesSalary: function (sohoUID, callback) {
    conn.query(`
    select sohoLID, firstName, lastName, hours, soholessonlog.lessonType, start, end, soholessonlog.sohoAID, CONCAT('[',GROUP_CONCAT(
        JSON_OBJECT(
          'firstName', firstName,
                        'lastName', lastName
        )
      ),']') as 'memberJSON' ,count(sohoLID) as 'sCount'

from soholessonlog join sohostudents on sohostudents.sohoSID = soholessonlog.sohoSID left outer join sohocalendar on sohocalendar.sohoAID = soholessonlog.sohoAID where soholessonlog.sohoUID = ? and (start < UTC_TIMESTAMP() OR dateOfClass < UTC_TIMESTAMP()) group by sohoAID order by dateOfClass desc;
    `, [sohoUID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getPastClassesSalaryRange: function (sohoUID,start, end,  callback) {
    conn.query(`
    select sohoLID, firstName, lastName, hours, soholessonlog.lessonType, start, end, soholessonlog.sohoAID, CONCAT('[',GROUP_CONCAT(
        JSON_OBJECT(
          'firstName', firstName,
                        'lastName', lastName
        )
      ),']') as 'memberJSON' ,count(sohoLID) as 'sCount'

from soholessonlog join sohostudents on sohostudents.sohoSID = soholessonlog.sohoSID left outer join sohocalendar on sohocalendar.sohoAID = soholessonlog.sohoAID where soholessonlog.sohoUID = ?  and start between ? and ? group by sohoAID order by dateOfClass desc;`, [sohoUID,start, end],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getPastClassesSalaryAll: function (callback) {
    conn.query(`
    select soholessonlog.sohoUID, sohoLID, firstName, lastName, hours, soholessonlog.lessonType, start, end, soholessonlog.sohoAID, CONCAT('[',GROUP_CONCAT(
        JSON_OBJECT(
          'firstName', firstName,
                        'lastName', lastName
        )
      ),']') as 'memberJSON' ,count(sohoLID) as 'sCount'

from soholessonlog join sohostudents on sohostudents.sohoSID = soholessonlog.sohoSID left outer join sohocalendar on sohocalendar.sohoAID = soholessonlog.sohoAID where (start < UTC_TIMESTAMP() OR dateOfClass < UTC_TIMESTAMP()) group by sohoAID order by dateOfClass desc;
    `,
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getPastClassesSalaryAllRange: function (start, end, callback) {
    conn.query(`
    select soholessonlog.sohoUID, sohoLID, firstName, lastName, hours, soholessonlog.lessonType, start, end, soholessonlog.sohoAID, CONCAT('[',GROUP_CONCAT(
        JSON_OBJECT(
          'firstName', firstName,
                        'lastName', lastName
        )
      ),']') as 'memberJSON' ,count(sohoLID) as 'sCount'

from soholessonlog join sohostudents on sohostudents.sohoSID = soholessonlog.sohoSID left outer join sohocalendar on sohocalendar.sohoAID = soholessonlog.sohoAID where start between ? and ? group by sohoAID order by dateOfClass desc;
    `,[start, end],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getRandomExerciseAtLevel: function (level, callback) {
    conn.query(`select sohoHID from sohohomework where level like ? and state = 'active' order by RAND() limit 1;`, [level],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
addReview: function (sohoUID, sohoSID, sohoLID, stars, comments, classType) {
    conn.query(`insert into sohoreview (sohoUID, sohoSID, sohoLID, stars, comments, classType) values (?,?,?,?,?,?);`, [sohoUID, sohoSID, sohoLID, stars, comments, classType],
        function (err, results, fields) {
            if (err) throw err;
            else console.log('Updated ' + results.affectedRows + ' row(s).');
        });
},
getReviewByTeacher: function (sohoUID, callback) {
    conn.query(`select firstName, lastName, stars, comments, sohoreview.ts from sohoreview join sohostudents on sohostudents.sohoSID = sohoreview.sohoSID where sohoUID = ? and comments is not null;`, [sohoUID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getReviewStatsByTeacher: function (sohoUID, callback) {
    conn.query(`select ROUND(SUM(sohoreview.stars) / count(sohoreview.sohoREID), 1) as 'avgStars', count(distinct(sohoREID)) as 'noReviews' from sohoreview where sohoUID = ?;`, [sohoUID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getUniqueTeachers: function (sohoSID, callback) {
    conn.query(`select distinct(soholessonlog.sohoUID), firstName, lastName, profileImage, soholessonlog.lessonType, level, ROUND(SUM(sohoreview.stars) / count(sohoreview.sohoREID), 1) as 'avgStars', count(distinct(sohoREID)) as 'noReviews' from soholessonlog join sohousers on sohousers.sohoUID = soholessonlog.sohoUID left outer join sohoreview on sohoreview.sohoUID = soholessonlog.sohoUID left outer join sohocalendar on sohocalendar.sohoAID = soholessonlog.sohoAID left outer join sohogroups on sohogroups.sohoGID = sohocalendar.sohoGID where soholessonlog.sohoSID = ? group by soholessonlog.sohoUID, soholessonlog.lessonType order by dateOfClass desc;`, [sohoSID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getHomework: function (callback) {
    conn.query(`select sohohomework.sohoHID, question, questionType, level, count(sohoHAID) as 'sCount' from sohohomework join sohousers on sohousers.slug = sohohomework.teacherCreated left outer join sohohomeworkassignment on sohohomeworkassignment.sohoHID = sohohomework.sohoHID where sohohomework.state = 'active' group by sohohomework.sohoHID order by INET_ATON(level) asc, sohohomework.sohoHID asc;`,
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getHomeworkIndividual: function (sohoHID, callback) {
    conn.query(`select sohohomework.sohoHID, question, questionType, level, answer, answerType, DATE_FORMAT(lastUpdated, '%Y-%m-%dT%TZ') as 'lastUpdated', sohostudents.firstName, sohostudents.lastName from sohohomework join sohousers on sohousers.slug = sohohomework.teacherCreated left outer join sohohomeworkassignment on sohohomeworkassignment.sohoHID = sohohomework.sohoHID left outer join sohoclasses on sohoclasses.sohoCID = sohohomeworkassignment.sohoCID left outer join sohostudents on sohostudents.sohoSID = sohoclasses.sohoSID where  sohohomework.sohoHID = ?;`,[sohoHID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getTeachersHomeTheory: function ( callback) {
    conn.query(`select sohousers.sohoUID, firstName, lastName, profileImage, ROUND(SUM(sohoreview.stars) / count(sohoreview.sohoREID), 1) as 'avgStars', count(distinct(sohoREID)) as 'noReviews' from sohousers  left outer join sohoreview on sohoreview.sohoUID = sohousers.sohoUID  where availableToBeBooked = 1 group by sohousers.sohoUID order by avgStars desc limit 3;`,
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getTeachersHomePrac: function ( callback) {
    conn.query(`select title, sohocalendar.sohoAID,  sohousers.sohoUID, sohousers.profileImage, sohocalendar.sohoUID, sohocalendar.start, level, sohousers.firstName as 'tFirstName', sohousers.lastName as 'tLastName',count(distinct sohoLID) as 'sCount'  from sohocalendar join sohogroups on sohogroups.sohoGID = sohocalendar.sohoGID join sohousers on sohogroups.sohoUID = sohousers.sohoUID left outer join soholessonlog on soholessonlog.sohoAID = sohocalendar.sohoAID  left outer join sohostudents on sohostudents.sohoSID = soholessonlog.sohoSID  where sohocalendar.start > UTC_TIMESTAMP() and sohocalendar.sohoGID is not null group by sohocalendar.sohoAID order by start asc limit 2;`,
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
updatePracticalCredit: function (sohoSID, newPracCredit) {
    conn.query(`update sohostudents set practicalCredit = ? where sohoSID = ?;`, [newPracCredit, sohoSID],
        function (err, results, fields) {
            if (err) throw err;
            else console.log('Updated ' + results.affectedRows + ' row(s).');
        });
},
getPracticalCredit: function (sohoSID, callback) {
    conn.query(`select practicalCredit from sohostudents where sohoSID = ?;`, [sohoSID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getClassesCalcPracCredit: function (sohoSID, start, callback) {
    conn.query(`select sohoLID, hours, soholessonlog.lessonType, start from soholessonlog left outer join sohocalendar on sohocalendar.sohoAID = soholessonlog.sohoAID where soholessonlog.sohoSID = ? and start >= ? and payment = 'card';`, [sohoSID, start],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getMaxClassBooked: function (sohoSID, callback) {
    conn.query(`select max(start) as 'max', soholessonlog.lessonType from soholessonlog left outer join sohocalendar on sohocalendar.sohoAID = soholessonlog.sohoAID where soholessonlog.sohoSID = ? and payment = 'card' group by lessonType;`, [sohoSID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getNextInstancesPrac: function (sohoGID, start, callback) {
    conn.query(`select sohoAID, start from sohocalendar where sohoGID = ? and start >= ? order by start asc;`, [sohoGID, start],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getNextInstancesPracCheck: function (sohoGID, start, callback) {
    conn.query(`select sohocalendar.sohoAID, start, count(sohoLID) as 'sCount' from sohocalendar left outer join soholessonlog on soholessonlog.sohoAID = sohocalendar.sohoAID where sohoGID = ? and start >= ? group by sohocalendar.sohoAID order by start asc;`, [sohoGID, start],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
getReviewDataProfile: function (sohoUID, callback) {
    conn.query(`select firstName, lastName, stars, comments, classType, DATE_FORMAT(sohoreview.ts, '%Y-%m-%dT%TZ') as 'ts' from sohoreview join sohostudents on sohostudents.sohoSID = sohoreview.sohoSID where sohoUID = ? order by ts desc;`, [sohoUID],
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        });
},
    // END
}