// NPM Modules
var express = require('express');
var bodyParser = require('body-parser');
var dbjsMethods = require("../db.js");
var customMethods = require("../custom.js");
const multer = require('multer'); // file upload
var multerS3 = require('multer-s3'); // file upload to s3
const aws = require('aws-sdk');
const bcrypt = require('bcrypt');
var async = require("async");
var crypto = require("crypto");
const jwt = require('jsonwebtoken');

var cookieParser = require('cookie-parser');
const cors = require('cors');
var session = require('express-session');
var moment = require('moment');
var moment = require('moment-timezone');
const Moment = require('moment');
const MomentRange = require('moment-range');
const momentRange = MomentRange.extendMoment(Moment);
var cron = require('node-cron');
var sinon = require('sinon'); // fake time in node
const db = require('../db.js');
const fs = require('fs');
const axios = require('axios').default;
const Diff = require('diff');
const chineselexicon = require('chinese-lexicon');
var Segment = require('novel-segment'); // chinese char segmentation
var segment = new Segment();
segment.useDefault();
var parser = require('cron-parser');
const {
    sohoGetStudentEmailforAddClass
} = require('../db.js');
const custom = require('../custom.js');


// schedule stripe usage report to happen end of every month
var stripeUploadTask = cron.schedule('0 0 1 * *', () => {
    console.log('Stripe - Upload Usage Data at end of month');
    // get sum of all class hours by subscription item id for a given period (entire current month)
    const startOfMonth = moment().utc().subtract(1, 'months').startOf('month'); // 01/08/2020
    const endOfMonth = moment().utc().subtract(1, 'months').endOf('month'); // 31/08/2020
    console.log('Stripe Start Of Month: ' + startOfMonth.toISOString());
    console.log('Stripe End Of Month: ' + endOfMonth.toISOString());

    dbjsMethods.getStripeUsagePerMonth(startOfMonth.toISOString(), endOfMonth.toISOString(), function (usageData) { // stripe calculation necessitates that dates be formatted in DD/MM/YYYY
        var asyncArr = [];

        for (var i = 0; i < usageData.length; i++) { // repeat for all lines
            console.log('stripe[' + i + ']: ' + usageData[i].sohoSID + ' (SID) - ' + usageData[i].stripeSubscriptionItemId + ': ' + usageData[i].theoryQty + ' (theoryItemId) - ' + usageData[i].stripeGroupItemId + ': ' + usageData[i].pracQty + ' (groupItemId)');
            // compute how to charge all these people
            var theoryQty = usageData[i].theoryQty;
            var pracQty = usageData[i].pracQty;
            var stripeSubscriptionItemId = usageData[i].stripeSubscriptionItemId;
            var stripeGroupItemId = usageData[i].stripeGroupItemId;
            var pracCredit = parseFloat(usageData[i].practicalCredit);

            var theoryQtyToCharge, pracQtyToCharge;
            // charge 39 for every theory class which gives 1 free prac class
            theoryQtyToCharge = theoryQty;
            pracQtyToCharge = pracQty - theoryQty - pracCredit;

            // update practicalCredit in the case of more theory than practical
            if (pracQtyToCharge < 0) {
                var pracQtyToAdd = -pracQtyToCharge; // flip the sign
                console.log("New Practical Credit: ", pracQtyToAdd)
                var obj = {
                    sohoSID: usageData[i].sohoSID,
                    newPracCredit: pracQtyToAdd
                }
                asyncArr.push(obj);
            } else if (pracQtyToCharge >= 0 && pracCredit > 0) {
                console.log("Practical credit reset to  0")

                // reset pracCredit to 0
                var obj = {
                    sohoSID: usageData[i].sohoSID,
                    newPracCredit: 0
                }
                asyncArr.push(obj);
            }

            if (theoryQtyToCharge > 0) {
                customMethods.uploadUsageDataToStripe(stripeSubscriptionItemId, theoryQtyToCharge, 'theory'); // subscriptionuserid
            }

            if (pracQtyToCharge > 0) {
                customMethods.uploadUsageDataToStripe(stripeGroupItemId, pracQtyToCharge, 'practical'); // subscriptionuserid
            }
        }

        // update practicalCredit in the case of more theory than practical
        async.forEach(asyncArr, (asyncObj) => {
            var sohoSID = asyncObj.sohoSID;
            var newPracCredit = asyncObj.newPracCredit;
            dbjsMethods.updatePracticalCredit(sohoSID, newPracCredit);
        });
    });
}, {
    scheduled: true,
    timezone: "Etc/UTC" // converts to UTC time
});
stripeUploadTask.start();
console.log('Stripe CRON scheduler is initialised');


// reschedule all to be scheduled future crons
dbjsMethods.getFutureCrons(function (cronData) {
    for (var i = 0; i < cronData.length; i++) {
        var dataObj = JSON.parse(cronData[i].data);
        var sohoCRID = cronData[i].sohoCRID;
        var ce = cronData[i].cronExpression;
        // reschedule the crons
        if (cronData[i].task == 'reminderEmail36HoursBeforeLessonTask') {
            customMethods.reminderEmail36HoursBeforeLessonCRON(ce, dataObj, sohoCRID);
        } else if (cronData[i].task == 'reminderEmail24HoursBeforeLessonTask') {
            customMethods.reminderEmail24HoursBeforeLessonCRON(ce, dataObj, sohoCRID);
        } else if (cronData[i].task == 'beforeClassCheck12HoursTask') {
            customMethods.lessonCheck12HoursBeforeCRON(ce, dataObj, sohoCRID);
        }
    }
    console.log('Future CRON Schedulers are initialised');
});


// AWS file storage
aws.config.update({
    secretAccessKey: "",
    accessKeyId: "",
    region: '' // region of your bucket
});
const s3 = new aws.S3();
const uploadHomeworkFile = multer({ // define AWS S3 path for uploaded application attachments
    storage: multerS3({
        s3: s3,
        bucket: 'culturestride/dailyhw',
        acl: 'public-read',
        metadata: function (req, file, cb) {
            cb(null, {});
        },
        key: function (req, file, cb) {
            var d = Date.now();
            var fileExtension = file.originalname.substring(file.originalname.indexOf("."));
            var fileName = file.originalname.substring(0, file.originalname.indexOf("."));
            var uniqueFileName = fileName + '-' + d + fileExtension;
            cb(null, uniqueFileName); // filename is based off of the current time
        }
    })
});
const uploadImageFile = multer({ // define AWS S3 path for uploaded application attachments
    storage: multerS3({
        s3: s3,
        bucket: 'culturestride/profileimage',
        acl: 'public-read',
        metadata: function (req, file, cb) {
            cb(null, {});
        },
        key: function (req, file, cb) {
            var d = Date.now();
            var fileExtension = file.originalname.substring(file.originalname.indexOf("."));
            var fileName = file.originalname.substring(0, file.originalname.indexOf("."));
            var uniqueFileName = fileName + '-' + d + fileExtension;
            cb(null, uniqueFileName); // filename is based off of the current time
        }
    })
});
const uploadSpeakingAudio = multer({ // define AWS S3 path for uploaded application attachments
    storage: multerS3({
        s3: s3,
        bucket: 'culturestride/dailyhwstu',
        acl: 'public-read',
        storageClass: 'STANDARD_IA',
        metadata: function (req, file, cb) {
            cb(null, {});
        },
        key: function (req, file, cb) {
            var d = Date.now();
            var fileExtension = file.originalname.substring(file.originalname.indexOf("."));
            var uniqueFileName = 'dailyhw-stuspeaking-' + d + fileExtension;
            cb(null, uniqueFileName); // filename is based off of the current time
        }
    })
});
const uploadMessageAudio = multer({ // define AWS S3 path for uploaded application attachments
    storage: multerS3({
        s3: s3,
        bucket: 'culturestride/message',
        acl: 'public-read',
        storageClass: 'STANDARD_IA',
        metadata: function (req, file, cb) {
            cb(null, {});
        },
        key: function (req, file, cb) {
            var d = Date.now();
            var fileExtension = file.originalname.substring(file.originalname.indexOf("."));
            var uniqueFileName = 'message-' + d + fileExtension;
            cb(null, uniqueFileName); // filename is based off of the current time
        }
    })
});
const uploadSpeakingAudioEntry = multer({ // define AWS S3 path for uploaded application attachments
    storage: multerS3({
        s3: s3,
        bucket: 'culturestride/entryform',
        acl: 'public-read',
        storageClass: 'STANDARD_IA',
        metadata: function (req, file, cb) {
            cb(null, {});
        },
        key: function (req, file, cb) {
            var d = Date.now();
            var fileExtension = file.originalname.substring(file.originalname.indexOf("."));
            var uniqueFileName = 'entryform-speaking-' + d + fileExtension;
            cb(null, uniqueFileName); // filename is based off of the current time
        }
    })
});

// Other config stuff
var router = express.Router(); // define router

// only use the raw bodyParser for webhooks
router.use(bodyParser.json({
    verify: function (req, res, buf) {
        var url = req.originalUrl;
        if (url.startsWith('/stripe-webhook'))
            req.rawBody = buf.toString();
    }
}));

router.use(bodyParser.urlencoded({
    extended: true
}));
router.use(cookieParser());
router.use(cors({
    origin: 'http://localhost:1337',
    credentials: true
}));
const saltRounds = 10; // used to define an important variable used by bcrypt npm module in hashing passwords
const maskVariable = 23; // used in masking student ids

// vars used for creating messaging rooms
var michaelSlug = '';
var masaeSlug = '';


// ---------------------------------------------------------- Route handlers -------------------------------------------------------------
// GET
router.get('/', function (req, res) {
    var code = req.query.code;
    if (code) { // referrer code
        req.session.referrerCode = code;
    }

    dbjsMethods.getTeachersHomeTheory(function (theoryData) {
        dbjsMethods.getTeachersHomePrac(function (pracData) {

            // render view        
            res.render('pages/mandarin', {
                title: 'Communicative Mandarin Learning | Culturestride', // title of the page (in tab windows)
                metadescription: 'Join students from across the world becoming proficient in Mandarin Chinese online now.', // metadescription of the page for SEO
                layout: 'langpagelayout', // only login layout
                theory: theoryData, // theory
                prac: pracData, // prac
            });
        });
    });
});
router.get('/cantonese', function (req, res) {
    // render view        
    dbjsMethods.getNumOfLessonsForLang(function (lessonData) {
        if (lessonData.length < 4) { // only in dev situations
            lessonData[1] = {
                count: "0"
            };
            lessonData[2] = {
                count: "0"
            };
            lessonData[3] = {
                count: "0"
            };
            lessonData[4] = {
                count: "0"
            };
        }
        res.render('pages/cantonese', {
            title: 'Learn Cantonese Online | Culturestride', // title of the page (in tab windows)
            metadescription: 'Join students from across the world becoming proficient with the top 1% of native teachers now.', // metadescription of the page for SEO
            layout: 'langpagelayout', // only login layout
            lesson: lessonData, // no. of lessons
        });
    });
});
router.get('/english', function (req, res) {
    // render view        
    res.render('pages/english', {
        title: 'Learn English Online | Culturestride', // title of the page (in tab windows)
        metadescription: 'Join students from across the world becoming proficient with the top 1% of native teachers now.', // metadescription of the page for SEO
        layout: 'langpagelayout', // only login layout
    });
});
router.get('/hsk', function (req, res) {
    // render view
    var meta = ``;
    res.render('pages/hsk', {
        title: 'What is HSK Chinese? | Culturestride', // title of the page (in the tab window)
        metadescription: 'HSK Chinese is the most widely acknowledged international standard of Chinese language proficiency.', // metadescription of the page for SEO
        layout: 'blanklayout', //blanklayout
        meta: meta, // meta    
    });
});
router.get('/partners', function (req, res) {
    // render view
    var meta = ``;
    res.render('pages/partners', {
        title: 'Partners | Culturestride', // title of the page (in the tab window)
        metadescription: 'See Culturestride partners that we work with to improve your Mandarin learning experience.', // metadescription of the page for SEO
        layout: 'langpagelayout', //blanklayout
        meta: meta, // meta    
    });
});
router.get('/studentcode', function (req, res) {
    // render view
    var meta = ``;
    res.render('pages/studentcodeofconduct', {
        title: 'Student Code of Conduct | Culturestride', // title of the page (in the tab window)
        metadescription: '', // metadescription of the page for SEO
        layout: 'blanklayout', //blanklayout
        meta: meta, // meta    
    });
});
router.get('/dialogues', function (req, res) {
    // render view
    var meta = ``;
    res.render('pages/dialogues', {
        title: 'Dialogues | Culturestride', // title of the page (in the tab window)
        metadescription: 'Culturestride dialogues enable students to improve their speaking abilities.', // metadescription of the page for SEO
        layout: 'blanklayout', //blanklayout
        meta: meta, // meta    
    });
});
router.get('/voov', function (req, res) {
    // render view
    var meta = ``;
    res.render('pages/voov', {
        title: 'Voov | Culturestride', // title of the page (in the tab window)
        metadescription: 'Voov is Tencent\'s meeting software.', // metadescription of the page for SEO
        layout: 'blanklayout', //blanklayout
        meta: meta, // meta    
    });
});
router.get('/registerotherlanguages', function (req, res) {
    // render view
    res.render('pages/registerotherlanguages', {
        title: 'Register Other Languages | Culturestride', // title of the page (in the tab window)
        metadescription: 'Pre-register to other languages to be notified when we release it.' // metadescription of the page for SEO
    });
});
router.get('/thankyou', function (req, res) {
    // render view
    res.render('pages/thankyou', {
        title: 'Thank you | Culturestride', // title of the page (in the tab window)
        metadescription: 'Thank you for registering for other languages with Culturestride.' // metadescription of the page for SEO
    });
});
router.get('/login', function (req, res) {
    var error = req.query.error;
    var meta = ``;
    // check if already logged in - then redirect if they are
    var sohoSID = req.session.csStudentLoggedIn;
    if (sohoSID) {
        res.redirect('/a/classadmin');
    } else {
        if (error) {
            // render view
            res.render('pages/login', {
                title: 'Login | Culturestride', // title of the page (in the tab window)
                metadescription: 'Login to your Culturestride account.', // metadescription of the page for SEO
                layout: 'blanklayout', //blanklayout
                meta: meta, // meta
                error: error // error var
            });
        } else {
            // render view
            res.render('pages/login', {
                title: 'Login | Culturestride', // title of the page (in the tab window)
                metadescription: 'Login to your Culturestride account.', // metadescription of the page for SEO
                layout: 'blanklayout', //blanklayout
                meta: meta, // meta
                error: 0 // error var
            });
        }
    }
});
router.get('/a/classadmin', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                dbjsMethods.getLessonLogforClassAdmin(req.session.csStudentClassID, function (studentLessonLogData) {
                    dbjsMethods.getUpcomingLessons(req.session.csStudentClassID, function (upcomingLessonsData) {
                        dbjsMethods.getUniqueTeachers(req.session.csStudentLoggedIn, function (uniqueTeachersData) {
                            dbjsMethods.getMaxClassBooked(req.session.csStudentLoggedIn, function (maxClassData) {
                                dbjsMethods.getPracticalCredit(req.session.csStudentLoggedIn, function (pracCreditData) {
                                    const startOfMonth = moment().utc().startOf('month'); // 2021-11-01T00:00:00Z
                                    dbjsMethods.getClassesCalcPracCredit(req.session.csStudentLoggedIn, startOfMonth.toISOString(), function (classThisMonthData) {

                                        var pracCreditStartOfMonth = parseFloat(pracCreditData[0].practicalCredit);
                                        // compute live practical credit based off of this months usage of T + P classes
                                        var theoryHoursBooked = 0;
                                        var pracHoursBooked = 0;
                                        for (let i = 0; i < classThisMonthData.length; i++) {
                                            const e = classThisMonthData[i];
                                            if (e.lessonType == 'theory' || e.lessonType == 'standard') {
                                                theoryHoursBooked += parseFloat(e.hours);
                                            } else if (e.lessonType == 'practical' || e.lessonType == 'typeb') {
                                                pracHoursBooked += parseFloat(e.hours);
                                            }
                                        }
                                        var diff = theoryHoursBooked - pracHoursBooked;
                                        pracCreditStartOfMonth += diff;
                                        var pracCreditAvailable = Math.max(0, pracCreditStartOfMonth);

                                        // should we show the maxTheory and maxPrac warnings?
                                        var maxTheory, maxPractical;
                                        var showPracWarning, showTheoryWarning = 0;
                                        for (let i = 0; i < maxClassData.length; i++) {
                                            const e = maxClassData[i];
                                            if (e.lessonType == 'practical') {
                                                maxPractical = moment(e.max, 'YYYY-MM-DDTHH:mm:ssZ').utc();
                                            } else if (e.lessonType == 'theory') {
                                                maxTheory = moment(e.max, 'YYYY-MM-DDTHH:mm:ssZ').utc();
                                            } else {
                                                console.log('maxClassData lesson type is cooked');
                                            }
                                        }
                                        var now = moment().utc();

                                        if (maxPractical) {
                                            var diffPrac = maxPractical.diff(now, 'days');
                                            if (diffPrac <= 7) { // if the latest class is within 7 days, you'll receive this warning
                                                showPracWarning = 1;
                                            }
                                        }
                                        if (maxTheory) {
                                            var diffTheory = maxTheory.diff(now, 'days');
                                            if (diffTheory <= 7) {
                                                showTheoryWarning = 1;
                                            }
                                        }


                                        // render view
                                        res.render('pages/account/classadmin', {
                                            title: 'Culturestride', // title of the page (in the tab window)
                                            metadescription: 'Immerse deeper and manage your lessons with your Culturestride account.', // metadescription of the page for SEO
                                            studentLessonLog: studentLessonLogData, //student lesson logs
                                            rwHSK: req.session.csStudentReadWriteHskLevel,
                                            lsHSK: req.session.csStudentListenSpeakHskLevel,
                                            layout: 'dashlayout', // logged in template
                                            sFirstName: req.session.csStudentFirstName, // student first name
                                            sLastName: req.session.csStudentLastName, // student last name
                                            sLang: req.session.csStudentClassLang, // class language
                                            sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                                            sClassType: req.session.csStudentClassType, // class type
                                            sSlug: req.session.csStudentSlug, // slug
                                            sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                                            sProfileImage: req.session.csStudentProfileImage, // own profile image
                                            sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                                            sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                                            sStudyTimer: req.session.sStudyTimer, // study timer
                                            sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                                            sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                                            sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                                            sNextMeetingType: req.session.nextMeetingType, // next meeting type
                                            upcomingLessons: upcomingLessonsData, // upcoming lessons
                                            moment: moment, // moment
                                            uniqueTeachers: uniqueTeachersData, //  uniqueTeachers
                                            pracCreditAvailable: pracCreditAvailable, //  pracCredit
                                            showPracWarning: showPracWarning, //  showPracWarning
                                            showTheoryWarning: showTheoryWarning, //  showTheoryWarning
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    }
});
router.get('/a/payments', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                // if no stripeCustomerId in db then ping stripe to create one
                // check if stripe customer id exists if not then create
                dbjsMethods.getStripeCustomerData(req.session.csStudentLoggedIn, async function (stripeCustomerData) {
                    dbjsMethods.getClassPlan(req.session.csStudentClassID, async function (planData) {

                        // create stripeCustomerId in database if there isn't one
                        var stripeCustomerId = stripeCustomerData[0].stripeCustomerId;
                        if (!stripeCustomerId) {
                            customMethods.createStripeCustomer(req.session.csStudentLoggedIn, stripeCustomerData[0].email, stripeCustomerData[0].firstName, stripeCustomerData[0].lastName);
                        }

                        if (stripeCustomerData[0].stripeSubscriptionItemId == null) {
                            var plan = '';
                        } else {
                            var plan = planData[0].plan;
                        }

                        // render view
                        res.render('pages/account/payments', {
                            title: 'Culturestride', // title of the page (in the tab window)
                            metadescription: 'Immerse deeper and manage your lessons with your Culturestride account.', // metadescription of the page for SEO
                            rwHSK: req.session.csStudentReadWriteHskLevel,
                            lsHSK: req.session.csStudentListenSpeakHskLevel,
                            layout: 'dashlayout', // logged in template
                            sFirstName: req.session.csStudentFirstName, // student first name
                            sLastName: req.session.csStudentLastName, // student last name
                            sLang: req.session.csStudentClassLang, // class language
                            sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                            sClassType: req.session.csStudentClassType, // class type
                            sSlug: req.session.csStudentSlug, // slug
                            sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                            sProfileImage: req.session.csStudentProfileImage, // own profile image
                            sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                            sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                            sStudyTimer: req.session.sStudyTimer, // study timer
                            sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                            sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                            sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                            sNextMeetingType: req.session.nextMeetingType, // next meeting type
                            stripeCustomerId: stripeCustomerId, // stripeCustomerId
                            sClassType: req.session.csStudentClassType, // classtype
                            moment: moment, // moment
                            plan: plan, // plan
                        });
                    });
                });
            });
        });
    }
});
router.get('/a/tbaudio', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                // render view
                res.render('pages/account/tbaudio', {
                    title: 'Culturestride', // title of the page (in the tab window)
                    metadescription: 'Immerse deeper and manage your lessons with your Culturestride account.', // metadescription of the page for SEO
                    layout: 'dashlayout', // logged in template
                    rwHSK: req.session.csStudentReadWriteHskLevel,
                    lsHSK: req.session.csStudentListenSpeakHskLevel,
                    sFirstName: req.session.csStudentFirstName, // student first name
                    sLastName: req.session.csStudentLastName, // student last name
                    sLang: req.session.csStudentClassLang, // class language
                    sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                    sClassType: req.session.csStudentClassType, // class type
                    sSlug: req.session.csStudentSlug, // slug
                    sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                    sProfileImage: req.session.csStudentProfileImage, // own profile image
                    sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                    sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                    sStudyTimer: req.session.sStudyTimer, // study timer
                    sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                    sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                    sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                    sNextMeetingType: req.session.nextMeetingType, // next meeting type
                    moment: moment, // moment
                });
            });
        });
    }
});
router.get('/a/tbaudio/listeninghsk1', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                // render view
                res.render('pages/account/tbaudiohsk1', {
                    title: 'Culturestride', // title of the page (in the tab window)
                    metadescription: 'Immerse deeper and manage your lessons with your Culturestride account.', // metadescription of the page for SEO
                    layout: 'dashlayout', // logged in template
                    rwHSK: req.session.csStudentReadWriteHskLevel,
                    lsHSK: req.session.csStudentListenSpeakHskLevel,
                    sFirstName: req.session.csStudentFirstName, // student first name
                    sLastName: req.session.csStudentLastName, // student last name
                    sLang: req.session.csStudentClassLang, // class language
                    sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                    sClassType: req.session.csStudentClassType, // class type
                    sSlug: req.session.csStudentSlug, // slug
                    sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                    sProfileImage: req.session.csStudentProfileImage, // own profile image
                    sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                    sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                    sStudyTimer: req.session.sStudyTimer, // study timer
                    sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                    sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                    sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                    sNextMeetingType: req.session.nextMeetingType, // next meeting type
                    moment: moment, // moment
                });
            });
        });
    }
});
router.get('/a/tbaudio/listeninghsk2', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                // render view
                res.render('pages/account/tbaudiohsk2', {
                    title: 'Culturestride', // title of the page (in the tab window)
                    metadescription: 'Immerse deeper and manage your lessons with your Culturestride account.', // metadescription of the page for SEO
                    layout: 'dashlayout', // logged in template
                    rwHSK: req.session.csStudentReadWriteHskLevel,
                    lsHSK: req.session.csStudentListenSpeakHskLevel,
                    sFirstName: req.session.csStudentFirstName, // student first name
                    sLastName: req.session.csStudentLastName, // student last name
                    sLang: req.session.csStudentClassLang, // class language
                    sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                    sClassType: req.session.csStudentClassType, // class type
                    sSlug: req.session.csStudentSlug, // slug
                    sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                    sProfileImage: req.session.csStudentProfileImage, // own profile image
                    sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                    sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                    sStudyTimer: req.session.sStudyTimer, // study timer
                    sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                    sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                    sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                    sNextMeetingType: req.session.nextMeetingType, // next meeting type
                    moment: moment, // moment
                });
            });
        });
    }
});
router.get('/a/tbaudio/listeninghsk3', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                // render view
                res.render('pages/account/tbaudiohsk3', {
                    title: 'Culturestride', // title of the page (in the tab window)
                    metadescription: 'Immerse deeper and manage your lessons with your Culturestride account.', // metadescription of the page for SEO
                    layout: 'dashlayout', // logged in template
                    rwHSK: req.session.csStudentReadWriteHskLevel,
                    lsHSK: req.session.csStudentListenSpeakHskLevel,
                    sFirstName: req.session.csStudentFirstName, // student first name
                    sLastName: req.session.csStudentLastName, // student last name
                    sLang: req.session.csStudentClassLang, // class language
                    sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                    sClassType: req.session.csStudentClassType, // class type
                    sSlug: req.session.csStudentSlug, // slug
                    sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                    sProfileImage: req.session.csStudentProfileImage, // own profile image
                    sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                    sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                    sStudyTimer: req.session.sStudyTimer, // study timer
                    sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                    sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                    sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                    sNextMeetingType: req.session.nextMeetingType, // next meeting type
                    moment: moment, // moment
                });
            });
        });
    }
});
router.get('/a/tbaudio/listeninghsk4A', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                // render view
                res.render('pages/account/tbaudiohsk4A', {
                    title: 'Culturestride', // title of the page (in the tab window)
                    metadescription: 'Immerse deeper and manage your lessons with your Culturestride account.', // metadescription of the page for SEO
                    layout: 'dashlayout', // logged in template
                    rwHSK: req.session.csStudentReadWriteHskLevel,
                    lsHSK: req.session.csStudentListenSpeakHskLevel,
                    sFirstName: req.session.csStudentFirstName, // student first name
                    sLastName: req.session.csStudentLastName, // student last name
                    sLang: req.session.csStudentClassLang, // class language
                    sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                    sClassType: req.session.csStudentClassType, // class type
                    sSlug: req.session.csStudentSlug, // slug
                    sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                    sProfileImage: req.session.csStudentProfileImage, // own profile image
                    sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                    sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                    sStudyTimer: req.session.sStudyTimer, // study timer
                    sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                    sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                    sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                    sNextMeetingType: req.session.nextMeetingType, // next meeting type
                    moment: moment, // moment
                });
            });
        });
    }
});
router.get('/a/tbaudio/listeninghsk4B', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                // render view
                res.render('pages/account/tbaudiohsk4B', {
                    title: 'Culturestride', // title of the page (in the tab window)
                    metadescription: 'Immerse deeper and manage your lessons with your Culturestride account.', // metadescription of the page for SEO
                    layout: 'dashlayout', // logged in template
                    rwHSK: req.session.csStudentReadWriteHskLevel,
                    lsHSK: req.session.csStudentListenSpeakHskLevel,
                    sFirstName: req.session.csStudentFirstName, // student first name
                    sLastName: req.session.csStudentLastName, // student last name
                    sLang: req.session.csStudentClassLang, // class language
                    sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                    sClassType: req.session.csStudentClassType, // class type
                    sSlug: req.session.csStudentSlug, // slug
                    sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                    sProfileImage: req.session.csStudentProfileImage, // own profile image
                    sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                    sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                    sStudyTimer: req.session.sStudyTimer, // study timer
                    sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                    sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                    sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                    sNextMeetingType: req.session.nextMeetingType, // next meeting type
                    moment: moment, // moment
                });
            });
        });
    }
});
router.get('/a/tbaudio/listeninghsk5A', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                // render view
                res.render('pages/account/tbaudiohsk5A', {
                    title: 'Culturestride', // title of the page (in the tab window)
                    metadescription: 'Immerse deeper and manage your lessons with your Culturestride account.', // metadescription of the page for SEO
                    layout: 'dashlayout', // logged in template
                    rwHSK: req.session.csStudentReadWriteHskLevel,
                    lsHSK: req.session.csStudentListenSpeakHskLevel,
                    sFirstName: req.session.csStudentFirstName, // student first name
                    sLastName: req.session.csStudentLastName, // student last name
                    sLang: req.session.csStudentClassLang, // class language
                    sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                    sClassType: req.session.csStudentClassType, // class type
                    sSlug: req.session.csStudentSlug, // slug
                    sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                    sProfileImage: req.session.csStudentProfileImage, // own profile image
                    sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                    sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                    sStudyTimer: req.session.sStudyTimer, // study timer
                    sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                    sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                    sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                    sNextMeetingType: req.session.nextMeetingType, // next meeting type
                    moment: moment, // moment
                });
            });
        });
    }
});
router.get('/forgotpassword', function (req, res) {
    res.render('pages/forgotpassword', {
        title: 'Forgot Password | Culturestride', // title of the page (in the tab window)
        metadescription: 'Reset the password to your Culturestride account.', // metadescription of the page for SEO
        error: 0,
        expire: 0
    });
});
router.get('/forgotpasswordthankyou', function (req, res) {
    res.render('pages/forgotPasswordThankYou', {
        title: 'Forgot Password | Culturestride',
        metadescription: 'Reset the password to your Culturestride account.'
    });
});
router.get('/reset/:dynamicroute', function (req, res) {
    // define dynamic vars
    var tokenURL = req.params.dynamicroute;
    res.render('pages/resetPassword', {
        title: 'Reset Password | Culturestride',
        metadescription: 'Reset the password to your Culturestride account.',
        token: tokenURL,
        error: 0
    });
});
router.get('/resetpasswordthankyou', function (req, res) {
    res.render('pages/resetPasswordThankYou', {
        title: 'Reset Password | Culturestride',
        metadescription: 'Reset the password to your Culturestride account.'
    });
});
router.get('/a/homework', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                dbjsMethods.getAssignedHomeworkforHomework(req.session.csStudentClassID, function (homeworkAssignedData) {
                    dbjsMethods.getClassDataForHomework(req.session.csStudentClassID, function (classData) {

                        // render view
                        res.render('pages/account/homeworkv3', {
                            title: 'Culturestride', // title of the page (in the tab window)
                            metadescription: 'Immerse deeper and manage your lessons with your Culturestride account.', // metadescription of the page for SEO
                            layout: 'dashlayout', // logged in template
                            rwHSK: req.session.csStudentReadWriteHskLevel,
                            lsHSK: req.session.csStudentListenSpeakHskLevel,
                            sFirstName: req.session.csStudentFirstName, // student first name
                            sLastName: req.session.csStudentLastName, // student last name
                            sLang: req.session.csStudentClassLang, // class language
                            sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                            sClassType: req.session.csStudentClassType, // class type
                            sSlug: req.session.csStudentSlug, // slug
                            sClassExist: req.session.csStudentClassExist, // student class exist
                            sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                            sProfileImage: req.session.csStudentProfileImage, // own profile image
                            sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                            sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                            sStudyTimer: req.session.sStudyTimer, // study timer
                            sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                            sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                            sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                            sNextMeetingType: req.session.nextMeetingType, // next meeting type
                            moment: moment, // moment
                            homeworkAssigned: homeworkAssignedData, // hw assigned data
                            classes: classData[0], // class data
                            sClass: req.session.csStudentClassID, // class data
                        });
                    });

                });
            });
        });
    }
});
router.get('/a/homework/completed', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                dbjsMethods.getHomeworkforHomeworkCompleted(req.session.csStudentClassID, function (homeworkData) {
                    dbjsMethods.getClassDataForHomework(req.session.csStudentClassID, function (classData) {
                        // render view
                        res.render('pages/account/homeworkcompleted', {
                            title: 'Culturestride', // title of the page (in the tab window)
                            metadescription: 'Immerse deeper and manage your lessons with your Culturestride account.', // metadescription of the page for SEO
                            layout: 'dashlayout', // logged in template
                            rwHSK: req.session.csStudentReadWriteHskLevel,
                            lsHSK: req.session.csStudentListenSpeakHskLevel,
                            sFirstName: req.session.csStudentFirstName, // student first name
                            sLastName: req.session.csStudentLastName, // student last name
                            sLang: req.session.csStudentClassLang, // class language
                            sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                            sClassType: req.session.csStudentClassType, // class type
                            sSlug: req.session.csStudentSlug, // slug
                            sClassExist: req.session.csStudentClassExist, // student class exist
                            sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                            sProfileImage: req.session.csStudentProfileImage, // own profile image
                            sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                            sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                            sStudyTimer: req.session.sStudyTimer, // study timer
                            sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                            sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                            sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                            sNextMeetingType: req.session.nextMeetingType, // next meeting type
                            moment: moment, // moment
                            homework: homeworkData, // hw assigned data
                            classes: classData[0], // class data
                            sClass: req.session.csStudentClassID, // class data
                        });
                    });
                });
            });
        });
    }
});

router.get('/a/onboarding', function (req, res) {
    var autoConfirm = req.query.autoConfirm;
    var autoConfirmPrac = req.query.autoConfirmPrac;
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                dbjsMethods.getStudentEntryFormForOnboarding(req.session.csStudentLoggedIn, function (sefData) {
                    dbjsMethods.getPracticalClassOnboarding(req.session.csStudentClassID, function (pracData) {
                        if (pracData.length == 0) {
                            var pracData = [];
                            var pracObj = {
                                state: 'noInput',
                                start: 'noClass',
                            };
                            pracData.push(pracObj);
                        }
                        dbjsMethods.getTrialClassforTrialOnboarding(req.session.csStudentClassID, function (lessonData) {
                            if (lessonData.length == 0) {
                                var lessonData = [];
                                var lessonObj = {
                                    lessonType: 'free',
                                    start: 'noClass',
                                };
                                lessonData.push(lessonObj);
                            }



                            // render view
                            res.render('pages/account/onboarding', {
                                title: 'Culturestride', // title of the page (in the tab window)
                                metadescription: 'Immerse deeper and manage your lessons with your Culturestride account.', // metadescription of the page for SEO
                                layout: 'dashlayout', // logged in template
                                rwHSK: req.session.csStudentReadWriteHskLevel,
                                lsHSK: req.session.csStudentListenSpeakHskLevel,
                                sFirstName: req.session.csStudentFirstName, // student first name
                                sLastName: req.session.csStudentLastName, // student last name
                                sLang: req.session.csStudentClassLang, // class language
                                sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                                sClassType: req.session.csStudentClassType, // class type
                                sSlug: req.session.csStudentSlug, // slug
                                sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                                sProfileImage: req.session.csStudentProfileImage, // own profile image
                                sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                                sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                                sStudyTimer: req.session.sStudyTimer, // study timer
                                sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                                sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                                sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                                sNextMeetingType: req.session.nextMeetingType, // next meeting type
                                lesson: lessonData, // trial data for that student
                                autoConfirm: autoConfirm, // auto confirm
                                autoConfirmPrac: autoConfirmPrac, // auto confirm prac
                                sef: sefData[0], // student entry form data
                                prac: pracData[0], // practical data
                                moment: moment, // moment
                                parser: parser, // parser
                            });
                        });
                    });
                });
            });
        });
    }
});
router.get('/a/onboarding/studententryform', function (req, res) {
    var skip = req.query.skip;
    var meta = ``;

    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                // render view
                res.render('pages/account/studententryform', {
                    title: 'Culturestride', // title of the page (in the tab window)
                    metadescription: 'Start your Culturestride Journey', // metadescription of the page for SEO
                    layout: 'blanklayout',
                    meta: meta, // meta
                    stuID: req.session.csStudentLoggedIn,
                    skip: skip, // do we offer skip option
                });
            });
        });
    }
});
router.get('/a/classroom', function (req, res) {
    var join = req.query.join
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                dbjsMethods.getNotesForClassroom(req.session.csStudentClassID, function (classNotesData) {


                    // render view
                    res.render('pages/account/classroomv2', {
                        title: 'Culturestride', // title of the page (in the tab window)
                        metadescription: 'Immerse deeper and manage your lessons with your Culturestride account.', // metadescription of the page for SEO
                        layout: 'dashlayout', // logged in template
                        rwHSK: req.session.csStudentReadWriteHskLevel,
                        lsHSK: req.session.csStudentListenSpeakHskLevel,
                        sFirstName: req.session.csStudentFirstName, // student first name
                        sLastName: req.session.csStudentLastName, // student last name
                        sLang: req.session.csStudentClassLang, // class language
                        sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                        sClassType: req.session.csStudentClassType, // class type
                        sSlug: req.session.csStudentSlug, // slug
                        sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                        sProfileImage: req.session.csStudentProfileImage, // own profile image
                        sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                        sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                        sStudyTimer: req.session.sStudyTimer, // study timer
                        sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                        sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                        sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                        sNextMeetingType: req.session.nextMeetingType, // next meeting type
                        moment: moment, // moment
                        classNotes: classNotesData, // notes data for that class
                        classID: req.session.csStudentClassID, // class id
                        charType: req.session.csStudentCharType, // chartype
                        joinNotesCode: join, // join notes to join
                    });
                });
            });
        });
    }
});
router.get('/a/flashcards', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                // render view
                res.render('pages/account/flashcards', {
                    title: 'Culturestride', // title of the page (in the tab window)
                    metadescription: 'Immerse deeper and manage your lessons with your Culturestride account.', // metadescription of the page for SEO
                    rwHSK: req.session.csStudentReadWriteHskLevel,
                    lsHSK: req.session.csStudentListenSpeakHskLevel,
                    layout: 'dashlayout', // logged in template
                    sFirstName: req.session.csStudentFirstName, // student first name
                    sLastName: req.session.csStudentLastName, // student last name
                    sLang: req.session.csStudentClassLang, // class language
                    sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                    sClassType: req.session.csStudentClassType, // class type
                    sSlug: req.session.csStudentSlug, // slug
                    sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                    sProfileImage: req.session.csStudentProfileImage, // own profile image
                    sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                    sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                    sStudyTimer: req.session.sStudyTimer, // study timer
                    sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                    sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                    sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                    sNextMeetingType: req.session.nextMeetingType, // next meeting type
                    moment: moment, // moment
                });
            });
        });
    }
});
router.get('/404', function (req, res) {
    // render view
    res.render('pages/404', {
        title: '404 Error Not Found | Culturestride', // title of the page (in the tab window)
        metadescription: 'The page you\'re looking for does not exist', // metadescription of the page for SEO
    });
});
router.get('/a/messages', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                dbjsMethods.getRoomsForMessages(req.session.csStudentSlug, function (roomsData) { // we use slug instead of sohocid because sohocid isn't comprehensive
                    // get what rooms user is in
                    var roomsArr = [];
                    for (let i = 0; i < roomsData.length; i++) {
                        roomsArr.push(roomsData[i].sohoRID);
                    }
                    if (roomsArr.length > 0) { // dont crash if there are no message rooms
                        // get users in those rooms
                        dbjsMethods.getUsersInRoomsForMessages(roomsArr, req.session.csStudentSlug, function (usersData) { // get all users in room - needed for dialogue names
                            // create rooms arr - used for mid bar room population
                            var channelRoomsArr = [];
                            var membersArr = [];
                            var profileImage;
                            for (let i = 0; i < roomsData.length; i++) {
                                for (let j = 0; j < usersData.length; j++) {
                                    if (roomsData[i].sohoRID == usersData[j].sohoRID) {
                                        // add members to the room in which they are a member of
                                        var firstName = usersData[j].sFirstName || usersData[j].tFirstName; // the || grabs the student or teacher value, whichever is not null
                                        var lastName = usersData[j].sLastName || usersData[j].tLastName;
                                        var name = firstName + ' ' + lastName;
                                        membersArr.push(name);
                                        profileImage = usersData[j].sProfileImage || usersData[j].tProfileImage || '/img/guru.png';
                                    }
                                }

                                // was the last message sent by themselves or someone else
                                if (roomsData[i].sender == req.session.csStudentSlug) {
                                    var sender = 'self';
                                } else {
                                    var sender = 'else';
                                }

                                var lastMessageContent = roomsData[i].content;
                                if (lastMessageContent) {
                                    var lastMessageContentNoHTML = lastMessageContent.replace(/<[^>]*>/g, '');
                                } else {
                                    var lastMessageContentNoHTML = null;
                                }


                                var roomsObj = {
                                    sohoRID: roomsData[i].sohoRID,
                                    title: roomsData[i].title,
                                    roomType: roomsData[i].roomType,
                                    lastMessageState: roomsData[i].state,
                                    lastMessageSender: sender,
                                    lastMessageContent: lastMessageContentNoHTML,
                                    lastMessageTS: roomsData[i].lastMessageTS,
                                    members: membersArr,
                                    profileImage: profileImage
                                } // build rooms object
                                membersArr = []; // clear arr
                                channelRoomsArr.push(roomsObj)

                            }

                            dbjsMethods.getUnreadMessagesForMessages(req.session.csStudentSlug, function (unreadMessageData) {

                                // update homework counter
                                dbjsMethods.getUnreadHWCount(req.session.csStudentClassID, function (hwData) {
                                    req.session.csStudentHWNotif = hwData[0].count;

                                    // render view
                                    res.render('pages/account/messages', {
                                        title: 'Culturestride', // title of the page (in the tab window)
                                        metadescription: 'Culturestride Portal', // metadescription of the page for SEO
                                        layout: 'dashlayout', // logged in template
                                        rwHSK: req.session.csStudentReadWriteHskLevel,
                                        lsHSK: req.session.csStudentListenSpeakHskLevel,
                                        sFirstName: req.session.csStudentFirstName, // student first name
                                        sLastName: req.session.csStudentLastName, // student last name
                                        sLang: req.session.csStudentClassLang, // class language
                                        sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                                        sClassType: req.session.csStudentClassType, // class type
                                        sSlug: req.session.csStudentSlug, // slug
                                        sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                                        sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                                        sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                                        sStudyTimer: req.session.sStudyTimer, // study timer
                                        sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                                        sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                                        sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                                        sNextMeetingType: req.session.nextMeetingType, // next meeting type
                                        unreadMsg: unreadMessageData, // unread messages by room
                                        moment: moment, // allows us to access moment in EJS
                                        channelRooms: channelRoomsArr, // room data
                                        sProfileImage: req.session.csStudentProfileImage, // own profile image
                                    });
                                });
                            });
                        });
                    }
                });
            });
        });
    }
});
router.get('/privacy', function (req, res) {
    // render view
    var meta = ``;
    res.render('pages/privacypolicy', {
        title: 'Privacy Policy | Culturestride', // title of the page (in the tab window)
        metadescription: 'Culturestride privacy policy.', // metadescription of the page for SEO
        layout: 'blanklayout', //blanklayout
        meta: meta, // meta    
    });
});
router.get('/a/slides', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                dbjsMethods.getSyllabusViewByClass(req.session.csStudentClassID, function (syllabusData) {

                    // // split into level and unit
                    // var hskArr = req.session.csStudentReadWriteHskLevel.split('.');
                    // var hskLevel = hskArr[0];
                    // var hskUnit = hskArr[1];

                    // var previewHskLevel = hskLevel;
                    // var previewHskUnit = hskUnit;
                    // // + 3 preview levels hsk levels
                    // for (var i = 0; i < 3; i++) {

                    //     if (previewHskLevel == 1 && previewHskUnit == 15) {
                    //         previewHskLevel = 2;
                    //         previewHskUnit = 1;
                    //     } else if (previewHskLevel == 2 && previewHskUnit == 15) {
                    //         previewHskLevel = 3;
                    //         previewHskUnit = 1;
                    //     } else if (previewHskLevel == 3 && previewHskUnit == 20) {
                    //         previewHskLevel = 4;
                    //         previewHskUnit = 1;
                    //     } else if (previewHskLevel == 4 && previewHskUnit == 20) {
                    //         previewHskLevel = 5;
                    //         previewHskUnit = 1;
                    //     } else if (previewHskLevel == 5 && previewHskUnit == 36) {
                    //         // do nothing because we dont have HSK 6 stuff yet
                    //     } else {
                    //         previewHskUnit++;
                    //     }

                    // }

                    // // get official slides that student should have access to
                    // var filesArr = [];

                    // var counter = 0; // for preview
                    // while (previewHskLevel > 0) {
                    //     while (previewHskUnit > 0) {
                    //         if (previewHskLevel != 6) { // cos we dont have hsk 6 stuff
                    //             if (counter < 3) {
                    //                 var filesObj = {
                    //                     title: 'HSK ' + previewHskLevel + ' Unit ' + previewHskUnit + ' Standard',
                    //                     link: 'hsk' + previewHskLevel + 'unit' + previewHskUnit + '.pdf',
                    //                     preview: '1'
                    //                 }
                    //             } else {
                    //                 var filesObj = {
                    //                     title: 'HSK ' + previewHskLevel + ' Unit ' + previewHskUnit + ' Standard',
                    //                     link: 'hsk' + previewHskLevel + 'unit' + previewHskUnit + '.pdf',
                    //                     preview: '0'
                    //                 }
                    //             }
                    //             filesArr.push(filesObj);
                    //         }
                    //         counter++;

                    //         previewHskUnit--;
                    //     }
                    //     previewHskLevel--;
                    //     if (previewHskLevel == 5) {
                    //         previewHskUnit = 36;
                    //     } else if (previewHskLevel == 3 || previewHskLevel == 4) {
                    //         previewHskUnit = 20;
                    //     } else {
                    //         previewHskUnit = 15;
                    //     }
                    // }


                    // render view
                    res.render('pages/account/slides', {
                        title: 'Culturestride', // title of the page (in the tab window)
                        metadescription: 'Immerse deeper and manage your lessons with your Culturestride account.', // metadescription of the page for SEO
                        layout: 'dashlayout', // logged in template
                        rwHSK: req.session.csStudentReadWriteHskLevel,
                        lsHSK: req.session.csStudentListenSpeakHskLevel,
                        sFirstName: req.session.csStudentFirstName, // student first name
                        sLastName: req.session.csStudentLastName, // student last name
                        sLang: req.session.csStudentClassLang, // class language
                        sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                        sClassType: req.session.csStudentClassType, // class type
                        sSlug: req.session.csStudentSlug, // slug
                        sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                        sProfileImage: req.session.csStudentProfileImage, // own profile image
                        sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                        sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                        sStudyTimer: req.session.sStudyTimer, // study timer
                        sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                        sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                        sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                        sNextMeetingType: req.session.nextMeetingType, // next meeting type
                        moment: moment, // moment
                        classID: req.session.csStudentClassID, //class id
                        syllabus: syllabusData, // syllabus array
                    });
                });
            });
        });
    }
});
router.get('/start', function (req, res) {
    var error = req.query.error;
    var lang = req.query.lang;
    var group = req.query.group;

    var meta = `<link rel="canonical" href="https://culturestride.com/start" />`;
    // get name of referrerks
    var referrerSlug = req.query.referrer;
    var firstName, lastName, referrerExists;
    dbjsMethods.getStudentNameFromSlug(referrerSlug, function (studentData) {
        if (referrerSlug) {
            referrerExists = 1; // referrer exists
            if (studentData.length == 1) {
                firstName = studentData[0].firstName;
                lastName = studentData[0].lastName;
            }
        } else {
            referrerExists = 0; // referrer does not exist
        }
        // render view
        res.render('pages/signup', {
            title: 'Start | Culturestride', // title of the page (in the tab window)
            metadescription: 'Learn Mandarin online with 1 free Private 1-on-1 Theory and 1 free Group Practical class with native teachers in China.', // metadescription of the page for SEO
            layout: 'blanklayout',
            firstName: firstName, // referrer
            lastName: lastName, // referrer
            referrerExists: referrerExists, // does a referrer exist
            slug: referrerSlug, // referrer slug
            error: error, // error
            lang: lang, // lang
            group: group, // group
            meta: meta, // meta
        });
    });
});
// router.get('/start', function (req, res) {
//     var error = req.query.error;
//     var lang = req.query.lang;
//     var group = req.query.group;

//     var meta = `<link rel="canonical" href="https://culturestride.com/start" />`;
//     // get name of referrerks
//     var referrerSlug = req.query.referrer;
//     var firstName, lastName, referrerExists;
//     dbjsMethods.getStudentNameFromSlug(referrerSlug, function (studentData) {
//         if (referrerSlug) {
//             referrerExists = 1; // referrer exists
//             if (studentData.length == 1) {
//                 firstName = studentData[0].firstName;
//                 lastName = studentData[0].lastName;
//             }
//         } else {
//             referrerExists = 0; // referrer does not exist
//         }
//         // render view
//         res.render('pages/start', {
//             title: 'Start | Culturestride', // title of the page (in the tab window)
//             metadescription: 'Learn Mandarin online with 1 free Private 1-on-1 Theory and 1 free Group Practical class with native teachers in China.', // metadescription of the page for SEO
//             layout: 'blanklayout',
//             firstName: firstName, // referrer
//             lastName: lastName, // referrer
//             referrerExists: referrerExists, // does a referrer exist
//             slug: referrerSlug, // referrer slug
//             error: error, // error
//             lang: lang, // lang
//             group: group, // group
//             meta: meta, // meta
//         });
//     });
// });
router.get('/a/reschedule', function (req, res) {
    var status = req.query.status;
    var query = {
        sohoAID: req.query.class,
        duration: req.query.duration,
        start: req.query.start,
    }
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                dbjsMethods.getTeacherNameForSchedule(req.session.csStudentClassID, function (teacherData) {

                    // render view
                    res.render('pages/account/reschedule', {
                        title: 'Culturestride', // title of the page (in the tab window)
                        metadescription: 'Culturestride Portal', // metadescription of the page for SEO
                        layout: 'dashlayout', // logged in template
                        rwHSK: req.session.csStudentReadWriteHskLevel,
                        lsHSK: req.session.csStudentListenSpeakHskLevel,
                        sFirstName: req.session.csStudentFirstName, // student first name
                        sLastName: req.session.csStudentLastName, // student last name
                        sLang: req.session.csStudentClassLang, // class language
                        sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                        sClassType: req.session.csStudentClassType, // class type
                        sSlug: req.session.csStudentSlug, // slug
                        sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                        sProfileImage: req.session.csStudentProfileImage, // own profile image
                        sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                        sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                        sStudyTimer: req.session.sStudyTimer, // study timer
                        sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                        sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                        sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                        sNextMeetingType: req.session.nextMeetingType, // next meeting type
                        moment: moment, // moment
                        teacher: teacherData[0], // teacher
                        query: query, // query
                        status: status, //status
                    });
                });
            });
        });
    }
});

router.get('/practical/:dynamicroute', function (req, res) {
    var sohoAID = req.params.dynamicroute;
    dbjsMethods.getTeacherDataForBookPractical(sohoAID, function (teacherData) {
        var sohoUID = teacherData[0].sohoUID;
        dbjsMethods.getReviewStatsByTeacher(sohoUID, function (reviewStatsData) {
            dbjsMethods.getReviewByTeacher(sohoUID, function (reviewData) {
                var tFullName = teacherData[0].firstName + ' ' + teacherData[0].lastName;

                // render view
                res.render('pages/account/bookpracticalteacher', {
                    title: tFullName + ' Practical | Culturestride', // title of the page (in the tab window)
                    metadescription: 'Learn Mandarin Chinse online with ' + tFullName + '\'s Practical classes on Culturestride', // metadescription of the page for SEO
                    layout: 'langpagelayout', // logged in template
                    teacher: teacherData[0], // teacher
                    review: reviewData, // review
                    reviewStats: reviewStatsData[0], // reviewStats
                });
            });
        });
    });
});
router.get('/teacher/:dynamicroute', function (req, res) {
    var sohoUID = req.params.dynamicroute;

    dbjsMethods.getTeacherDataForBookTheory(sohoUID, function (teacherData) {
        dbjsMethods.getReviewByTeacher(sohoUID, function (reviewData) {
            var tFullName = teacherData[0].firstName + ' ' + teacherData[0].lastName;

            var meta = ``;
            // render view
            res.render('pages/account/teacher', {
                title: tFullName + ' | Culturestride', // title of the page (in the tab window)
                metadescription: 'Learn Mandarin Chinse online with ' + tFullName + ' on Culturestride', // metadescription of the page for SEO
                layout: 'langpagelayout', // logged in template
                meta: meta, // meta
                teacher: teacherData[0], // teacher
                review: reviewData, // review
            });
        });
    });
});
router.get('/a/book/practical/:dynamicroute', function (req, res) {
    var sohoAID = req.params.dynamicroute;

    dbjsMethods.getTeacherDataForBookPracticalInternal(sohoAID, req.session.csStudentLoggedIn, function (teacherData) {
        var tFullName = teacherData[0].firstName + ' ' + teacherData[0].lastName;
        var sohoUID = teacherData[0].sohoUID;
        dbjsMethods.getReviewStatsByTeacher(sohoUID, function (reviewStatsData) {
            dbjsMethods.getReviewByTeacher(sohoUID, function (reviewData) {
                dbjsMethods.getClassCount(req.session.csStudentLoggedIn, function (lessonCountData) {
                    dbjsMethods.getStripeCustomerData(req.session.csStudentLoggedIn, function (stripeData) {
                // render view
                res.render('pages/account/bookpracticalteacherinternal', {
                    title: 'Culturestride', // title of the page (in the tab window)
                    metadescription: 'Learn Mandarin Chinse online with ' + tFullName + '\'s Practical classes on Culturestride', // metadescription of the page for SEO
                    layout: 'dashlayout', // logged in template
                    rwHSK: req.session.csStudentReadWriteHskLevel,
                    lsHSK: req.session.csStudentListenSpeakHskLevel,
                    sFirstName: req.session.csStudentFirstName, // student first name
                    sLastName: req.session.csStudentLastName, // student last name
                    sLang: req.session.csStudentClassLang, // class language
                    sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                    sClassType: req.session.csStudentClassType, // class type
                    sSlug: req.session.csStudentSlug, // slug
                    sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                    sProfileImage: req.session.csStudentProfileImage, // own profile image
                    sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                    sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                    sStudyTimer: req.session.sStudyTimer, // study timer
                    sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                    sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                    sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                    sNextMeetingType: req.session.nextMeetingType, // next meeting type
                    reviewStats: reviewStatsData[0], // reviewStats
                    teacher: teacherData[0], // teacher
                    review: reviewData, // review
                    sohoAID: sohoAID, // sohoAID
                    lessonCount: lessonCountData[0], // lessoncount
                    cardDetailsExist: stripeData[0].stripeSubscriptionItemId, // stripe
                });
            });
        });
    });
        });
    });
});
router.get('/a/book/theory', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                dbjsMethods.getTeachersForBookTheory(function (teacherData) {

                    // render view
                    res.render('pages/account/booktheory', {
                        title: 'Culturestride', // title of the page (in the tab window)
                        metadescription: 'Culturestride Portal', // metadescription of the page for SEO
                        layout: 'dashlayout', // logged in template
                        rwHSK: req.session.csStudentReadWriteHskLevel,
                        lsHSK: req.session.csStudentListenSpeakHskLevel,
                        sFirstName: req.session.csStudentFirstName, // student first name
                        sLastName: req.session.csStudentLastName, // student last name
                        sLang: req.session.csStudentClassLang, // class language
                        sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                        sClassType: req.session.csStudentClassType, // class type
                        sSlug: req.session.csStudentSlug, // slug
                        sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                        sProfileImage: req.session.csStudentProfileImage, // own profile image
                        sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                        sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                        sStudyTimer: req.session.sStudyTimer, // study timer
                        sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                        sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                        sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                        sNextMeetingType: req.session.nextMeetingType, // next meeting type
                        teacher: teacherData, // teacher
                    });
                });
            });
        });
    }
});
router.get('/a/book/theory/:dynamicroute', function (req, res) {
    var sohoUID = req.params.dynamicroute;

    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                dbjsMethods.getTeacherDataForBookTheory(sohoUID, function (teacherData) {
                    dbjsMethods.getEntryFormDataForBookTheory(req.session.csStudentLoggedIn, function (sefData) {
                        dbjsMethods.getClassCount(req.session.csStudentLoggedIn, function (lessonCountData) {
                            dbjsMethods.getStripeCustomerData(req.session.csStudentLoggedIn, function (stripeData) {
                                dbjsMethods.getReviewByTeacher(sohoUID, function (reviewData) {

                                    // render view
                                    res.render('pages/account/booktheoryteacher', {
                                        title: 'Culturestride', // title of the page (in the tab window)
                                        metadescription: 'Culturestride Portal', // metadescription of the page for SEO
                                        layout: 'dashlayout', // logged in template
                                        rwHSK: req.session.csStudentReadWriteHskLevel,
                                        lsHSK: req.session.csStudentListenSpeakHskLevel,
                                        sFirstName: req.session.csStudentFirstName, // student first name
                                        sLastName: req.session.csStudentLastName, // student last name
                                        sLang: req.session.csStudentClassLang, // class language
                                        sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                                        sClassType: req.session.csStudentClassType, // class type
                                        sSlug: req.session.csStudentSlug, // slug
                                        sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                                        sProfileImage: req.session.csStudentProfileImage, // own profile image
                                        sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                                        sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                                        sStudyTimer: req.session.sStudyTimer, // study timer
                                        sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                                        sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                                        sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                                        sNextMeetingType: req.session.nextMeetingType, // next meeting type
                                        moment: moment, // moment
                                        teacher: teacherData[0], // teacher
                                        review: reviewData, // review
                                        sef: sefData[0], // sef
                                        lessonCount: lessonCountData[0], // lessoncount
                                        cardDetailsExist: stripeData[0].stripeSubscriptionItemId, // stripe
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    }
});
router.get('/a/book/practical', function (req, res) {
    var filterTeacherID = req.query.teacher;
    var filterLevel = req.query.level;

    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                dbjsMethods.getTypeBClassesBookPractical(req.session.csStudentLoggedIn, function (classData) {
                        dbjsMethods.getUniqueTeachersBookPractical(function (uniqueTeacherData) {
                            dbjsMethods.getPracticalCredit(req.session.csStudentLoggedIn, function (pracCreditData) {
                                const startOfMonth = moment().utc().startOf('month'); // 01/08/2020
                                dbjsMethods.getClassesCalcPracCredit(req.session.csStudentLoggedIn, startOfMonth.toISOString(), function (classThisMonthData) {

                                    var pracCreditStartOfMonth = parseFloat(pracCreditData[0].practicalCredit);
                                    // compute live practical credit based off of this months usage of T + P classes
                                    var theoryHoursBooked = 0;
                                    var pracHoursBooked = 0;
                                    for (let i = 0; i < classThisMonthData.length; i++) {
                                        const e = classThisMonthData[i];
                                        if (e.lessonType == 'theory' || e.lessonType == 'standard') {
                                            theoryHoursBooked += parseFloat(e.hours);
                                        } else if (e.lessonType == 'practical' || e.lessonType == 'typeb') {
                                            pracHoursBooked += parseFloat(e.hours);
                                        }
                                    }
                                    var diff = theoryHoursBooked - pracHoursBooked;
                                    pracCreditStartOfMonth += diff;
                                    var pracCreditAvailable = Math.max(0, pracCreditStartOfMonth);

                                    // render view
                                    res.render('pages/account/bookpractical', {
                                        title: 'Culturestride', // title of the page (in the tab window)
                                        metadescription: 'Culturestride Portal', // metadescription of the page for SEO
                                        layout: 'dashlayout', // logged in template
                                        rwHSK: req.session.csStudentReadWriteHskLevel,
                                        lsHSK: req.session.csStudentListenSpeakHskLevel,
                                        sFirstName: req.session.csStudentFirstName, // student first name
                                        sLastName: req.session.csStudentLastName, // student last name
                                        sLang: req.session.csStudentClassLang, // class language
                                        sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                                        sClassType: req.session.csStudentClassType, // class type
                                        sSlug: req.session.csStudentSlug, // slug
                                        sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                                        sProfileImage: req.session.csStudentProfileImage, // own profile image
                                        sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                                        sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                                        sStudyTimer: req.session.sStudyTimer, // study timer
                                        sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                                        sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                                        sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                                        sNextMeetingType: req.session.nextMeetingType, // next meeting type
                                        moment: moment, // moment
                                        classes: classData, // classes
                                        parser: parser, // parser
                                        filterTeacherID: filterTeacherID, // filterTeacherID
                                        filterLevel: filterLevel, // filterLevel
                                        uniqueTeacher: uniqueTeacherData, // uniqueTeacher
                                        pracCreditAvailable: pracCreditAvailable, // pracCreditAvailable
                                    });
                                });
                    });
                });
                });
            });
        });
    }
});
router.get('/practical', function (req, res) {
    var code = req.query.code;
    var meta = ``;

    if (code) { // referrer code
        req.session.referrerCode = code;
    }

    dbjsMethods.getUniqueTeachersBookPractical(function (uniqueTeacherData) {
    dbjsMethods.getTypeBClasses(function (classData) {
        // render view
        res.render('pages/practical', {
            title: 'Find Practical Class | Culturestride', // title of the page (in the tab window)
            metadescription: 'Join Culturestride\'s weekly Practical classes to practice and build your Mandarin Chinese abilities in context.', // metadescription of the page for SEO
            meta: meta, // meta
            layout: 'langpagelayout', //blanklayout
            classes: classData, // class data
            uniqueTeacher: uniqueTeacherData, // uniqueTeacher
            parser: parser, // cron parser
        });
    });
});
});
router.get('/theory', function (req, res) {
    var code = req.query.code;
    var meta = ``;

    if (code) { // referrer code
        req.session.referrerCode = code;
    }

    dbjsMethods.getTeachersForBookTheory(function (teacherData) {

        // render view
        res.render('pages/theory', {
            title: 'Find Theory Teacher | Culturestride', // title of the page (in the tab window)
            metadescription: 'Join Culturestride\'s Theory classes to learn HSK Mandarin Chinese in a classroom 1-on-1 private setting.', // metadescription of the page for SEO
            meta: meta, // meta
            layout: 'langpagelayout', //blanklayout
            teacher: teacherData, // teacher
        });
    });
});

router.get('/speakingtest', function (req, res) {

    var meta = ``;
    res.render('pages/speakingtest', {
        title: 'Mandarin Speaking Test | Culturestride', // title of the page (in the tab window)
        metadescription: 'Test your speaking abilities to figure out which level Practical class you should join.', // metadescription of the page for SEO
        meta: meta, // meta
        layout: 'blanklayout', //blanklayout
    });
});
router.get('/a/confirm/practical', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                var sohoGMID = req.query.groupMemberID;

                dbjsMethods.getStudentDataForAcceptJoinGroup(sohoGMID, function (stuData) {

                    var time = req.query.time;

                    var state = 'confirmed';
                    dbjsMethods.updateGroupMemberState(state, sohoGMID);

                    if (stuData.length > 0) {


                        var email = stuData[0].email;
                        var sFirstName = stuData[0].firstName;
                        var timezone = stuData[0].timezone;
                        var startTime = moment(time, 'YYYY-MM-DDTHH:mm:ssZ').utc();
                        var timeFormatted = startTime.clone().tz(timezone).format('LLLL');
                        var sohoGID = stuData[0].sohoGID;
                        var sohoUID = stuData[0].sohoUID;
                        try {
                            var gcEventID = stuData[0].gcEventID.split('_')[0];
                        } catch (e) {
                            console.log(e);
                        }
                        var joinlink = 'https://culturestride.com/join/' + sohoUID;


                        dbjsMethods.getPracticalGroupDetails(sohoGID, function (groupData) {
                            var finalGroupSize = groupData[0].count;

                            if (finalGroupSize >= 3) {
                                // email the student
                                customMethods.emailStuAcceptJoinGroupClass(sFirstName, email, timeFormatted, timezone, joinlink);

                                // add the student email to the google calendar invite
                                dbjsMethods.getCalendarDataForAcceptJoinGroupClass(sohoGID, function (calData) {

                                    fs.readFile('credentials.json', (err, content) => {
                                        if (err) return console.log('Error loading client secret file:', err);
                                        var attendeesArr = [];

                                        // push student
                                        if (calData.length > 0) { // inadvertently no teachers are invited to this event unless someone is already confirmed, ie you're confirming attendance of the 2nd student
                                            for (let i = 0; i < calData.length; i++) {
                                                var attendeesObj = {
                                                    'email': calData[i].sEmail
                                                }
                                                attendeesArr.push(attendeesObj);
                                            }

                                            // push teacher

                                            var attendeesObj = {
                                                'email': calData[0].tEmail
                                            }
                                            attendeesArr.push(attendeesObj);

                                        }


                                        // add new student
                                        var attendeesObj = {
                                            'email': email
                                        }
                                        attendeesArr.push(attendeesObj);

                                        var gCalData = {
                                            gcEventId: gcEventID,
                                            attendees: attendeesArr,
                                        }

                                        customMethods.gCalUpdateAttendees(JSON.parse(content), gCalData, function (data) {

                                        });
                                    });

                                });
                            } else if (finalGroupSize == 2) {
                                dbjsMethods.getEmailDataForAddStudentToGroup2(sohoGID, function (groupStuData) {

                                    for (let i = 0; i < groupStuData.length; i++) {
                                        var time = req.query.time;
                                        var email = groupStuData[i].email;
                                        var sFirstName = groupStuData[i].firstName;
                                        var timezoneGroupStu = groupStuData[i].timezone;
                                        var timeMom = moment(time, 'YYYY-MM-DDTHH:mm:ssZ').utc();
                                        var timeFormatted = timeMom.clone().tz(timezoneGroupStu).format('LLLL');

                                        var joinlink = 'https://culturestride.com/join/' + sohoUID;

                                        // email the student
                                        customMethods.emailStuAcceptJoinGroupClass(sFirstName, email, timeFormatted, timezoneGroupStu, joinlink);

                                    }

                                    // add the student email to the google calendar invite
                                    dbjsMethods.getCalendarDataForAcceptJoinGroupClass(sohoGID, function (calData) {

                                        fs.readFile('credentials.json', (err, content) => {
                                            if (err) return console.log('Error loading client secret file:', err);
                                            var attendeesArr = [];

                                            // push student
                                            if (calData.length > 0) { // inadvertently no teachers are invited to this event unless someone is already confirmed, ie you're confirming attendance of the 2nd student
                                                for (let i = 0; i < calData.length; i++) {
                                                    var attendeesObj = {
                                                        'email': calData[i].sEmail
                                                    }
                                                    attendeesArr.push(attendeesObj);
                                                }

                                                // push teacher

                                                var attendeesObj = {
                                                    'email': calData[0].tEmail
                                                }
                                                attendeesArr.push(attendeesObj);

                                            }


                                            // add new student
                                            var attendeesObj = {
                                                'email': email
                                            }
                                            attendeesArr.push(attendeesObj);

                                            var gCalData = {
                                                gcEventId: gcEventID,
                                                attendees: attendeesArr,
                                            }

                                            customMethods.gCalUpdateAttendees(JSON.parse(content), gCalData, function (data) {

                                            });
                                        });

                                    });
                                });

                            } else if (finalGroupSize == 1) {
                                // email the student
                                customMethods.emailStuAcceptJoinGroupClassUnconfirmed(sFirstName, email, timeFormatted, timezone);
                            }


                        });
                    }
                    res.redirect('/a/classadmin?pracConfirm=1');
                });


            });
        });
    }
});
router.get('/a/settings', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                // get classes
                dbjsMethods.getSettingsData(req.session.csStudentClassID, function (settingsData) { // get count of all the unread messages across all the rooms that the teacher is a part of
                    // render view
                    res.render('pages/account/settings', {
                        title: 'Culturestride', // title of the page (in the tab window)
                        metadescription: 'Culturestride Portal', // metadescription of the page for SEO
                        layout: 'dashlayout', // logged in template
                        rwHSK: req.session.csStudentReadWriteHskLevel,
                        lsHSK: req.session.csStudentListenSpeakHskLevel,
                        sFirstName: req.session.csStudentFirstName, // student first name
                        sLastName: req.session.csStudentLastName, // student last name
                        sLang: req.session.csStudentClassLang, // class language
                        sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                        sClassType: req.session.csStudentClassType, // class type
                        sSlug: req.session.csStudentSlug, // slug
                        sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                        sProfileImage: req.session.csStudentProfileImage, // own profile image
                        sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                        sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                        sStudyTimer: req.session.sStudyTimer, // study timer
                        sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                        sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                        sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                        sNextMeetingType: req.session.nextMeetingType, // next meeting type
                        moment: moment, // moment
                        settings: settingsData[0], // settings
                    });
                });
            });
        });
    }
});
router.get('/classroom/:dynamicroute', function (req, res) {
    var code = req.params.dynamicroute;
    // render view
    res.render('pages/classroom', {
        title: 'Classroom | Culturestride', // title of the page (in the tab window)
        metadescription: 'Culturestride classroom', // metadescription of the page for SEO
        layout: 'footeronlylayout', // logged in template
        code: code, // code
    });
});
router.get('/exercise', function (req, res) {
    var meta = ``;
    dbjsMethods.getHomework(function (exerciseData) {
        // render view
        res.render('pages/exercise', {
            title: 'Exercise | Culturestride', // title of the page (in the tab window)
            metadescription: 'Improve your Mandarin Chinese with community created exercises.', // metadescription of the page for SEO
            layout: 'langpagelayout', // logged in template
            meta: meta, // meta
            exercise: exerciseData, // exercise
        });
    });
});
router.get('/exercise/:dynamicroute', function (req, res) {
    var sohoHID = req.params.dynamicroute;

    var meta = ``;
    dbjsMethods.getHomeworkIndividual(sohoHID, function (exerciseData) {
        // render view
        res.render('pages/exerciseIndividual', {
            title: 'Exercise ' + sohoHID + ' | Culturestride', // title of the page (in the tab window)
            metadescription: 'Improve your Mandarin Chinese with community created exercises.', // metadescription of the page for SEO
            layout: 'langpagelayout', // logged in template
            meta: meta, // meta
            exercise: exerciseData, // exercise
        });
    });
});
router.get('/a/exercise', function (req, res) {
    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                dbjsMethods.getHomework(function (exerciseData) {
                    // render view
                    res.render('pages/account/exercise', {
                        title: 'Culturestride', // title of the page (in the tab window)
                        metadescription: 'Culturestride Portal', // metadescription of the page for SEO
                        layout: 'dashlayout', // logged in template
                        rwHSK: req.session.csStudentReadWriteHskLevel,
                        lsHSK: req.session.csStudentListenSpeakHskLevel,
                        sFirstName: req.session.csStudentFirstName, // student first name
                        sLastName: req.session.csStudentLastName, // student last name
                        sLang: req.session.csStudentClassLang, // class language
                        sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                        sClassType: req.session.csStudentClassType, // class type
                        sSlug: req.session.csStudentSlug, // slug
                        sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                        sProfileImage: req.session.csStudentProfileImage, // own profile image
                        sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                        sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                        sStudyTimer: req.session.sStudyTimer, // study timer
                        sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                        sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                        sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                        sNextMeetingType: req.session.nextMeetingType, // next meeting type
                        exercise: exerciseData, // exercise
                    });
                });
            });
        });
    }
});
router.get('/a/exercise/:dynamicroute', function (req, res) {
    var sohoHID = req.params.dynamicroute;

    if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
        res.redirect('/login');
    } else {
        customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
            customMethods.refreshSessionVars(req, function (sessionData) {
                dbjsMethods.getHomeworkIndividual(sohoHID, function (exerciseData) {
                    // render view
                    res.render('pages/account/exerciseIndividual', {
                        title: 'Culturestride', // title of the page (in the tab window)
                        metadescription: 'Culturestride Portal', // metadescription of the page for SEO
                        layout: 'dashlayout', // logged in template
                        rwHSK: req.session.csStudentReadWriteHskLevel,
                        lsHSK: req.session.csStudentListenSpeakHskLevel,
                        sFirstName: req.session.csStudentFirstName, // student first name
                        sLastName: req.session.csStudentLastName, // student last name
                        sLang: req.session.csStudentClassLang, // class language
                        sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                        sClassType: req.session.csStudentClassType, // class type
                        sSlug: req.session.csStudentSlug, // slug
                        sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                        sProfileImage: req.session.csStudentProfileImage, // own profile image
                        sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                        sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                        sStudyTimer: req.session.sStudyTimer, // study timer
                        sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                        sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                        sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                        sNextMeetingType: req.session.nextMeetingType, // next meeting type
                        exercise: exerciseData, // exercise
                    });
                });
            });
        });
    }
});
router.get('/resource/how-to-not-waste-6-months', function (req, res) {
    var meta = ``;
            res.render('pages/resource/howToNotWaste6Months', {
                title: 'How To Not Waste 6 Months Learning Chinese Naively (It\'s Hard!)', // title of the page (in the tab window)
                metadescription: 'Polyglot Reveals How To Avoid Wasting Time In Your Chinese Learning Journey In an Insightful 20-Page Publication', // metadescription of the page for SEO
                layout: 'footeronlylayout', //blanklayout
                meta: meta, // meta
            });
});
router.get('/resource/thankyou', function (req, res) {
    var meta = ``;
            res.render('pages/resource/thankyou', {
                title: 'Start Learning Chinese Now!', // title of the page (in the tab window)
                metadescription: 'Download Your Beginner Chinese Starter Pack To Make Progress Today!', // metadescription of the page for SEO
                layout: 'footeronlylayout', //blanklayout
                meta: meta, // meta
            });
});
router.get('/resource/starterpack', function (req, res) {
    var meta = ``;
            res.render('pages/resource/starterpack', {
                title: 'Start Learning Chinese Now!', // title of the page (in the tab window)
                metadescription: 'Download Your Beginner Chinese Starter Pack To Make Progress Today!', // metadescription of the page for SEO
                layout: 'footeronlylayout', //blanklayout
                meta: meta, // meta
            });
});
router.get('/resource/starterpack/thankyou', function (req, res) {
    var meta = ``;
            res.render('pages/resource/starterpackthankyou', {
                title: 'Start Learning Chinese Now!', // title of the page (in the tab window)
                metadescription: 'Download Your Beginner Chinese Starter Pack To Make Progress Today!', // metadescription of the page for SEO
                layout: 'footeronlylayout', //blanklayout
                meta: meta, // meta
            });
});





















// ----------------------------------------------------------------------- POST ----------------------------------------------------------------------



router.post('/login', function (req, res) {
    // define variables
    var inputEmail = req.body.email;
    var inputPassword = req.body.password;


    // check if email and pw match
    dbjsMethods.getStudentforLogin(inputEmail, function (studentData) { // get society director information row based off inputted email
        if (studentData[0]) { // if there exists an account with the same email
            bcrypt.compare(inputPassword, studentData[0].pw, function (err, result) { // use bcrypt to compare the inputted pw with the stored password hash
                if (result == true) { // inputPassword and hash match
                    console.log('Culturestride student - login successful');
                    // set sessions var of logged in person
                    req.session.csStudentLoggedIn = studentData[0].sohoSID;
                    req.session.csStudentFirstName = studentData[0].firstName;
                    req.session.csStudentLastName = studentData[0].lastName;
                    req.session.csStudentSlug = studentData[0].slug;
                    req.session.sessionLastUpdated = moment().utc().format();

                    // profile image
                    if (studentData[0].profileImage != null) {
                        req.session.csStudentProfileImage = studentData[0].profileImage;
                    } else { // if there is no profile image stored
                        req.session.csStudentProfileImage = '/img/guru.png';
                    }

                    dbjsMethods.getStudentClassForLogin(req.session.csStudentLoggedIn, function (studentClassData) {
                        if (studentClassData.length > 0) {
                            dbjsMethods.getLessonForLogin(studentClassData[0].sohoCID, function (lessonData) { // get the number of classes that have happened before NOW + 3 hours - in case ppl log in on the dot of the class and they need sth from onboarding
                                dbjsMethods.getUnreadMessagesForLogin(req.session.csStudentSlug, function (messagesData) {
                                    dbjsMethods.getRoomForLogin(studentClassData[0].sohoCID, function (roomData) {
                                        var today = moment().utc().startOf('day').format(); // date only
                                        dbjsMethods.getTimerForDay(today, studentClassData[0].sohoCID, function (timerData) {
                                            dbjsMethods.getPracticalGroupsJoin(studentClassData[0].sohoCID, function (groupData) {
                                                dbjsMethods.getPMIForClassroom(studentClassData[0].sohoCID, function (teacherPMIData) {


                                                    if (timerData.length > 0) {
                                                        req.session.sStudyTimer = timerData[0].time; // set study session time to previous value for today
                                                    } else {
                                                        req.session.sStudyTimer = 0; // no study has been done today
                                                    }


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
                                                            req.session.csStudentLessonCount = lessonData[0].count;
                                                            req.session.csStudentClassType = 'free';
                                                        }

                                                        if (lessonData[0].count == 0) { // show onboarding stuff if the student has never taken a class in the past
                                                            req.session.csStudentShowOnboarding = 1; // this is a trial student
                                                        } else {
                                                            req.session.csStudentShowOnboarding = 0; // this is not a trial student
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
                                                    dbjsMethods.getUnreadHWCount(req.session.csStudentClassID, function (hwData) {
                                                        req.session.csStudentHWNotif = hwData[0].count;

                                                        console.log('Logged in student ' + new Date() + ' is: ' + req.session.csStudentLoggedIn + ' (SID) - ' + req.session.csStudentClassID + ' (CID) -' + req.session.csStudentFirstName + ' - ' + req.session.csStudentLastName);
                                                        const token = jwt.sign({
                                                            email: inputEmail
                                                        }, process.env.JWT_SECRET_KEY, {
                                                            expiresIn: '365d'
                                                        });
                                                        var expiryTime = new Date(new Date().getTime() + 10 * 365 * 24 * 60 * 60 * 1000);
                                                        res.cookie('access_token', token, {
                                                            expires: expiryTime
                                                        });

                                                        // check if there's a page they were tryna to access in req.session.aPageToBeAccessed, otherwise route to classroom
                                                        if (req.session.aPageToBeAccessed) {
                                                            res.redirect(req.session.aPageToBeAccessed);
                                                        } else {
                                                            res.redirect('/a/classadmin');
                                                        }
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        } else { // no class
                            console.log('Culturestride student - login unsuccessful - no class');
                            // render view
                            res.render('pages/login', {
                                title: 'Login | Culturestride', // title of the page (in the tab window)
                                metadescription: 'Login to your Culturestride account.', // metadescription of the page for SEO                
                                error: 3 // error var for failed login
                            });
                        }
                    });
                } else { // inputPassword and hash DO NOT match - FAILED LOGIN
                    console.log('Culturestride student - login unsuccessful - incorrect password');
                    // render view
                    res.render('pages/login', {
                        title: 'Login | Culturestride', // title of the page (in the tab window)
                        metadescription: 'Login to your Culturestride account.', // metadescription of the page for SEO                
                        error: 1 // error var for failed login
                    });
                }
            });
        } else { // no matching email is found in the database - FAILED LOGIN
            console.log('Culturestride student - login unsuccessful - email not found');
            // render view
            res.render('pages/login', {
                title: 'Login | Culturestride', // title of the page (in the tab window)
                metadescription: 'Login to your Culturestride account.', // metadescription of the page for SEO       
                error: 1 // error var for failed login
            });
        }
    });
});
router.post('/googleLogin', function (req, res) {

    // check if a user exists for this email, if yes get ID and log them in
    dbjsMethods.getStudentforLogin(req.body.email, function (studentData) { // get society director information row based off inputted email
        if (studentData.length == 1) { // log them in
            console.log('Culturestride student - login successful');
            // set sessions var of logged in person
            req.session.csStudentLoggedIn = studentData[0].sohoSID;
            req.session.csStudentFirstName = studentData[0].firstName;
            req.session.csStudentLastName = studentData[0].lastName;
            req.session.csStudentSlug = studentData[0].slug;
            req.session.sessionLastUpdated = moment().utc().format();

            // profile image
            if (studentData[0].profileImage != null) {
                req.session.csStudentProfileImage = studentData[0].profileImage;
            } else { // if there is no profile image stored
                req.session.csStudentProfileImage = '/img/guru.png';
            }
            dbjsMethods.getStudentClassForLogin(req.session.csStudentLoggedIn, function (studentClassData) {
                dbjsMethods.getLessonForLogin(studentClassData[0].sohoCID, function (lessonData) { // get the number of classes that have happened before NOW + 3 hours - in case ppl log in on the dot of the class and they need sth from onboarding
                    dbjsMethods.getUnreadMessagesForLogin(req.session.csStudentSlug, function (messagesData) {
                        dbjsMethods.getRoomForLogin(studentClassData[0].sohoCID, function (roomData) {
                            var today = moment().utc().startOf('day').format(); // date only
                            dbjsMethods.getTimerForDay(today, studentClassData[0].sohoCID, function (timerData) {
                                dbjsMethods.getPracticalGroupsJoin(studentClassData[0].sohoCID, function (groupData) {
                                    dbjsMethods.getPMIForClassroom(studentClassData[0].sohoCID, function (teacherPMIData) {

                                        if (timerData.length > 0) {
                                            req.session.sStudyTimer = timerData[0].time; // set study session time to previous value for today
                                        } else {
                                            req.session.sStudyTimer = 0; // no study has been done today
                                        }

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
                                                req.session.csStudentLessonCount = lessonData[0].count;
                                                req.session.csStudentClassType = 'free';
                                            }

                                            if (lessonData[0].count == 0) { // show onboarding stuff if the student has never taken a class in the past
                                                req.session.csStudentShowOnboarding = 1; // this is a trial student
                                            } else {
                                                req.session.csStudentShowOnboarding = 0; // this is not a trial student
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

                                        dbjsMethods.getUnreadHWCount(req.session.csStudentClassID, function (hwData) {
                                            req.session.csStudentHWNotif = hwData[0].count;

                                            console.log('Logged in student ' + new Date() + ' is: ' + req.session.csStudentLoggedIn + ' (SID) - ' + req.session.csStudentClassID + ' (CID) -' + req.session.csStudentFirstName + ' - ' + req.session.csStudentLastName);
                                            const token = jwt.sign({
                                                email: req.body.email
                                            }, process.env.JWT_SECRET_KEY, {
                                                expiresIn: '365d'
                                            });
                                            var expiryTime = new Date(new Date().getTime() + 10 * 365 * 24 * 60 * 60 * 1000);
                                            res.cookie('access_token', token, {
                                                expires: expiryTime
                                            });

                                            // check if there's a page they were tryna to access in req.session.aPageToBeAccessed, otherwise route to classroom
                                            if (req.session.aPageToBeAccessed) {
                                                res.redirect(req.session.aPageToBeAccessed);
                                            } else {
                                                res.redirect('/a/classadmin');
                                            }
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        } else { // No account exists (or duplicate - less likely)
            console.log('Culturestride student - login unsuccessful - no account or duplicate accounts exist');
            // render view
            res.redirect('/login?error=2')
        }
    });
});
router.post('/a/logout', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        // clear all variables
        req.session.csStudentLoggedIn = null;
        req.session.csStudentFirstName = null;
        req.session.csStudentLastName = null;
        req.session.csStudentSlug = null;
        res.redirect('/login');
    });
});
router.post('/forgotpassword', function (req, res) {
    dbjsMethods.getEmailofStudentsForgotPassword(req.body.email, function (emailRecords) { //check if email has actually been signed up
        if (emailRecords.length == 0) {
            res.render('pages/forgotpassword', {
                title: 'Forgot Password | Culturestride',
                metadescription: 'Reset your password for your Culturestride account.',
                error: 1, // error var for failed login
                expire: 0
            });
        } else {
            crypto.randomBytes(20, function (err, buf) {
                var token = buf.toString('hex'); //generates random token to be used in url
                var expiryDate = Date.now() + 3600000; //sets expiry date of token to 1 hour past present time
                dbjsMethods.allocateTokenandExpiryDateForgotPassword(req.body.email, token, expiryDate, function (err) { //updates relevant db row with token and expiry date
                    customMethods.emailStudentthatForgotPassword(req.body.email, req.headers.host, token); //emails society with link to reset password
                    res.redirect('/forgotpasswordthankyou');
                });
            })
        }
    })
});
router.post('/resetpassword', function (req, res) {
    var tokenURL = req.body.token;

    dbjsMethods.getExpiryDateOfTokenForgotPassword(tokenURL, function (expiryDateData) {

        var expiryDate = parseInt(expiryDateData[0].resetPasswordExpires, 10);

        if (Date.now() >= expiryDate) { //checks if it's been more than 1 hour since user requested to change password

            dbjsMethods.clearTokenandExpiryDateForgotPassword(tokenURL);

            res.render('pages/forgotpassword', {
                title: 'Forgot Password | Culturestride',
                metadescription: 'Reset your password for your Culturestride account.',
                error: 0,
                expire: 1 //token has expired and email will need to be entered again
            });

        } else {

            if (req.body.newPassword == req.body.confirmPassword) { //check if user correctly confirms their new password/correctly enters the same password twice
                bcrypt.genSalt(saltRounds, function (err, salt) {
                    bcrypt.hash(req.body.newPassword, salt, function (err, hash) {
                        dbjsMethods.resetPasswordForgotPassword(hash, req.body.token); //sets new password in db
                        res.redirect('/resetpasswordthankyou');
                    });
                });
            } else { //executes if user doesn't confirm password correctly
                res.render('pages/resetPassword', {
                    title: 'Reset Password | Culturestride',
                    metadescription: 'Reset your password for your Culturestride account.',
                    token: tokenURL,
                    error: 1
                });
            }

        }
    })
});
router.post('/signup', function (req, res) {
    var timezone = req.body.timezone;
    var email = req.body.email;
    var refCode = req.session.referrerCode;
    var fullName = req.body.fullName;

    // test to see if email satisfies XXX@YYY.ZZZ
    var emailValidationRE = /\S+@\S+\.\S+/;
    var emailValid = emailValidationRE.test(email);
    if (emailValid) {
        // create new student in database if an account with the email doesn't already exist
        dbjsMethods.getStudentforDoubleSignUpCheck(email, function (studentData) { //check if email has actually been signed up
            if (studentData.length != 0) { // an account with this email already exists
                console.log('An account with the same email address already exists');
                res.redirect('/start?error=2');
            } else {

                // parse first and last name
                var inputName = fullName;
                var inputNameArr = inputName.split(" ");
                if (inputNameArr.length > 1) {
                    var lastName = inputNameArr[inputNameArr.length - 1]; // this grabs the last word = last name
                    inputNameArr.pop(); // pop out the last item
                    var firstName = inputNameArr.join(' '); // add the array names into first name var    
                } else {
                    var firstName = inputNameArr[inputNameArr.length - 1]; // this grabs the last word = last name
                    var lastName = ''; // add the array names into first name var
                }


                // create slug 
                var slug = crypto.randomBytes(10).toString('hex').slice(8);
                dbjsMethods.checkIfSlugExists(slug, function (slugData) { // does the slug already exist?
                    if (slugData.length != 0) {
                        // regenerate slug
                        slug = crypto.randomBytes(10).toString('hex').slice(8); // reroll once - TODO in the future you'd probably do a check again but what are the chances????        
                    }
                });

                bcrypt.genSalt(saltRounds, function (err, salt) {
                    bcrypt.hash(req.body.password, salt, function (err, hash) {

                        if (req.body.password == "") { // this should only happen for Google account sign ups
                            var hash = null; // this makes the pw hash field null so users have to login using google accounts in the future
                        }

                        if (req.body.profileImage == '') {
                            var profileImage = null;
                        } else {
                            var profileImage = req.body.profileImage;
                        }

                        var stuHome = null;

                        dbjsMethods.createStudentForStartOnboarding(firstName, lastName, email, hash, "Mandarin", slug, stuHome, profileImage, timezone, refCode, function (sohoSIDData) {
                            var sohoSID = sohoSIDData; // the sohoSID of newly created student 
                            var className = firstName + ' ' + lastName + ' Mandarin';
                            var sohoUID = 1; // Michael

                            var readWriteHSKLevel = '1.0';
                            var listenSpeakHSKLevel = '1.0';
                            var classType = 'free';
                            var plan = null;

                            dbjsMethods.addClassforStart(sohoSID, sohoUID, className, 0, 0, readWriteHSKLevel, listenSpeakHSKLevel, "Mandarin", classType, plan, function (sohoCIDData) { // classType is free/standard

                                // create support messaging room
                                var roomType = 'support';
                                dbjsMethods.createMessagingRoom(roomType, sohoCIDData, function (newSohoRID) { // create messaging room
                                    dbjsMethods.addRoomsUser(newSohoRID, slug); // add student into sohoroomsusers
                                    dbjsMethods.addRoomsUser(newSohoRID, michaelSlug); // add student into sohoroomsusers
                                    dbjsMethods.addRoomsUser(newSohoRID, masaeSlug); // add student into sohoroomsusers
                                    var state = 'sent';
                                    var sender = michaelSlug;
                                    var message = 'Hi ' + firstName + ', welcome to Culturestride! This is your support channel which directly connects you with our software engineers, teaching managers and cofounders should you have any concerns or feedback.';
                                    var messageType = 'text';
                                    dbjsMethods.saveMessageforChat(newSohoRID, sender, message, state, messageType);
                                    var message2 = 'In your first few lessons, someone from the Culturestride team may join one of your classes to help you personalise your learning experience.';
                                    dbjsMethods.saveMessageforChat(newSohoRID, sender, message2, state, messageType);
                                });

                                // stripe
                                customMethods.createStripeCustomer(sohoSID, email, firstName, lastName);

                                // sign them in
                                req.session.csStudentLoggedIn = sohoSID;
                                req.session.csStudentFirstName = firstName;
                                req.session.csStudentLastName = lastName;
                                req.session.csStudentSlug = slug;
                                req.session.csStudentReadWriteHskLevel = '1.0';
                                req.session.csStudentListenSpeakHskLevel = '1.0';
                                req.session.csStudentClassLang = 'Mandarin'; // assuming only 1 class for each student
                                req.session.csStudentClassExist = 1;
                                req.session.csStudentClassID = sohoCIDData; // set class id
                                req.session.csStudentShowOnboarding = 1; // set trial var = 1
                                req.session.csStudentClassType = classType;
                                req.session.csStudentUnreadMessages = 2; // there are unread messages = 2 support ones
                                req.session.sStudyTimer = 0; // no study has been done today
                                req.session.sessionLastUpdated = moment().utc().format();
                                req.session.csStudentHWNotif = 0;
                                req.session.theoryMeetingURL = null; // personal meeting room for teacher
                                req.session.nextMeetingTime = null;
                                req.session.nextMeetingType = null;
                                req.session.csStudentLessonCount = 0;
                                req.session.practicalMeetingURL = [];
                                req.session.csStudentCharType = 'simp'; // char Type

                                if (profileImage) {
                                    req.session.csStudentProfileImage = profileImage; // there are no unread messages
                                } else {
                                    req.session.csStudentProfileImage = '/img/guru.png';
                                }

                                console.log('Logged in student is: ' + req.session.csStudentLoggedIn + ' (SID) -' + req.session.csStudentClassID + ' (CID) -' + req.session.csStudentFirstName + '-' + req.session.csStudentLastName);
                                const token = jwt.sign({
                                    email: req.body.email
                                }, process.env.JWT_SECRET_KEY, {
                                    expiresIn: '365d'
                                });
                                var expiryTime = new Date(new Date().getTime() + 10 * 365 * 24 * 60 * 60 * 1000);
                                res.cookie('access_token', token, {
                                    expires: expiryTime
                                });
                                // redirect to next page
                                res.redirect('/a/start/card');
                            });
                        });
                    });
                });
            }
        });
    } else { // invalid email
        console.log('Email Invalid - Start');
        res.redirect('/start?error=2');
    }
});
router.post('/a/onboarding/studententryform', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var history = customMethods.nl2br(req.body.history);
        var listeningLevel = req.body.stuListeningLevel;
        var writingLevel = customMethods.nl2br(req.body.writing);
        // update student field
        dbjsMethods.updateStudentEntryForm(req.body.stuID, req.body.stuGoal, req.body.stuReadingLevel, listeningLevel, writingLevel, history);
        res.redirect('/a/book/theory');
    });
});
router.post('/ajaxUploadSpeakingEntry', uploadSpeakingAudioEntry.single('file'), function (req, res, next) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        dbjsMethods.updateStudentEntryFormSpeaking(req.body.stuID, req.file.location);
    });
});
router.post('/confirmStuAttendance', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var sohoAID = req.body.sohoAID;

        dbjsMethods.getLessonDataForConfirm(sohoAID, function (lessonData) {

            var eventStartMom = moment(lessonData[0].start, 'YYYY-MM-DDTHH:mm:ssZ');
            var eventEndMom = eventStartMom.clone().add(45, 'minutes');
            var studentName = lessonData[0].sFirstName + ' ' + lessonData[0].sLastName;
            var teacherName = lessonData[0].tFirstName + ' ' + lessonData[0].tLastName;

            // update confirm var in sohocalendar
            var confirmed = 2; // denotes that both teacher and student has accepted
            dbjsMethods.confirmStudentAttendanceForLesson(confirmed, sohoAID);

            var emailArr = [];
            var emailObj = {
                'email': lessonData[0].sEmail
            };
            emailArr.push(emailObj);
            var emailObj = {
                'email': lessonData[0].tEmail
            };
            emailArr.push(emailObj);

            var summary = 'Culturestride Class - ' + studentName + ' | ' + teacherName;
            var description = 'Class will begin 5 minutes after the event start time.';
            var colorId = 9; // dark blue
            var location = 'https://culturestride.com/join/' + lessonData[0].sohoUID;

            var gCalData = {
                summary: summary,
                description: description,
                colorId: colorId,
                eventStart: eventStartMom.clone().utc().format(),
                eventEnd: eventEndMom.clone().utc().format(),
                email: emailArr,
                studentName: studentName,
                teacherName: teacherName,
                location: location,
            }

            // add recurring gcal event and then add it to own calendar
            fs.readFile('credentials.json', (err, content) => {
                if (err) return console.log('Error loading client secret file:', err);
                customMethods.gCalCreateSingle(JSON.parse(content), gCalData, function (data) { // create recurring event in gcal
                    // get instance ids from gcal again 
                    var eventId = data;
                    dbjsMethods.updateEventWithGcalEventId(sohoAID, eventId); // add to own calendar
                });
            });

            // email the teacher that student has confirmed attendance
            customMethods.emailTeacherStuConfirmAttendance(lessonData[0].tEmail, studentName, eventStartMom.clone().tz('Asia/Shanghai').format("LLLL"));

            res.redirect('/a/onboarding');
        });
    });
});
router.post('/confirmStuAttendancePrac', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var sohoGMID = req.body.groupMemberID;

        dbjsMethods.getStudentDataForAcceptJoinGroup(sohoGMID, function (stuData) {

            var time = req.body.time;

            var state = 'confirmed';
            dbjsMethods.updateGroupMemberState(state, sohoGMID);

            if (stuData.length > 0) {


                var email = stuData[0].email;
                var sFirstName = stuData[0].firstName;
                var timezone = stuData[0].timezone;
                var startTime = moment(time, 'YYYY-MM-DDTHH:mm:ssZ').utc();
                var timeFormatted = startTime.clone().tz(timezone).format('LLLL');
                var sohoGID = stuData[0].sohoGID;
                var sohoUID = stuData[0].sohoUID;
                try {
                    var gcEventID = stuData[0].gcEventID.split('_')[0];
                } catch (e) {
                    console.log(e);
                }
                var joinlink = 'https://culturestride.com/join/' + sohoUID;


                dbjsMethods.getPracticalGroupDetails(sohoGID, function (groupData) {
                    var finalGroupSize = groupData[0].count;

                    if (finalGroupSize >= 3) {
                        // email the student
                        customMethods.emailStuAcceptJoinGroupClass(sFirstName, email, timeFormatted, timezone, joinlink);

                        // add the student email to the google calendar invite
                        dbjsMethods.getCalendarDataForAcceptJoinGroupClass(sohoGID, function (calData) {

                            fs.readFile('credentials.json', (err, content) => {
                                if (err) return console.log('Error loading client secret file:', err);
                                var attendeesArr = [];

                                // push student
                                if (calData.length > 0) { // inadvertently no teachers are invited to this event unless someone is already confirmed, ie you're confirming attendance of the 2nd student
                                    for (let i = 0; i < calData.length; i++) {
                                        var attendeesObj = {
                                            'email': calData[i].sEmail
                                        }
                                        attendeesArr.push(attendeesObj);
                                    }

                                    // push teacher

                                    var attendeesObj = {
                                        'email': calData[0].tEmail
                                    }
                                    attendeesArr.push(attendeesObj);

                                }


                                // add new student
                                var attendeesObj = {
                                    'email': email
                                }
                                attendeesArr.push(attendeesObj);

                                var gCalData = {
                                    gcEventId: gcEventID,
                                    attendees: attendeesArr,
                                }

                                customMethods.gCalUpdateAttendees(JSON.parse(content), gCalData, function (data) {

                                });
                            });

                        });
                    } else if (finalGroupSize == 2) {
                        dbjsMethods.getEmailDataForAddStudentToGroup2(sohoGID, function (groupStuData) {

                            for (let i = 0; i < groupStuData.length; i++) {
                                var time = req.body.time;
                                var email = groupStuData[i].email;
                                var sFirstName = groupStuData[i].firstName;
                                var timezoneGroupStu = groupStuData[i].timezone;
                                var timeMom = moment(time, 'YYYY-MM-DDTHH:mm:ssZ').utc();
                                var timeFormatted = timeMom.clone().tz(timezoneGroupStu).format('LLLL');

                                var joinlink = 'https://culturestride.com/join/' + sohoUID;

                                // email the student
                                customMethods.emailStuAcceptJoinGroupClass(sFirstName, email, timeFormatted, timezoneGroupStu, joinlink);

                            }

                            // add the student email to the google calendar invite
                            dbjsMethods.getCalendarDataForAcceptJoinGroupClass(sohoGID, function (calData) {

                                fs.readFile('credentials.json', (err, content) => {
                                    if (err) return console.log('Error loading client secret file:', err);
                                    var attendeesArr = [];

                                    // push student
                                    if (calData.length > 0) { // inadvertently no teachers are invited to this event unless someone is already confirmed, ie you're confirming attendance of the 2nd student
                                        for (let i = 0; i < calData.length; i++) {
                                            var attendeesObj = {
                                                'email': calData[i].sEmail
                                            }
                                            attendeesArr.push(attendeesObj);
                                        }

                                        // push teacher

                                        var attendeesObj = {
                                            'email': calData[0].tEmail
                                        }
                                        attendeesArr.push(attendeesObj);

                                    }


                                    // add new student
                                    var attendeesObj = {
                                        'email': email
                                    }
                                    attendeesArr.push(attendeesObj);

                                    var gCalData = {
                                        gcEventId: gcEventID,
                                        attendees: attendeesArr,
                                    }

                                    customMethods.gCalUpdateAttendees(JSON.parse(content), gCalData, function (data) {

                                    });
                                });

                            });
                        });

                    } else if (finalGroupSize == 1) {
                        // email the student
                        customMethods.emailStuAcceptJoinGroupClassUnconfirmed(sFirstName, email, timeFormatted, timezone);
                    }


                });
            }
            res.redirect('/a/onboarding');
        });
    });
});
router.post('/ajaxUploadSpeaking', uploadSpeakingAudio.single('file'), function (req, res, next) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var homeworkAssignmentID = req.body.homeworkAssignmentID;
        var audioHTML = `<div class="qAudio"><figure><audio controls id="audioPreview" src="` + req.file.location + `" type="audio/mp3">Your browser does not support this <code>audio</code> element.</audio></figure></div>`;
        var audio = req.file.location;
        var state = 'teaAction';
        var answerType = 'audio';
        dbjsMethods.updateAnswerforHomeworkAssignmentStu(homeworkAssignmentID, state, audio, answerType);
        // update state of hwnotif
        dbjsMethods.getUnreadHWCount(req.session.csStudentClassID, function (hwData) {
            req.session.csStudentHWNotif = hwData[0].count;
            req.session.save();
            res.status(200).send();
        });

    });
});
router.post('/a/homeworkv2/complete', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var homeworkAssignmentID = req.body.homeworkID;
        var state = 'complete';
        dbjsMethods.updateStateHomeworkAssignment(state, homeworkAssignmentID);
        // update state of hwnotif
        dbjsMethods.getUnreadHWCount(req.session.csStudentClassID, function (hwData) {
            req.session.csStudentHWNotif = hwData[0].count;
            req.session.save();
        });
        res.redirect('/a/homework');
    });
});
router.post('/a/classroomAddPage', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        // get shuffle no
        dbjsMethods.getMaxShuffleNoInNotes(req.body.class, function (maxShuffleNoData) {
            if (maxShuffleNoData[0].shuffle != null) { // not null
                var shuffleNo = maxShuffleNoData[0].shuffle + 1;
            } else {
                var shuffleNo = 1;
            }
            dbjsMethods.insertNewPageInNotes(req.body.class, shuffleNo);
        })
        res.redirect('/a/classroom');
    });
});
router.post('/a/classroom/save', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var notesID = req.body.notesID;
        dbjsMethods.saveNotesForClassroomNotes(notesID, req.body.tinyTextEditor); // save notes
        res.redirect('/a/classroom');
    });
});
router.post('/a/classroom/delete/:dynamicroute', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var notesID = req.params.dynamicroute;

        dbjsMethods.deleteNotesForClassroomNotes(notesID); // delete notes
        res.redirect('/a/classroom');
    });
});
router.post('/a/reschedule', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        // send an email to the teacher and to michael about preferred time schedule + comments from student
        dbjsMethods.getTeacherEmailForScheduleRequest(req.session.csStudentClassID, function (teacherData) {
            var curTime = moment(req.body.curClassTime, 'YYYY-MM-DDTHH:mm:ssZ');
            var newTime = moment(req.body.newClassTime, 'YYYY-MM-DDTHH:mm:ssZ');
            var sohoAID = req.body.curCalendarId;

            dbjsMethods.addRescheduleRequest(req.body.newClassCalendarId, sohoAID); // add to the database

            customMethods.sendRescheduleRequest(teacherData[0].email, teacherData[0].firstName, teacherData[0].className, curTime.clone().format("dddd, MMMM Do YYYY HH:mm A Z"), req.body.curClassDuration, newTime.clone().format("dddd, MMMM Do YYYY HH:mm A Z"), req.body.comments);
        });
        res.redirect('/a/reschedule?status=success#status')
    });
});
router.post('/a/book/theory/:dynamicroute', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var sohoUID = req.params.dynamicroute;
        // send an email to the teacher and to michael about preferred time schedule + comments from student
        dbjsMethods.getTeacherEmailForScheduleRequest(sohoUID, function (teacherData) {
            dbjsMethods.getStudentDetailsForBookTheory(req.session.csStudentClassID, function (classData) {
                dbjsMethods.getClassCount(req.session.csStudentLoggedIn, function (classCountData) {
                    var newTime = moment(req.body.newClassTime, 'YYYY-MM-DDTHH:mm:ssZ');
                    var lessonLength = req.body.lessonLength;
                    var repeatNo = req.body.repeatNo;
                    var theoryCount = classCountData[0].theoryCount;
                    var endTime = newTime.clone().add(lessonLength, 'hours');

                    // add to cal
                    var sohoCID = req.session.csStudentClassID;
                    var sohoSID = req.session.csStudentLoggedIn;
                    var title = classData[0].className;
                    var free = 0;
                    var groupSlug = crypto.randomBytes(10).toString('hex').slice(10); // potential risk of double up slug
                    var lessonType = 'theory';
                    var confirmed = 0;
                    var manualBook = 1;


                    // add to calenda and lessonlog for each repeat
                    var asyncArr = [];
                    for (let i = 0; i < repeatNo; i++) {
                        var startMom = newTime.clone().add(i, 'weeks');
                        var endMom = endTime.clone().add(i, 'weeks');
                        var asyncObj = {
                            newTime: startMom.utc().format(),
                            endTime: endMom.utc().format(),
                        }
                        asyncArr.push(asyncObj);
                    }

                    async.forEach(asyncArr, (asyncObj) => {
                        // add to calendar
                        dbjsMethods.bookSingleClass(sohoSID, sohoUID, sohoCID, asyncObj.newTime, asyncObj.endTime, title, free, groupSlug, confirmed, lessonType, manualBook, function (newSohoAID) {

                            // add to lesson log
                            var sohoAID = newSohoAID;
                            var hours = lessonLength;
                            var dateOfClass = asyncObj.newTime;
                            var hoursLeft = 0;
                            var readWriteHSKLevel = 1.1;
                            var listenSpeakHSKLevel = 1.1;
                            var lessonType = 'theory';
                            // free first class
                            if (theoryCount == 0) {
                                var payment = 'bank';
                            } else {
                                var payment = 'card';
                            }

                            dbjsMethods.sohoAddClasstoLessonLogV2(sohoCID, sohoSID, sohoUID, hours, hoursLeft, dateOfClass, readWriteHSKLevel, listenSpeakHSKLevel, payment, lessonType, sohoAID);
                        });

                    });



                    // email teacher
                    customMethods.emailTeacherBookTheoryClass(teacherData[0].email, teacherData[0].firstName, classData[0].firstName, classData[0].lastName, newTime.clone().tz('Asia/Shanghai').format("LLLL"), endTime.clone().tz('Asia/Shanghai').format("LLLL"), repeatNo);

                    // email student
                    var sEmail = classData[0].email;
                    var timezone = classData[0].timezone;
                    var startMom = moment.tz(req.body.newClassTime, timezone);
                    var startFormatted = startMom.format('LLLL');
                    var joinLink = 'https://culturestride.com/join/' + sohoUID;
                    customMethods.emailStudentBookTheoryClass(sEmail, req.session.csStudentFirstName, teacherData[0].firstName, teacherData[0].lastName, startFormatted, timezone, joinLink, repeatNo);

                    // create messaging room if it doesn't already exist
                    var recipient = teacherData[0].slug;

                    // create room only if it doesnt already exists
                    dbjsMethods.getRoomBetweenTwoUsers(recipient, req.session.csStudentSlug, function (roomData) {
                        if (roomData.length == 0) {
                            // create room
                            var roomType = 'teaching';
                            dbjsMethods.createMessagingRoom(roomType, req.session.csStudentClassID, function (newSohoRID) { // create messaging room
                                dbjsMethods.addRoomsUser(newSohoRID, req.session.csStudentSlug); // add student into sohoroomsusers
                                dbjsMethods.addRoomsUser(newSohoRID, recipient); // add student into sohoroomsusers
                            });
                        }

                        res.redirect('/a/classadmin');

                    });
                });
            });
        });
    });
});
router.post('/ajaxUpdateTitle', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        dbjsMethods.updateTitleForClassroomNotes(req.body.text, req.body.notesID); // save notes
        res.redirect('/a/classroom');
    });
});
router.post('/ajaxUpdateHomeworkToggle', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var toggle = req.body.toggle;
        dbjsMethods.updateToggleDailyHW(toggle, req.session.csStudentClassID);
        res.status(200).send();
    });
});
router.post('/ajaxGetAnswersForHomework', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        dbjsMethods.getAnswersForHomework(req.body.homeworkId, req.body.classID, function (answerData) {
            res.send(answerData);
        });
    });
});
router.post('/ajaxUpdateUnreadMsgCount', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        if (req.body.who == 'stu') {
            req.session.csStudentUnreadMessages = req.body.msgCount;
        } else {
            req.session.sohoUserUnreadMsgCount = req.body.msgCount;
        }

        req.session.save(); // needed to save session states when updating vars through ajax
        res.status(200).send();
    });
});
router.post('/cancel', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var sohoLID = req.body.classID;
        var sohoAID = req.body.calendarID;


        dbjsMethods.getClassDataForCancel(req.session.csStudentClassID, function (classData) {
            dbjsMethods.getGcEventIDBySohoAID(sohoAID, function (gcEventIdData) {
                var gcEventId = gcEventIdData[0].gcEventID;
                var title = '[cancelled] ' + classData[0].className;
                dbjsMethods.cancelUpcomingClass(title, sohoAID); // cancel the class

                // delete gcal event
                fs.readFile('credentials.json', (err, content) => {
                    if (err) return console.log('Error loading client secret file:', err);
                    gCalData = {
                        gcEventId: gcEventId,
                    }
                    if (gcEventId) {
                        customMethods.gCalDelete(JSON.parse(content), gCalData);
                    }
                });
                res.redirect('/a/classadmin');
                dbjsMethods.sohoDeleteLesson(sohoLID); // then delete the event

            });
        });

    });
});
router.post('/cancel/practical', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var sohoLID = req.body.classID;
        var sohoAID = req.body.calendarID;

        dbjsMethods.sohoDeleteLesson(sohoLID); // then delete the event

        // update calendar invite attendees
        dbjsMethods.getEmailDataFromCalendarCancelPrac(sohoAID, function (calData) {
            var gcEventId = calData[0].gcEventID;
            fs.readFile('credentials.json', (err, content) => {
                if (err) return console.log('Error loading client secret file:', err);
                var attendeesArr = [];

                // push student
                if (calData.length > 0) {
                    for (let i = 0; i < calData.length; i++) {
                        if (calData[i].sEmail) {
                        var attendeesObj = {
                            'email': calData[i].sEmail
                        }
                        attendeesArr.push(attendeesObj);
                    }
                    }

                    // push teacher

                    var attendeesObj = {
                        'email': calData[0].tEmail
                    }
                    attendeesArr.push(attendeesObj);

                }

                var gCalData = {
                    gcEventId: gcEventId,
                    attendees: attendeesArr,
                }

                customMethods.gCalUpdateAttendees(JSON.parse(content), gCalData, function (data) {

                });
            });

        });
        res.redirect('/a/classadmin');
    });
});
router.post('/ajaxUploadAudioMessage', uploadMessageAudio.single('file'), function (req, res, next) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var fileURL = req.file.location;
        res.status(200).send(fileURL);
    });
});
router.post('/ajaxUpdateDialogueFreq', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var dialogueFreq = req.body.dialogueFreq;
        dbjsMethods.updateDialogueFreq(dialogueFreq, req.session.csStudentClassID);
    });
});
router.post('/uploadProfileImageGoogle', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var googleProfileImage = req.body.googleProfileImage;
        var sohoSID = req.session.csStudentLoggedIn;
        dbjsMethods.updateProfileImage(googleProfileImage, sohoSID);
        req.session.csStudentProfileImage = googleProfileImage;
        res.redirect('back');
    });
});
router.post('/ajaxAutosaveHomework', function (req, res, next) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var sohoHAID = req.body.homeworkID;
        var text = req.body.text;
        dbjsMethods.updateAnswerforHomeworkAssignmentAutosaveStu(sohoHAID, text);
        res.status(200).send();
    });
});
router.post('/ajaxAutosaveGroupNotes', function (req, res, next) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var text = req.body.text;
        var sohoUID = req.session.sohoUserLoggedIn;
        dbjsMethods.updateGroupNotesTeacher(sohoUID, text);
        res.status(200).send();
    });
});
router.post('/timer', function (req, res, next) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var time = Math.round(parseFloat(req.body.time)); // round to the nearest second
        var today = moment().utc().startOf('day').format(); // date only
        var sohoCID = req.body.classID;
        // check if time already exists for today then increment else create new 
        dbjsMethods.getTimerForDay(today, sohoCID, function (timerData) {
            if (timerData.length > 0) { // increment existint time
                var sohoTID = timerData[0].sohoTID;
                var oldTime = Math.round(parseFloat(timerData[0].time));
                var newTime = oldTime + time;
                dbjsMethods.updateTime(sohoTID, newTime);
                req.session.sStudyTimer = newTime;
            } else { // add new
                dbjsMethods.insertTime(sohoCID, today, time);
                req.session.sStudyTimer = time;
            }
            req.session.save();
            res.status(200).send();
        });
    });
});
router.post('/emailMichael', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var subject = req.body.sClass + ' clicked the save homework button';
        var content = 'its in the title fam';
        customMethods.emailMichael(subject, content);
        res.redirect('/a/homework');
    });
});
router.post('/ajaxReferBtnClicked', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var subject = req.session.csStudentClassID + ' - ' + req.session.csStudentFirstName + ' ' + req.session.csStudentLastName + ' clicked the refer button';
        var content = 'its in the title fam';
        customMethods.emailMichael(subject, content);
        res.redirect('/a/homework');
    });
});
router.post('/ajaxReferBtnClickedGP', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var subject = req.session.csStudentClassID + ' - ' + req.session.csStudentFirstName + ' ' + req.session.csStudentLastName + ' copied the refer GUEST PASS text';
        var content = 'its in the title fam';
        customMethods.emailMichael(subject, content);
        res.redirect('/a/homework');
    });
});
router.post('/ajaxReferBtnClickedRB', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var subject = req.session.csStudentClassID + ' - ' + req.session.csStudentFirstName + ' ' + req.session.csStudentLastName + ' copied the refer BONUS text';
        var content = 'its in the title fam';
        customMethods.emailMichael(subject, content);
        res.redirect('/a/homework');
    });
});

router.post('/a/book/typeb/register', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var sohoAID = req.body.id;
        var sohoSID = req.session.csStudentLoggedIn;
        var sohoCID = req.session.csStudentClassID;
        var groupSlug = req.body.slug;


        // check if attendee count is 2 or above, change confirm to 4 for everyone
        dbjsMethods.getCalendarEventsByGroupSlugRegister(groupSlug, function (countData) {
            if (countData.length > 0) {
                if (countData[0].count >= 1) { // change confirm to 4
                    dbjsMethods.getCalendarEventsByGroupSlug(groupSlug, function (calData) {
                        if (calData.length > 0) {
                            var sohoAIDArr = [];
                            for (let i = 0; i < calData.length; i++) {
                                sohoAIDArr.push(calData[i].sohoAID);
                            }
                            var confirmed = 4;
                            dbjsMethods.updateStateCalendarEvent(confirmed, sohoAIDArr);
                            dbjsMethods.insertCalendarEventRegister(sohoAID, sohoSID, sohoCID); // create new event - copy old

                        }
                    });
                } else {
                    dbjsMethods.insertCalendarEventRegister(sohoAID, sohoSID, sohoCID); // create new event - copy old
                }


            }
        })
        // deduct credit
        res.redirect('/a/book/typeb');
    });
});
router.post('/ajaxJoinPracticalClass', function (req, res) {
    var sohoAID = req.body.calendarID;
                var sohoGID = req.body.groupID;
                var repeatNo = req.body.repeatNo;
                var sohoUID = req.body.teacherID;
                var start = req.body.start;

    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        dbjsMethods.getNextInstancesPrac(sohoGID, start, function (instanceData) {
            dbjsMethods.getClassCount(req.session.csStudentLoggedIn, function (classCountData) {
            dbjsMethods.getStudentDetailsForBookTheory(req.session.csStudentClassID, function (classData) {
                
                var sohoSID = req.session.csStudentLoggedIn;
                var sohoCID = req.session.csStudentClassID;
                var hours = 1;
                var hoursLeft = 0;
                var readWriteHSKLevel = 1.1;
                var listenSpeakHSKLevel = 1.1;
                var lessonType = 'practical';
                var practicalCount = classCountData[0].practicalCount;
                // free first class
                if (practicalCount == 0) {
                    var payment = 'bank';
                } else {
                    var payment = 'card';
                }

                    // add to calenda and lessonlog for each repeat
                    var asyncArr = [];
                    var noEvents = Math.min(instanceData.length, repeatNo); // sometimes there are less events than what the student wants to join.
                    for (let i = 0; i < noEvents; i++) {
                        
                        var asyncObj = {
                            start: instanceData[i].start,
                            sohoAID: instanceData[i].sohoAID
                        }
                        asyncArr.push(asyncObj);
                    }

                    async.forEach(asyncArr, (asyncObj) => {

                    dbjsMethods.sohoAddClasstoLessonLogV2(sohoCID, sohoSID, sohoUID, hours, hoursLeft, asyncObj.start, readWriteHSKLevel, listenSpeakHSKLevel, payment, lessonType, asyncObj.sohoAID);

                // add the student email to the google calendar invite
                dbjsMethods.getEmailDataFromCalendar(asyncObj.sohoAID, function (calData) {
                    var gcEventId = calData[0].gcEventID;
                    fs.readFile('credentials.json', (err, content) => {
                        if (err) return console.log('Error loading client secret file:', err);
                        var attendeesArr = [];

                        // push student
                        if (calData.length > 0) {
                            for (let i = 0; i < calData.length; i++) {
                                var attendeesObj = {
                                    'email': calData[i].sEmail
                                }
                                attendeesArr.push(attendeesObj);
                            }

                            // push teacher

                            var attendeesObj = {
                                'email': calData[0].tEmail
                            }
                            attendeesArr.push(attendeesObj);

                        }

                        var gCalData = {
                            gcEventId: gcEventId,
                            attendees: attendeesArr,
                        }

                        customMethods.gCalUpdateAttendees(JSON.parse(content), gCalData, function (data) {

                        });
                    });

                });
            });


                // join Practical messaging group
                dbjsMethods.getRoomIdJoinPractical(sohoAID, function (roomData) {
                    // check if already in it
                    if (roomData.length > 0) {
                        var sohoRID = roomData[0].sohoRID;
                        var slug = req.session.csStudentSlug;

                        dbjsMethods.getSpecificUserInRoom(sohoRID, slug, function (userInRoomData) {
                            if (userInRoomData.length == 0 && sohoRID != null) { // this student isn't in this room
                                try {
                                    dbjsMethods.addRoomsUser(sohoRID, slug); // add student to this room
                                } catch (e) {
                                    console.log(e)
                                }
                            }
                        })
                    }

                });


                dbjsMethods.getTeacherDataById(sohoUID, function (teacherData) {
                    // email student
                    var sEmail = classData[0].email;
                    var timezone = classData[0].timezone;
                    var startMom = moment.tz(start, timezone);
                    var startFormatted = startMom.format('LLLL');
                    var joinLink = 'https://culturestride.com/join/' + sohoUID;
                    customMethods.emailStudentBookPracticalClass(sEmail, req.session.csStudentFirstName, teacherData[0].firstName, teacherData[0].lastName, startFormatted, timezone, joinLink, noEvents);

                    // email teacher
                    var startMom = moment.tz(start, 'Asia/Shanghai');
                    var startFormatted = startMom.format('LLLL');
                    customMethods.emailTeacherBookPracticalClass(teacherData[0].email, teacherData[0].firstName, classData[0].firstName, classData[0].lastName, startFormatted, noEvents);

                });

                res.redirect('/a/classadmin');
            });
        });
    });
});
});
router.post('/ajaxInitTable', function (req, res) {
    var level = req.body.level;
    dbjsMethods.getPracticalGroupsOpen(level, function (groupData) {
        for (let i = 0; i < groupData.length; i++) {
            var start = groupData[i].start;

            var options = {
                tz: 'UTC'
            };

            try {
                var interval = parser.parseExpression(start, options);
                var nextClass = interval.next().toISOString();
            } catch (err) {
                console.log('Error: ' + err.message);
            }

            groupData[i].nextClass = nextClass;

        }

        res.send(groupData);
    });
});
router.post('/ajaxToggleCharType', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var charType = req.body.charType;
        var sohoCID = req.session.csStudentClassID;
        // update events
        dbjsMethods.updateCharType(charType, sohoCID);
        req.session.csStudentCharType = charType;
        req.session.save();
        res.status(200).send();
    });
});
router.post('/message', function (req, res) {
    var recipient = req.query.user;

    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        // create room only if it doesnt already exists
        dbjsMethods.getRoomBetweenTwoUsers(recipient, req.session.csStudentSlug, function (roomData) {
            if (roomData.length == 0) {
                // create room
                var roomType = 'teaching';
                dbjsMethods.createMessagingRoom(roomType, req.session.csStudentClassID, function (newSohoRID) { // create messaging room
                    dbjsMethods.addRoomsUser(newSohoRID, req.session.csStudentSlug); // add student into sohoroomsusers
                    dbjsMethods.addRoomsUser(newSohoRID, recipient); // add student into sohoroomsusers
                });
            }

            res.redirect('/a/messages')

        });

    });
});
router.post('/ajaxAssignHomework', function (req, res) {
    var level = req.body.level;
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        if (level == 0) {
            var sqlLevelString = '1.1';
        } else {
            var sqlLevelString = level + '%';
        }
        dbjsMethods.getRandomExerciseAtLevel(sqlLevelString, function (exerciseData) {
            var sohoHID = exerciseData[0].sohoHID;
            var sohoCID = req.session.csStudentClassID;
            var assignedBy = null;
            var d = new Date();
            var assignedDate = d.toISOString().split('.')[0] + "Z"
            dbjsMethods.insertHomeworkAssignment(sohoHID, sohoCID, assignedBy, assignedDate);
            res.status(200).send();

        })
    });
});
router.post('/submitreview', function (req, res) {
    var sohoUID = req.body.teacherID;
    var sohoLID = req.body.classID;
    var sohoSID = req.session.csStudentLoggedIn;
    var stars = req.body.stars;
    var comments = req.body.comments;
    if (comments == '') {
        comments = null;
    }

    var classType = req.body.classType;

    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {

        dbjsMethods.addReview(sohoUID, sohoSID, sohoLID, stars, comments, classType);
        res.redirect('/a/classadmin');
    });
});
router.post('/checkCalendarEventFree', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var sohoUID = req.body.teacher;
        var lessonLength = req.body.lessonLength;
        var start = moment(req.body.start).utc(); // the start of the event in question
        var end = start.clone().add(lessonLength, 'hours'); // the start of the event in question
        var startEndRange = moment.range(start, end);

        var startDay = start.clone().subtract(1,'days').startOf('day'); // get events of the day before too incase we have a class that overlaps the midnight threshold
        var endDay = start.clone().add(1,'days').startOf('day');

                var overlaps = 0;

                dbjsMethods.getTeacherEventsCalendarEvents(sohoUID, startDay.clone().format(), endDay.clone().format(), function (calData) {

                    for (let i = 0; i < calData.length; i++) {
                        const e = calData[i];

                        // create moment ranges
                        var eventStart = moment(e.start).utc();
                        var eventEnd = moment(e.end).utc();
                        var eventRange = moment.range(eventStart, eventEnd);

                        if (eventRange.overlaps(startEndRange) == true) {
                            console.log('overlaps');
                            overlaps = 1;
                            break;
                        }

                    }
                    res.json(overlaps);

                });
    });
});
router.post('/getNextPracticalClassInstances', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var start = req.body.start;
        var repeatNo = req.body.repeatNo;
        var sohoGID = req.body.groupID;
                dbjsMethods.getNextInstancesPracCheck(sohoGID, start, function (instanceData) {
                    var noEvents = Math.min(instanceData.length, repeatNo); // sometimes there are less events than what the student wants to join.
                    var eventsArr = [];
                    for (let i = 0; i < noEvents; i++) {
                        var obj = {
                            start: instanceData[i].start,
                            sCount: instanceData[i].sCount
                        }
                        eventsArr.push(obj);
                    }
                    res.json(eventsArr); // send back the start times of the events

                });
    });
});
router.post('/assignExercise', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var sohoHID = req.body.homeworkID;
        var d = new Date();
        var assignedBy = null;
        var sohoCID = req.session.csStudentClassID;
        dbjsMethods.sohoCreateNewHomeworkAssignment(sohoHID, sohoCID, assignedBy, d.toISOString().split('.')[0] + "Z");
        res.redirect('/a/exercise')
    });
});
router.post('/resource/how-to-not-waste-6-months', function (req, res) {
        var name = req.body.fullName;
        var email = req.body.email;

        // email the student
        customMethods.sendResourceHowToNotWaste6Months(name, email);

            // email Michael
    var subject = 'How To Not Waste 6 Months Submission (' + name + ')';
    var content = name + ' (' + email + ')';

    customMethods.emailMichael(subject, content);

        res.redirect('/resource/thankyou');
});
router.post('/resource/starterpack', function (req, res) {
    var howLong = req.body.howLong;
    var whatLang = req.body.whatLang;
    var whyLearn = req.body.whyLearn;
    var whyNow = req.body.whyNow;
    var whenStart = req.body.whenStart;
    var whyUs = req.body.whyUs;
    var scale = req.body.scale;
    var pinky = req.body.pinky;
    var whyYou = req.body.whyYou;
    var name = req.body.name;
    var email = req.body.email;

    // email the student
    customMethods.sendResourceStarterPack(name, email);

    // email Michael (starter pack)
    var subject = 'Starter Pack Submission (' + name + ')';
    var content = name + ' (' + email + ').<br><br>how long have you been learning Chinese? ' + howLong + '<br>What languages do you know? ' + whatLang + '<br>Why are you learning Chinese? ' + whyLearn + '<br>why learn Chinese now? ' + whyNow + '<br>When do you want to start taking classes? ' + whenStart + '<br>There are lots of ways to learn Chinese, why us? ' + whyUs + '<br>On a scale of 1 - 10, how interested are you in starting Chinese classes? ' + scale + '<br>Pinky promise that if you book a class with the credits we give you, you\'ll show up for it? ' + pinky + '<br>Why should we teach you? ' + whyYou;

    customMethods.emailMichael(subject, content);
    res.redirect('/resource/starterpack/thankyou');
});







































// GET
router.get('/soho', function (req, res) {
    // render view
    res.render('pages/teachingPortal/sohoLogin', {
        title: 'Teacher Portal | Culturestride',
        metadescription: 'Teacher Portal for Culturestride Teachers',
        layout: 'teacherlayout', // change to teacherlayout
        error: 0 // no error message is shown (var is used for failed logins)
    });
});
router.get('/sohocreateuser', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session        
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            // render view
            res.render('pages/teachingPortal/sohoCreateUser', {
                title: 'Teacher Portal | Culturestride',
                metadescription: 'Teacher Portal for Culturestride Teachers',
                layout: 'teacherdashlayout', // change to teacherlayout
                sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                sohoLastName: req.session.sohoUserLastName, // lastname
                sohoPermission: req.session.sohoUserPermission, // permission
                sohoSlug: req.session.sohoUserSlug, // permission
                sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                sohoProfileImage: req.session.sohoUserProfileImage, // profile image
            });
        });
    }
});
router.get('/sohoprofile', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session        
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.getTeacherDataProfile(req.session.sohoUserLoggedIn, function (teacherData) {
                dbjsMethods.getReviewDataProfile(req.session.sohoUserLoggedIn, function (reviewData) {
                // render view
                res.render('pages/teachingPortal/sohoprofile', {
                    title: 'Teacher Portal | Culturestride',
                    metadescription: 'Teacher Portal for Culturestride Teachers',
                    layout: 'teacherdashlayout', // change to teacherlayout
                    sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                    sohoLastName: req.session.sohoUserLastName, // lastname
                    sohoPermission: req.session.sohoUserPermission, // permission
                    sohoSlug: req.session.sohoUserSlug, // permission
                    sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                    sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                    sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                    sohoUID: req.session.sohoUserLoggedIn, // profile image
                    teacher: teacherData[0], // teacher data
                    review: reviewData, // review data
                });
            });
        });
        });
    }
});
router.get('/sohostudents', function (req, res) {
    console.log('req.session.sohoUserLoggedIn: ' + req.session.sohoUserLoggedIn);

    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session        
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.sohoGetFirstClasses(req.session.sohoUserLoggedIn, function (sohoFirstClassData) {
                dbjsMethods.sohoGetStudentsData(req.session.sohoUserLoggedIn, req.session.sohoUserPermission, function (sohoStudentsData) {
                    dbjsMethods.sohoGetHomeworkStatusData(function (hwData) {
                            dbjsMethods.sohoGetUpcomingClassesForSohoStudents(req.session.sohoUserLoggedIn, function (upcomingClassData) {
                                dbjsMethods.getUnreadHWForSoho(req.session.sohoUserPermission, req.session.sohoUserLoggedIn, function (unreadHWCountData) { // get count of all the unread messages across all the rooms that the teacher is a part of

                                    req.session.sohoUserUnreadHWCount = unreadHWCountData[0].unreadHWCount;

                                    // render view
                                    res.render('pages/teachingPortal/sohoStudents', {
                                        title: 'Teacher Portal | Culturestride',
                                        metadescription: 'Teacher Portal for Culturestride Teachers',
                                        layout: 'teacherdashlayout', // change to teacherlayout
                                        sohoStudents: sohoStudentsData,
                                        sohoUID: req.session.sohoUserLoggedIn, //uid
                                        sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                                        sohoLastName: req.session.sohoUserLastName, // lastname
                                        sohoPermission: req.session.sohoUserPermission, // permission
                                        sohoSlug: req.session.sohoUserSlug, // permission
                                        sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                                        sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                                        sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                                        sohoFirst: sohoFirstClassData, // trial class data
                                        hw: hwData, // hw
                                        upcomingClass: upcomingClassData, // upcomingClass
                                        sohoVideoConfPMI: req.session.sohoVideoConfPMI, // permission
                                        moment: moment, // moment
                                        parser: parser, // parser
                                    });
                                });
                            });
                    });
                });
            });
        });
    }
});
router.get('/sohoinactive', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session        
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.sohoGetInactiveStudentsData(function (sohoStudentsData) {
                dbjsMethods.sohoGetHomeworkStatusData(function (hwData) {
                    // render view
                    res.render('pages/teachingPortal/sohoInactive', {
                        title: 'Teacher Portal | Culturestride',
                        metadescription: 'Teacher Portal for Culturestride Teachers',
                        layout: 'teacherdashlayout', // change to teacherlayout
                        sohoStudents: sohoStudentsData,
                        sohoUID: req.session.sohoUserLoggedIn, //uid
                        sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                        sohoLastName: req.session.sohoUserLastName, // lastname
                        sohoPermission: req.session.sohoUserPermission, // permission
                        sohoSlug: req.session.sohoUserSlug, // permission
                        sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                        sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                        sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                        hw: hwData, // hw
                    });
                });
            });
        });
    }
});
router.get('/sohobackground', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session        
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.getAllStudentBackground(function (backgroundData) {
                // render view
                res.render('pages/teachingPortal/sohoBackground', {
                    title: 'Teacher Portal | Culturestride',
                    metadescription: 'Teacher Portal for Culturestride Teachers',
                    layout: 'teacherdashlayout', // change to teacherlayout
                    sohoUID: req.session.sohoUserLoggedIn, //uid
                    sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                    sohoLastName: req.session.sohoUserLastName, // lastname
                    sohoPermission: req.session.sohoUserPermission, // permission
                    sohoSlug: req.session.sohoUserSlug, // permission
                    sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                    sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                    sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                    background: backgroundData, // background
                });
            });
        });
    }
});
router.get('/soholessonhistory/:dynamicroute', function (req, res) {

    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session        
        res.redirect('/soho');
    } else {
        var classID = req.params.dynamicroute;
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.sohoGetStudentsNameforLessonHistory(classID, function (sohoStudentsNameData) {
                dbjsMethods.sohoGetStudentsDataforLessonHistory(classID, function (sohoStudentsData) {
                    // render view
                    res.render('pages/teachingPortal/sohoLessonHistory', {
                        title: 'Teacher Portal | Culturestride',
                        metadescription: 'Teacher Portal for Culturestride Teachers',
                        layout: 'teacherdashlayout', // change to teacherlayout
                        sohoStudentsName: sohoStudentsNameData[0], //name
                        sohoStudents: sohoStudentsData, // students of that teache
                        sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                        sohoLastName: req.session.sohoUserLastName, // lastname
                        sohoPermission: req.session.sohoUserPermission, // permission
                        sohoSlug: req.session.sohoUserSlug, // permission
                        sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                        sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                        sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                    });
                });
            });
        });
    }
});
router.get('/sohoaddpurchasedhours', function (req, res) {

    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session        
        res.redirect('/soho');
    } else {
        dbjsMethods.sohoGetClassDataforPurchasedHours(function (classData) {
            customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
                // render view
                res.render('pages/teachingPortal/sohoAddPurchasedHours', {
                    title: 'Teacher Portal | Culturestride',
                    metadescription: 'Teacher Portal for Culturestride Teachers',
                    layout: 'teacherdashlayout', // change to teacherlayout
                    classList: classData,
                    sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                    sohoLastName: req.session.sohoUserLastName, // lastname
                    sohoPermission: req.session.sohoUserPermission, // permission
                    sohoSlug: req.session.sohoUserSlug, // permission
                    sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                    sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                    sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                });
            });
        });
    }
});
router.get('/sohoforgotpassword', function (req, res) {
    res.render('pages/teachingPortal/sohoForgotPassword', {
        title: 'Teacher Portal | Culturestride',
        metadescription: 'Teacher Portal for Culturestride Teachers',
        layout: 'teacherlayout', // change to teacherlayout
        error: 0,
        expire: 0
    });
});
router.get('/sohoforgotpasswordthankyou', function (req, res) {
    res.render('pages/teachingPortal/sohoForgotPasswordThankYou', {
        title: 'Teacher Portal | Culturestride',
        metadescription: 'Teacher Portal for Culturestride Teachers'
    });
});
router.get('/sohoreset/:dynamicroute', function (req, res) {
    // define dynamic vars
    var tokenURL = req.params.dynamicroute;
    res.render('pages/teachingPortal/sohoResetPassword', {
        title: 'Teacher Portal | Culturestride',
        metadescription: 'Teacher Portal for Culturestride Teachers',
        layout: 'teacherlayout', // change to teacherlayout
        token: tokenURL,
        error: 0
    });
});
router.get('/sohoresetpasswordthankyou', function (req, res) {
    res.render('pages/teachingPortal/sohoResetPasswordThankYou', {
        title: 'Teacher Portal | Culturestride',
        metadescription: 'Teacher Portal for Culturestride Teachers'
    });
});
router.get('/sohoapprove', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session        
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.sohoGetUnapprovedTransactions(function (transactionData) {
                dbjsMethods.sohoGetClassDataforPurchasedHours(function (classData) {
                    var classesObject = [];
                    var k = 0;
                    for (var i = 0; i < classData.length; i++) {
                        for (var j = 0; j < transactionData.length; j++) {
                            if (transactionData[j].sohoSID == classData[i].sohoSID) {
                                classesObject[k] = classData[i];
                                k++;
                            }
                        }
                    }
                    // render view
                    res.render('pages/teachingPortal/sohoApprovePayment', {
                        title: 'Teacher Portal | Culturestride',
                        metadescription: 'Teacher Portal for Culturestride Teachers',
                        layout: 'teacherdashlayout', // change to teacherlayout
                        transaction: transactionData,
                        classList: classesObject,
                        sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                        sohoLastName: req.session.sohoUserLastName, // lastname
                        sohoPermission: req.session.sohoUserPermission, // permission
                        sohoSlug: req.session.sohoUserSlug, // permission
                        sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                        sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                        sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                    });
                });
            });
        });
    }
});
router.get('/sohosalaryall', function (req, res) { // hashmaps is a better way doing this
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session        
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {


            dbjsMethods.sohoGetSohoUsers(function (userData) {
                var salaryArr = [];
                for (let i = 0; i < userData.length; i++) { // teacher arr
                    var e = userData[i];
                    var teacherObj = {
                        sohoUID: e.sohoUID,
                        name: e.firstName + ' ' + e.lastName,
                        rate: e.rate,
                        theoryPay: 0,
                        pracPay: 0,
                        lesson: []
                    }
                    salaryArr.push(teacherObj);
                }


                if (req.query.startDate) { // if there's a param then we need to do a different lesson log db call - selecting start date range
                    var startDate = req.query.startDate;
                    var endDate = req.query.endDate;

                    dbjsMethods.getPastClassesSalaryAllRange(startDate, endDate, function (lessonLogData) {


                        for (let i = 0; i < lessonLogData.length; i++) {
                            var sohoUID = lessonLogData[i].sohoUID;
                            var lesson = lessonLogData[i];
                            if (lesson.lessonType == 'theory') {

                                // push to teacher
                                for (let j = 0; j < salaryArr.length; j++) {
                                    var e = salaryArr[j];
                                    if (sohoUID == e.sohoUID) {
                                        var lessonPay = parseFloat(lesson.hours) * e.rate;

                                        e.theoryPay += lessonPay;
                                        e.lesson.push(lesson);
                                        break;
                                    }
                                }
                            } else if (lesson.lessonType == 'practical') {
                                if (lesson.sCount == 1) { // half pay - half an hour
                                    var hours = 0.5;
                                } else if (lesson.sCount >= 2) {
                                    var hours = 0.75;
                                } else if (lesson.sCount >= 3) {
                                    var hours = 1;
                                }
                                // push to teacher
                                for (let j = 0; j < salaryArr.length; j++) {
                                    var e = salaryArr[j];
                                    if (sohoUID == e.sohoUID) {
                                        var lessonPay = hours * e.rate;

                                        e.pracPay += lessonPay;
                                        e.lesson.push(lesson);
                                        break;
                                    }
                                }
                            }



                        }


                        // render view
                        res.render('pages/teachingPortal/sohoSalaryAll', {
                            title: 'Teacher Portal | Culturestride',
                            metadescription: 'Teacher Portal for Culturestride Teachers',
                            layout: 'teacherdashlayout', // change to teacherlayout
                            teachers: userData, // teachers
                            sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                            sohoLastName: req.session.sohoUserLastName, // lastname
                            sohoPermission: req.session.sohoUserPermission, // permission
                            sohoSlug: req.session.sohoUserSlug, // permission
                            sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                            sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                            sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                            moment: moment, //moment
                            salary: salaryArr, // salary
                        });

                    });


                } else { // if there's no params
                    dbjsMethods.getPastClassesSalaryAll(function (lessonLogData) {


                        for (let i = 0; i < lessonLogData.length; i++) {
                            var sohoUID = lessonLogData[i].sohoUID;
                            var lesson = lessonLogData[i];
                            if (lesson.lessonType == 'theory') {

                                // push to teacher
                                for (let j = 0; j < salaryArr.length; j++) {
                                    var e = salaryArr[j];
                                    if (sohoUID == e.sohoUID) {
                                        var lessonPay = parseFloat(lesson.hours) * e.rate;

                                        e.theoryPay += lessonPay;
                                        e.lesson.push(lesson);
                                        break;
                                    }
                                }
                            } else if (lesson.lessonType == 'practical') {
                                if (lesson.sCount == 1) { // half pay - half an hour
                                    var hours = 0.5;
                                } else if (lesson.sCount >= 2) {
                                    var hours = 0.75;
                                } else if (lesson.sCount >= 3) {
                                    var hours = 1;
                                }

                                for (let j = 0; j < salaryArr.length; j++) {
                                    var e = salaryArr[j];
                                    if (sohoUID == e.sohoUID) {
                                        var lessonPay = hours * e.rate;

                                        e.pracPay += lessonPay;
                                        e.lesson.push(lesson);
                                        break;
                                    }
                                }
                            }



                        }


                        // render view
                        res.render('pages/teachingPortal/sohoSalaryAll', {
                            title: 'Teacher Portal | Culturestride',
                            metadescription: 'Teacher Portal for Culturestride Teachers',
                            layout: 'teacherdashlayout', // change to teacherlayout
                            teachers: userData, // teachers
                            sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                            sohoLastName: req.session.sohoUserLastName, // lastname
                            sohoPermission: req.session.sohoUserPermission, // permission
                            sohoSlug: req.session.sohoUserSlug, // permission
                            sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                            sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                            sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                            moment: moment, //moment
                            salary: salaryArr, // salary
                        });

                    });
                }
            });

        });
    }
});
router.get('/sohosalary', function (req, res) { // hashmaps is a better way doing this
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session        
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {

            var sohoUID = req.session.sohoUserLoggedIn;

            dbjsMethods.sohoGetUserData(req.session.sohoUserLoggedIn, function (userData) {
                if (req.query.startDate) { // if there's a param then we need to do a different lesson log db call - selecting start date range
                    var startDate = req.query.startDate;
                    var endDate = req.query.endDate;

                    dbjsMethods.getPastClassesSalaryRange(sohoUID, startDate, endDate, function (lessonLogData) {
                        var rate = parseFloat(userData[0].rate);
                        var theoryPay = 0;
                        var pracPay = 0;

                        for (let i = 0; i < lessonLogData.length; i++) {
                            var lesson = lessonLogData[i];
                            if (lesson.lessonType == 'theory') {
                                var lessonPay = parseFloat(lesson.hours) * rate;
                                theoryPay += lessonPay;
                            } else if (lesson.lessonType == 'practical') {
                                if (lesson.sCount == 1) { // half pay - half an hour
                                    var lessonPay = 0.5 * rate;
                                } else if (lesson.sCount >= 2) {
                                    var lessonPay = 0.75 * rate; // half an hour
                                } else if (lesson.sCount >= 3) {
                                    var lessonPay = 1 * rate; // half an hour
                                }
                                pracPay += lessonPay;

                            }

                        }

                        // render view
                        res.render('pages/teachingPortal/sohoSalary', {
                            title: 'Teacher Portal | Culturestride',
                            metadescription: 'Teacher Portal for Culturestride Teachers',
                            layout: 'teacherdashlayout', // change to teacherlayout
                            rate: rate,
                            theoryPay: theoryPay,
                            pracPay: pracPay,
                            lesson: lessonLogData,
                            sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                            sohoLastName: req.session.sohoUserLastName, // lastname
                            sohoPermission: req.session.sohoUserPermission, // permission
                            sohoSlug: req.session.sohoUserSlug, // permission
                            sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                            sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                            sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                            moment: moment, //moment
                        });

                    });


                } else { // if there's no params
                    dbjsMethods.getPastClassesSalary(sohoUID, function (lessonLogData) {
                        var rate = parseFloat(userData[0].rate);
                        var theoryPay = 0;
                        var pracPay = 0;

                        for (let i = 0; i < lessonLogData.length; i++) {
                            var lesson = lessonLogData[i];
                            if (lesson.lessonType == 'theory') {
                                var lessonPay = parseFloat(lesson.hours) * rate;
                                theoryPay += lessonPay;
                            } else if (lesson.lessonType == 'practical') {
                                if (lesson.sCount == 1) { // half pay - half an hour
                                    var lessonPay = 0.5 * rate;
                                } else if (lesson.sCount >= 2) {
                                    var lessonPay = 0.75 * rate; // half an hour
                                } else if (lesson.sCount >= 3) {
                                    var lessonPay = 1 * rate; // half an hour
                                }
                                pracPay += lessonPay;

                            }


                        }


                        // render view
                        res.render('pages/teachingPortal/sohoSalary', {
                            title: 'Teacher Portal | Culturestride',
                            metadescription: 'Teacher Portal for Culturestride Teachers',
                            layout: 'teacherdashlayout', // change to teacherlayout
                            rate: rate,
                            theoryPay: theoryPay,
                            pracPay: pracPay,
                            lesson: lessonLogData,
                            sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                            sohoLastName: req.session.sohoUserLastName, // lastname
                            sohoPermission: req.session.sohoUserPermission, // permission
                            sohoSlug: req.session.sohoUserSlug, // permission
                            sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                            sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                            sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                            moment: moment, //moment
                        });

                    });
                }
            });

        });
    }
});
// router.get('/sohostartclass', function (req, res) {
//     if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
//         req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session        
//         res.redirect('/soho');
//     } else {
//         customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
//             dbjsMethods.sohoGetStudentforStartClass(req.session.sohoUserLoggedIn, req.session.sohoUserPermission, function (studentData) {
//                 dbjsMethods.sohoGetAllActiveStudentforStartClass(function (allStudentData) {
//                     dbjsMethods.getSyllabusforStartClass(function (syllabusData) {
//                         dbjsMethods.getUnreadHWForSoho(req.session.sohoUserPermission, req.session.sohoUserLoggedIn, function (unreadHWCountData) { // get count of all the unread messages across all the rooms that the teacher is a part of
//                             req.session.sohoUserUnreadHWCount = unreadHWCountData[0].unreadHWCount;
//                             // render view
//                             res.render('pages/teachingPortal/sohoStartClass', {
//                                 title: 'Teacher Portal | Culturestride',
//                                 metadescription: 'Teacher Portal for Culturestride Teachers',
//                                 layout: 'teacherdashlayout', // change to teacherlayout
//                                 sohoLoggedIn: req.session.sohoUserLoggedIn, // teacher dat
//                                 sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
//                                 sohoLastName: req.session.sohoUserLastName, // lastname
//                                 sohoPermission: req.session.sohoUserPermission, // permission
//                                 sohoSlug: req.session.sohoUserSlug,
//                                 sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
//                                 sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
//                                 sohoProfileImage: req.session.sohoUserProfileImage, // profile image
//                                 error: req.query.error, // selected date error
//                                 syllabus: syllabusData, // syllabus
//                                 student: studentData, // student classes
//                                 allStudent: allStudentData, // student classes
//                                 moment: moment, // moment
//                             });
//                         });
//                     });
//                 });
//             });
//         });
//     }
// });
router.get('/sohoclassnotes', function (req, res) {
    var preloadClassID = req.query.class;

    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
            req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
            res.redirect('/soho');
        } else {
            // get classes
            dbjsMethods.sohoGetClassesForSohoClassNotes(req.session.sohoUserLoggedIn, function (classesData) {
                dbjsMethods.sohoGetAllStudentforGroupNotes(function (allStudentData) {
                    dbjsMethods.getGroupsForClassNotes(req.session.sohoUserLoggedIn, function (groupsData) {
                        dbjsMethods.getSavedGroupNotes(req.session.sohoUserLoggedIn, function (notesData) {
                            dbjsMethods.getUnreadHWForSoho(req.session.sohoUserPermission, req.session.sohoUserLoggedIn, function (unreadHWCountData) { // get count of all the unread messages across all the rooms that the teacher is a part of
                                req.session.sohoUserUnreadHWCount = unreadHWCountData[0].unreadHWCount;
                                // render view
                                res.render('pages/teachingPortal/sohoClassNotesV2', {
                                    title: 'Teacher Portal | Culturestride',
                                    metadescription: 'Teacher Portal for Culturestride Teachers',
                                    layout: 'teacherdashlayout', // change to teacherlayout
                                    sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                                    sohoLastName: req.session.sohoUserLastName, // lastname
                                    sohoPermission: req.session.sohoUserPermission, // permission
                                    sohoSlug: req.session.sohoUserSlug, // permission
                                    sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                                    sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                                    sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                                    sohoCharType: req.session.sohoCharType, // char type
                                    classes: classesData, // class data
                                    notes: notesData[0], // notes data
                                    preloadClassID: preloadClassID, // preloaded class id
                                    sohoUID: req.session.sohoUserLoggedIn, //sohoUID
                                    allStudent: allStudentData, // syllabus data
                                    groups: groupsData, // group data
                                });
                            });
                        });
                    });
                });
            });
        }
    });
});
router.get('/sohoclassnotes/syllabus', function (req, res) {
    var preloadClassID = req.query.class;

    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
            req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
            res.redirect('/soho');
        } else {
            // get classes
            dbjsMethods.sohoGetClassesForSohoClassNotes(req.session.sohoUserLoggedIn, function (classesData) {
                dbjsMethods.sohoGetAllStudentforGroupNotes(function (allStudentData) {
                    dbjsMethods.getGroupsForClassNotes(req.session.sohoUserLoggedIn, function (groupsData) {
                        dbjsMethods.getSavedGroupNotes(req.session.sohoUserLoggedIn, function (notesData) {
                            dbjsMethods.getSyllabus(function (syllabusData) {
                                dbjsMethods.getUnreadHWForSoho(req.session.sohoUserPermission, req.session.sohoUserLoggedIn, function (unreadHWCountData) { // get count of all the unread messages across all the rooms that the teacher is a part of
                                    req.session.sohoUserUnreadHWCount = unreadHWCountData[0].unreadHWCount;
                                    // render view
                                    res.render('pages/teachingPortal/sohoClassNotesV2Syllabus', {
                                        title: 'Teacher Portal | Culturestride',
                                        metadescription: 'Teacher Portal for Culturestride Teachers',
                                        layout: 'teacherdashlayout', // change to teacherlayout
                                        sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                                        sohoLastName: req.session.sohoUserLastName, // lastname
                                        sohoPermission: req.session.sohoUserPermission, // permission
                                        sohoSlug: req.session.sohoUserSlug, // permission
                                        sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                                        sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                                        sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                                        classes: classesData, // class data
                                        syllabus: syllabusData, // syllabus data
                                        allStudent: allStudentData, // syllabus data
                                        notes: notesData[0], // notes data
                                        preloadClassID: preloadClassID, // preloaded class id
                                        sohoUID: req.session.sohoUserLoggedIn, //sohoUID
                                        groups: groupsData, // group data
                                    });
                                });
                            });
                        });
                    });
                });
            });
        }
    });
});
router.get('/sohosettings', function (req, res) {

    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
            req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
            res.redirect('/soho');
        } else {
            // get classes
            dbjsMethods.getSettingsDataTea(req.session.sohoUserLoggedIn, function (settingsData) { // get count of all the unread messages across all the rooms that the teacher is a part of
                // render view
                res.render('pages/teachingPortal/sohoSettings', {
                    title: 'Teacher Portal | Culturestride',
                    metadescription: 'Teacher Portal for Culturestride Teachers',
                    layout: 'teacherdashlayout', // change to teacherlayout
                    sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                    sohoLastName: req.session.sohoUserLastName, // lastname
                    sohoPermission: req.session.sohoUserPermission, // permission
                    sohoSlug: req.session.sohoUserSlug, // permission
                    sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                    sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                    sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                    sohoUID: req.session.sohoUserLoggedIn, //sohoUID
                    settings: settingsData[0], // settings
                });
            });
        }
    });
});
router.get('/sohogroupclass/create', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.getTeachersGroupClassCreate(function (teacherData) {
                // render view
                res.render('pages/teachingPortal/sohoGroupClassCreate', {
                    title: 'Teacher Portal | Culturestride',
                    metadescription: 'Teacher Portal for Culturestride Teachers',
                    layout: 'teacherdashlayout', // change to teacherlayout
                    sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                    sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                    sohoLastName: req.session.sohoUserLastName, // lastname
                    sohoPermission: req.session.sohoUserPermission, // permission
                    sohoSlug: req.session.sohoUserSlug, // permission
                    sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                    sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                    sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                    teacher: teacherData, // teacher data
                });
            });
        });
    }
});
router.get('/sohocalendar/freetimes', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.getFreeRuleTeacher(req.session.sohoUserLoggedIn, function (teacherData) {
                if (teacherData[0].freeRule) {
                    var freeRule = JSON.parse(teacherData[0].freeRule);
                } else {
                    var freeRule = [];
                    for (let m = 0; m < 7; m++) { // can't push into empty array indexes later
                        var emptyArr = [];
                        freeRule.push(emptyArr);
                    }
                }
                var timezone = teacherData[0].timezone;

                // render view
                res.render('pages/teachingPortal/sohocalendarfreetimes', {
                    title: 'Teacher Portal | Culturestride',
                    metadescription: 'Teacher Portal for Culturestride Teachers',
                    layout: 'teacherdashlayout', // change to teacherlayout
                    sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                    sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                    sohoLastName: req.session.sohoUserLastName, // lastname
                    sohoPermission: req.session.sohoUserPermission, // permission
                    sohoSlug: req.session.sohoUserSlug, // permission
                    sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                    sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                    sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                    rule: freeRule, // rule
                    timezone: timezone, // timezone
                    sohoUID: req.session.sohoUserLoggedIn, // sohoUID
                });
            });
        });
    }
});
router.get('/sohoteachercalendar', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.getAllTeachersForCalendar(function (teacherData) {
                // render view
                res.render('pages/teachingPortal/sohoTeacherCalendar', {
                    title: 'Teacher Portal | Culturestride',
                    metadescription: 'Teacher Portal for Culturestride Teachers',
                    layout: 'teacherdashlayout', // change to teacherlayout
                    sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                    sohoLastName: req.session.sohoUserLastName, // lastname
                    sohoPermission: req.session.sohoUserPermission, // permission
                    sohoSlug: req.session.sohoUserSlug, // permission
                    sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                    sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                    sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                    teacher: teacherData, // teacher data
                });
            });
        });
    }
});
router.get('/sohocalendar', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.getUserDataForCalendar(req.session.sohoUserLoggedIn, function (userData) {
                res.render('pages/teachingPortal/sohoCalendar', {
                    title: 'Teacher Portal | Culturestride',
                    metadescription: 'Teacher Portal for Culturestride Teachers',
                    layout: 'teacherdashlayout', // change to teacherlayout
                    sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                    sohoLastName: req.session.sohoUserLastName, // lastname
                    sohoPermission: req.session.sohoUserPermission, // permission
                    sohoSlug: req.session.sohoUserSlug, // permission
                    sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                    sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                    sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                    teacher: userData[0], // teacher data
                });
            });
        });
    }
});
router.get('/sohoGetCalendarEvents', function (req, res) {
    var region = req.query.region;

    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        // get the existing events for that user
        dbjsMethods.sohoGetCalendarForSohoCalendar(req.session.sohoUserLoggedIn, function (calendarData) {
            var events = [];

            for (var i = 0; i < calendarData.length; i++) {
                var eventStartMom = moment.tz(calendarData[i].start, region); // offset to create the right time on cal
                var eventEndMom = moment.tz(calendarData[i].end, region)

                // different color for empty event
                if (calendarData[i].stuCount == 0) {
                    var backgroundColor = '#ecf0f1';
                    var textColor = '#000000';
                } else {
                    var backgroundColor = '#4950F6';
                    var textColor = '#ffffff';
                }

                var studentJSON = JSON.parse(calendarData[i].studentJSON);
                var eventsObject = {
                    "id": calendarData[i].sohoAID, // "id": "1"
                    "start": eventStartMom.clone().format(), // "startTime": "2020-08-29T09:00:00+10:00",
                    "end": eventEndMom.clone().format(), //"endTime": "2020-08-29T09:00:00+10:00",
                    "title": calendarData[i].title, //"title": "CLASSNAME2"
                    "groupSlug": calendarData[i].groupSlug, // group slug ties all recurring events together
                    "gcEventID": calendarData[i].gcEventID, // google calendar event id
                    "backgroundColor": backgroundColor, // background color
                    "textColor": textColor, // background color
                    "studentJSON": studentJSON, // students in the event
                    "pracId": calendarData[i].sohoGID, // sohogid
                }
                // load into events
                events.push(eventsObject);
            }
            // console.log('events: ' + JSON.stringify(events));
            res.json(events);
        });
    });
});
router.get('/sohoGetTeacherCalendarEvents', function (req, res) {
    var region = req.query.region;
    var sohoUID = req.query.teacherID;
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {

        // get the existing events for that user
        dbjsMethods.sohoGetCalendarForSohoCalendar(sohoUID, function (calendarData) {
            var events = [];

            for (var i = 0; i < calendarData.length; i++) {
                var eventStartMom = moment.tz(calendarData[i].start, region); // offset to create the right time on cal
                var eventEndMom = moment.tz(calendarData[i].end, region)

                var eventsObject = {
                    "id": calendarData[i].sohoAID, // "id": "1"
                    "start": eventStartMom.clone().format(), // "startTime": "2020-08-29T09:00:00+10:00",
                    "end": eventEndMom.clone().format(), //"endTime": "2020-08-29T09:00:00+10:00",
                    "title": calendarData[i].title, //"title": "CLASSNAME2"
                    "groupSlug": calendarData[i].groupSlug, // group slug ties all recurring events together
                }
                // load into events
                events.push(eventsObject);
            }
            // console.log('events: ' + JSON.stringify(events));
            res.json(events);
        });
    });
});
router.get('/getCalendarEvents', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var region = req.query.region;
        var sohoUID = req.query.teacher;

        // get the existing events for that user
        dbjsMethods.getCalendarForSchedule(sohoUID, function (calendarData) {
            var events = [];

            for (var i = 0; i < calendarData.length; i++) {
                var eventStartMom = moment.tz(calendarData[i].start, region); // offset to create the right time on cal
                var eventEndMom = moment.tz(calendarData[i].end, region)

                var eventsObject = {
                    "id": calendarData[i].sohoAID, // "id": "1"
                    "start": eventStartMom.clone().format(), // "startTime": "2020-08-29T09:00:00+10:00",
                    "end": eventEndMom.clone().format(), //"endTime": "2020-08-29T09:00:00+10:00",
                    "display": "background", // background event
                    "groupSlug": calendarData[i].groupSlug, // group slug ties all recurring events together
                }
                // load into events
                events.push(eventsObject);
            }
            // console.log('events: ' + JSON.stringify(events));
            res.json(events);
        });
    });
});
router.get('/getCalendarEventsV2', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var sohoUID = req.query.teacher;
        var startWeek = moment(req.query.start).utc(); // start of the week according to the timezone - Monday morn
        var endWeek = moment(req.query.end).utc(); // end of week according to timezone - Sunday night
        dbjsMethods.getFreeRule(sohoUID, function (ruleData) {
            if (ruleData.length > 0) {
                var weekRule = JSON.parse(ruleData[0].freeRule);
            } else {
                var weekRule = null;
            }

            if (weekRule) {
                // convert freerule into utc version from local
                var timezone = ruleData[0].timezone;

                // convert the sydney rule values into moment --> utc time --> recreate rule in utc time
                var utcWeekRule = []; // 7 days
                for (let m = 0; m < 7; m++) { // can't push into empty array indexes later
                    var emptyArr = [];
                    utcWeekRule.push(emptyArr);
                }

                for (let i = 0; i < weekRule.length; i++) {
                    var dayInterval = weekRule[i];
                    for (let j = 0; j < dayInterval.length; j++) {

                        var day = i + 1;
                        var startMom = moment().tz(timezone).day(day).hour(dayInterval[j].startHour).minute(dayInterval[j].startMin).second(0).utc();
                        var endMom = moment().tz(timezone).day(day).hour(dayInterval[j].endHour).minute(dayInterval[j].endMin).second(0).utc();

                        // utcweekrule values
                        var utcStartDay = startMom.isoWeekday();
                        var utcStartHour = startMom.hour();
                        var utcStartMin = startMom.minute();

                        var utcEndDay = endMom.isoWeekday();
                        var utcEndHour = endMom.hour();
                        var utcEndMin = endMom.minute();

                        if (utcStartDay == utcEndDay) {
                            var intervalObj = {
                                startHour: utcStartHour,
                                startMin: utcStartMin,
                                endHour: utcEndHour,
                                endMin: utcEndMin,
                            }

                            utcWeekRule[utcStartDay - 1].push(intervalObj); // push into the isoweekday array for utcweekrule
                        } else { // the interval crosses iso midnight
                            // start --> midnight
                            var intervalObj = {
                                startHour: utcStartHour,
                                startMin: utcStartMin,
                                endHour: 24, // midnight ?
                                endMin: 0,
                            }

                            utcWeekRule[utcStartDay - 1].push(intervalObj);
                            // midnight --> end

                            var intervalObj = {
                                startHour: 0,
                                startMin: 0,
                                endHour: utcEndHour,
                                endMin: utcEndMin,
                            }

                            utcWeekRule[utcEndDay - 1].push(intervalObj); // push into the isoweekday array for utcweekrule

                        }

                    }
                }


                dbjsMethods.getTeacherEventsCalendarEvents(sohoUID, startWeek.clone().format(), endWeek.clone().format(), function (calData) {

                    var eventsArr = [];

                    // for each isoweekday in the date range
                    var tempMom = startWeek.clone();
    
                    for (let i = 0; i < 8; i++) { // there's always 8 days touched by the iso time unless we're actually on the UTC time week (very unlikely, 7)
                        // create interval for the first day using the relevant interval
                        var startMomIsoWeekday = tempMom.isoWeekday() - 1;
                        var dayInQuestion = utcWeekRule[startMomIsoWeekday];

                        // get the relevant interval - 0 = sunday, 6 = saturday

                        for (let j = 0; j < dayInQuestion.length; j++) { // for each interval

                            var startHour = dayInQuestion[j].startHour;
                            var endHour = dayInQuestion[j].endHour;
                            var startMin = dayInQuestion[j].startMin;
                            var endMin = dayInQuestion[j].endMin;

                            var startMom = tempMom.clone().hour(startHour).minute(startMin).second(0);
                            var endMom = tempMom.clone().hour(endHour).minute(endMin).second(0);


                            for (var m = moment(startMom); m.isBefore(endMom); m.add(30, 'minutes')) { // interate through interval in 30 min intervals
                                var intervalStart = m;
                                var intervalEnd = m.clone().add(30, 'minutes');
                                var intervalRange = moment.range(intervalStart, intervalEnd);
                                // check if there are any overlapping events from the teachers calendar
                                var calEventOverlap = 0;
                                for (let k = 0; k < calData.length; k++) {
                                    var calEventStart = moment(calData[k].start).utc();
                                    var calEventEnd = moment(calData[k].end).utc();
                                    var calEventRange = moment.range(calEventStart, calEventEnd);
                                    // if calEvent overlaps with this 30 minute increment then don't create events object
                                    if (calEventRange.overlaps(intervalRange) == true) {
                                        calEventOverlap = 1;
                                        break;
                                    }
                                }
                                if (calEventOverlap == 0) { // only add free event if there isn't any overlapping events
                                    var eventsObject = {
                                        "start": intervalStart.clone().format(), // "startTime": "2020-08-29T09:00:00Z",
                                        "end": intervalEnd.clone().format(), //"endTime": "2020-08-29T09:00:00Z",
                                        "display": "background", // background event
                                    }
                                    eventsArr.push(eventsObject)
                                }
                            }
                        }
                        tempMom.add(1, 'days');
                    }

                    res.json(eventsArr);

                });
            } else {
                res.json();
            }
        });
    });
});

router.get('/getCalendarEventsForTeacher', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var region = req.query.region;
        var sohoUID = req.query.id;

        // get the existing events for that user
        dbjsMethods.getCalendarForSchedule(sohoUID, function (calendarData) {
            var events = [];

            for (var i = 0; i < calendarData.length; i++) {
                var eventStartMom = moment.tz(calendarData[i].start, region); // offset to create the right time on cal
                var eventEndMom = moment.tz(calendarData[i].end, region)

                var eventsObject = {
                    "id": calendarData[i].sohoAID, // "id": "1"
                    "start": eventStartMom.clone().format(), // "startTime": "2020-08-29T09:00:00+10:00",
                    "end": eventEndMom.clone().format(), //"endTime": "2020-08-29T09:00:00+10:00",
                    "display": "background", // background event
                    "groupSlug": calendarData[i].groupSlug, // group slug ties all recurring events together
                }
                // load into events
                events.push(eventsObject);
            }
            // console.log('events: ' + JSON.stringify(events));
            res.json(events);
        });
    });
});
router.get('/getCalendarEventsForStart', function (req, res) {

    var region = req.query.region;
    var dialect = req.query.dialect;
    var momStart = moment().add(3, 'days').utc();
    var momIn2Weeks = momStart.clone().add(2, 'weeks');
    // get the existing events for that user
    dbjsMethods.getCalendarForStart(momStart.clone().toISOString(), momIn2Weeks.clone().toISOString(), function (calendarData) { // get upcoming events for the next 2 weeks
        var events = [];
        var previousDate;
        var eventCounter = -1;

        for (var i = 0; i < calendarData.length; i++) {
            var eventStartMom = moment(calendarData[i].start, "YYYY-MM-DDThh:mm:ssZ");
            var eventStartDate = eventStartMom.format("YYYY-MM-DD");
            if (eventStartDate != previousDate) { // if the dates are equal then don't add to the array - to prevent duplicate time slots
                var eventsObject1 = { // build the object
                    "id": i, // "id": "1"
                    "start": eventStartMom,
                    "allDay": true,
                    "display": "background",
                    "backgroundColor": "",
                }
                events.push(eventsObject1);
                eventCounter++; // increment event counter
                // update previousDate
                previousDate = eventStartDate;
            }

            // check if lang has the chosen dialect, if yes then change the background color of the last object to highlight
            var langArr = calendarData[i].lang.split(',');
            if (langArr.indexOf(dialect) > -1) { // dialect exists within langArr
                events[eventCounter].backgroundColor = "#4950F6"; // then change the background color of the last object
            }

            // console.log('events: ' + JSON.stringify(events));
        }
        res.json(events);
    });
});
router.get('/getEventCount', function (req, res) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        dbjsMethods.sohoCalendarGetEventCount(req.session.sohoUserLoggedIn, req.query.groupSlug, function (data) {
            res.json(data[0]);
        })

    });
});
router.get('/soho/tbaudio', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            // render view
            res.render('pages/teachingPortal/sohotbaudio', {
                title: 'Teacher Portal | Culturestride',
                metadescription: 'Teacher Portal for Culturestride Teachers',
                layout: 'teacherdashlayout', // logged in template
                sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                sohoLastName: req.session.sohoUserLastName, // lastname
                sohoPermission: req.session.sohoUserPermission, // permission
                sohoSlug: req.session.sohoUserSlug, // permission
                sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                sohoProfileImage: req.session.sohoUserProfileImage, // profile image
            });
        });
    }
});
router.get('/soho/tbaudio/listeninghsk1', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            // render view
            res.render('pages/teachingPortal/sohotbaudiohsk1', {
                title: 'Teacher Portal | Culturestride',
                metadescription: 'Teacher Portal for Culturestride Teachers',
                layout: 'teacherdashlayout', // logged in template
                sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                sohoLastName: req.session.sohoUserLastName, // lastname
                sohoPermission: req.session.sohoUserPermission, // permission
                sohoSlug: req.session.sohoUserSlug, // permission
                sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                sohoProfileImage: req.session.sohoUserProfileImage, // profile image
            });
        });
    }
});
router.get('/soho/tbaudio/listeninghsk2', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            // render view
            res.render('pages/teachingPortal/sohotbaudiohsk2', {
                title: 'Teacher Portal | Culturestride',
                metadescription: 'Teacher Portal for Culturestride Teachers',
                layout: 'teacherdashlayout', // logged in template
                sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                sohoLastName: req.session.sohoUserLastName, // lastname
                sohoPermission: req.session.sohoUserPermission, // permission
                sohoSlug: req.session.sohoUserSlug, // permission
                sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                sohoProfileImage: req.session.sohoUserProfileImage, // profile image
            });
        });
    }
});
router.get('/soho/tbaudio/listeninghsk3', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            // render view
            res.render('pages/teachingPortal/sohotbaudiohsk3', {
                title: 'Teacher Portal | Culturestride',
                metadescription: 'Teacher Portal for Culturestride Teachers',
                layout: 'teacherdashlayout', // logged in template
                sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                sohoLastName: req.session.sohoUserLastName, // lastname
                sohoPermission: req.session.sohoUserPermission, // permission
                sohoSlug: req.session.sohoUserSlug, // permission
                sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                sohoProfileImage: req.session.sohoUserProfileImage, // profile image
            });
        });
    }
});
router.get('/soho/tbaudio/listeninghsk4A', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            // render view
            res.render('pages/teachingPortal/sohotbaudiohsk4A', {
                title: 'Teacher Portal | Culturestride',
                metadescription: 'Teacher Portal for Culturestride Teachers',
                layout: 'teacherdashlayout', // logged in template
                sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                sohoLastName: req.session.sohoUserLastName, // lastname
                sohoPermission: req.session.sohoUserPermission, // permission
                sohoSlug: req.session.sohoUserSlug, // permission
                sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                sohoProfileImage: req.session.sohoUserProfileImage, // profile image
            });
        });
    }
});
router.get('/soho/tbaudio/listeninghsk4B', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            // render view
            res.render('pages/teachingPortal/sohotbaudiohsk4B', {
                title: 'Teacher Portal | Culturestride',
                metadescription: 'Teacher Portal for Culturestride Teachers',
                layout: 'teacherdashlayout', // logged in template
                sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                sohoLastName: req.session.sohoUserLastName, // lastname
                sohoPermission: req.session.sohoUserPermission, // permission
                sohoSlug: req.session.sohoUserSlug, // permission
                sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                sohoProfileImage: req.session.sohoUserProfileImage, // profile image
            });
        });
    }
});
router.get('/soho/tbaudio/listeninghsk5A', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            // render view
            res.render('pages/teachingPortal/sohotbaudiohsk5A', {
                title: 'Teacher Portal | Culturestride',
                metadescription: 'Teacher Portal for Culturestride Teachers',
                layout: 'teacherdashlayout', // logged in template
                sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                sohoLastName: req.session.sohoUserLastName, // lastname
                sohoPermission: req.session.sohoUserPermission, // permission
                sohoSlug: req.session.sohoUserSlug, // permission
                sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                sohoProfileImage: req.session.sohoUserProfileImage, // profile image
            });
        });
    }
});
router.get('/soho/flashcards', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            // render view
            res.render('pages/teachingPortal/sohoflashcards', {
                title: 'Teacher Portal | Culturestride',
                metadescription: 'Teacher Portal for Culturestride Teachers',
                layout: 'teacherdashlayout', // logged in template
                sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                sohoLastName: req.session.sohoUserLastName, // lastname
                sohoPermission: req.session.sohoUserPermission, // permission
                sohoSlug: req.session.sohoUserSlug, // permission
                sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                sohoProfileImage: req.session.sohoUserProfileImage, // profile image
            });
        });
    }
});
router.get('/sohoSchedule', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            // get students
            dbjsMethods.getStudentsForCalendarAdd(req.session.sohoUserLoggedIn, function (studentData) {
                dbjsMethods.getGroupsForCalendarAdd(req.session.sohoUserLoggedIn, function (groupData) {
                    // render view
                    res.render('pages/teachingPortal/sohoScheduleClass', {
                        title: 'Teacher Portal | Culturestride',
                        metadescription: 'Teacher Portal for Culturestride Teachers',
                        layout: 'teacherdashlayout', // change to teacherlayout
                        sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                        sohoLastName: req.session.sohoUserLastName, // lastname
                        sohoPermission: req.session.sohoUserPermission, // permission
                        sohoSlug: req.session.sohoUserSlug, // permission
                        sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                        sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                        sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                        students: studentData, // student data
                        group: groupData, // group data
                    });
                });
            });
        });
    }
});
router.get('/sohomessages', function (req, res) {
    var querySohoCID = req.query.class; // is the user specifying they want to see messages of a specific class

    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {

            dbjsMethods.getRoomListForSohoMessages(req.session.sohoUserSlug, req.session.sohoUserLoggedIn, req.session.sohoUserPermission, function (roomsData) { // get list of students
                // get what rooms user is in
                var roomsArr = [];
                for (let i = 0; i < roomsData.length; i++) {
                    roomsArr.push(roomsData[i].sohoRID);
                }
                if (roomsData.length == 0) {
                    var obj = {};
                    roomsArr.push(obj);
                }
                // get users in those rooms
                dbjsMethods.getUsersInRoomsForMessages(roomsArr, req.session.sohoUserSlug, function (usersData) { // get all users in room - needed for dialogue names
                    // create rooms arr - used for mid bar room population
                    var channelRoomsArr = [];
                    var membersArr = [];
                    var profileImage;
                    for (let i = 0; i < roomsData.length; i++) {
                        for (let j = 0; j < usersData.length; j++) {
                            if (roomsData[i].sohoRID == usersData[j].sohoRID) {
                                // add members to the room in which they are a member of
                                var firstName = usersData[j].sFirstName || usersData[j].tFirstName; // the || grabs the student or teacher value, whichever is not null
                                var lastName = usersData[j].sLastName || usersData[j].tLastName;
                                var name = firstName + ' ' + lastName;
                                membersArr.push(name);
                                profileImage = usersData[j].sProfileImage || usersData[j].tProfileImage || '/img/guru.png';
                            }
                        }

                        // was the last message sent by themselves or someone else
                        if (roomsData[i].sender == req.session.sohoUserSlug) {
                            var sender = 'self';
                        } else {
                            var sender = 'else';
                        }

                        var lastMessageContent = roomsData[i].content;
                        if (lastMessageContent) {
                            var lastMessageContentNoHTML = lastMessageContent.replace(/<[^>]*>/g, '');
                        } else {
                            var lastMessageContentNoHTML = null;
                        }

                        var roomsObj = {
                            sohoRID: roomsData[i].sohoRID,
                            title: roomsData[i].title,
                            roomType: roomsData[i].roomType,
                            lastMessageState: roomsData[i].state,
                            lastMessageSender: sender,
                            lastMessageContent: lastMessageContentNoHTML,
                            lastMessageTS: roomsData[i].lastMessageTS,
                            members: membersArr,
                            profileImage: profileImage
                        } // build rooms object
                        membersArr = []; // clear arr
                        channelRoomsArr.push(roomsObj)

                    }


                    // no first slug - no room chosen
                    var selectedRoomId = null;
                    var selectedClassName = null;

                    // render view
                    res.render('pages/teachingPortal/sohoMessages', {
                        title: 'Teacher Portal | Culturestride',
                        metadescription: 'Teacher Portal for Culturestride Teachers',
                        layout: 'teacherdashlayout', // change to teacherlayout
                        sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                        sohoLastName: req.session.sohoUserLastName, // lastname
                        sohoPermission: req.session.sohoUserPermission, // permission
                        sohoSlug: req.session.sohoUserSlug, // permission
                        sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                        sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                        sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                        channelRooms: channelRoomsArr, // student list
                        moment: moment, // allows us to access moment in EJS
                        selectedRoomId: selectedRoomId,
                        selectedClassName: selectedClassName,
                        sohoUID: req.session.sohoUserLoggedIn, // sohoUID
                    });
                });

            });
        });
    }
});
router.get('/sohohomework', function (req, res) {
    var preloadClassID = req.query.class;
    var lastUpdatedDate = req.query.lastUpdated; // param to display only classes that were updated after this date

    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.sohoGetClassesForSohoHomework(req.session.sohoUserLoggedIn, req.session.sohoUserPermission, function (classesData) { // get list of students
                var sohoCIDArr = []; // get list of classes to be queried

                if (classesData.length > 0) {
                    for (let i = 0; i < classesData.length; i++) {
                        sohoCIDArr.push(classesData[i].sohoCID);
                    }
                } else {
                    var nothing = {};
                    sohoCIDArr.push(nothing);
                }

                dbjsMethods.sohoGetHomeworkToMarkForSohoHomework(sohoCIDArr, req.session.sohoUserPermission, preloadClassID, req.session.sohoUserSlug, function (hwToMarkData) { // get unmarked homework
                    dbjsMethods.getUnreadHWForSoho(req.session.sohoUserPermission, req.session.sohoUserLoggedIn, function (unreadHWCountData) { // get count of all the unread messages across all the rooms that the teacher is a part of
                        req.session.sohoUserUnreadHWCount = unreadHWCountData[0].unreadHWCount;
                        // render view
                        res.render('pages/teachingPortal/sohoHomeworkv2', {
                            title: 'Teacher Portal | Culturestride',
                            metadescription: 'Teacher Portal for Culturestride Teachers',
                            layout: 'teacherdashlayout', // change to teacherlayout
                            sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                            sohoLastName: req.session.sohoUserLastName, // lastname
                            sohoPermission: req.session.sohoUserPermission, // permission
                            sohoSlug: req.session.sohoUserSlug, // permission
                            sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                            sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                            sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                            classes: classesData, // classes list
                            preloadClassID: preloadClassID, // query param class
                            lastUpdatedDate: lastUpdatedDate, // query lastUpdated
                            sohoUID: req.session.sohoUserLoggedIn, // sohoUID
                            hwToMark: hwToMarkData, // hw to mark data
                        });
                    });
                });
            });
        });
    }
});
router.get('/sohohomeworkall', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.sohoGetHomeworkForHomeworkAll(function (hwData) {
                // render view
                res.render('pages/teachingPortal/sohoHomeworkAll', {
                    title: 'Teacher Portal | Culturestride',
                    metadescription: 'Teacher Portal for Culturestride Teachers',
                    layout: 'teacherdashlayout', // change to teacherlayout
                    sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                    sohoLastName: req.session.sohoUserLastName, // lastname
                    sohoPermission: req.session.sohoUserPermission, // permission
                    sohoSlug: req.session.sohoUserSlug, // permission
                    sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                    sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                    sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                    hw: hwData, // hw
                    sohoUID: req.session.sohoUserLoggedIn, // sohoUID
                });
            });
        });
    }
});
router.get('/sohohomeworkcollection', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.sohoGetHomeworkForHomeworkCollection(req.session.sohoUserSlug, function (hwData) {
                dbjsMethods.sohoGetActiveClasses(req.session.sohoUserLoggedIn, req.session.sohoUserPermission, function (classesData) {

                    // render view
                    res.render('pages/teachingPortal/sohoHomeworkCollection', {
                        title: 'Teacher Portal | Culturestride',
                        metadescription: 'Teacher Portal for Culturestride Teachers',
                        layout: 'teacherdashlayout', // change to teacherlayout
                        sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                        sohoLastName: req.session.sohoUserLastName, // lastname
                        sohoPermission: req.session.sohoUserPermission, // permission
                        sohoSlug: req.session.sohoUserSlug, // permission
                        sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                        sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                        sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                        hw: hwData, // hw
                        classes: classesData, // classes
                        sohoUID: req.session.sohoUserLoggedIn, // sohoUID
                    });
                });
            });
        });
    }
});
router.get('/sohohomeworkcreate', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.sohoGetActiveClasses(req.session.sohoUserLoggedIn, req.session.sohoUserPermission, function (classesData) {
                // render view
                res.render('pages/teachingPortal/sohoHomeworkCreate', {
                    title: 'Teacher Portal | Culturestride',
                    metadescription: 'Teacher Portal for Culturestride Teachers',
                    layout: 'teacherdashlayout', // change to teacherlayout
                    sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                    sohoLastName: req.session.sohoUserLastName, // lastname
                    sohoPermission: req.session.sohoUserPermission, // permission
                    sohoSlug: req.session.sohoUserSlug, // permission
                    sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                    sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                    sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                    classes: classesData, // classes data
                    sohoUID: req.session.sohoUserLoggedIn, // sohoUID
                });
            });
        });
    }
});
router.get('/sohohomeworkedit/:dynamicroute', function (req, res) {
    var sohoHID = req.params.dynamicroute; // edit which homework

    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.sohoGetHomeworkForHomeworkCreate(sohoHID, function (hwData) {

                // render view
                res.render('pages/teachingPortal/sohoHomeworkEdit', {
                    referer: req.headers.referer, // used to determined where to redirect to when users finish editting - we wanna push them back to wherever they came from
                    title: 'Teacher Portal | Culturestride',
                    metadescription: 'Teacher Portal for Culturestride Teachers',
                    layout: 'teacherdashlayout', // change to teacherlayout
                    sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                    sohoLastName: req.session.sohoUserLastName, // lastname
                    sohoPermission: req.session.sohoUserPermission, // permission
                    sohoSlug: req.session.sohoUserSlug, // permission
                    sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                    sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                    sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                    hw: hwData[0], // edit hw data
                });
                console.log("file: index.js ~ line 3402 ~ req.headers.referer", req.headers.referer)
            });
        });
    }
});

router.get('/sohoslides', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {

            var previewHskLevel = 5; // creates all the slides
            var previewHskUnit = 36; // creates all the slides
            // get official slides that tea should have access to
            var filesArr = [];

            while (previewHskLevel > 0) {
                while (previewHskUnit > 0) {
                    if (previewHskLevel != 6) { // cos we dont have hsk 6 stuff

                        var filesObj = {
                            title: 'HSK ' + previewHskLevel + ' Unit ' + previewHskUnit + ' Standard',
                            link: 'hsk' + previewHskLevel + 'unit' + previewHskUnit + '.pdf',
                            preview: '0'
                        }
                        filesArr.push(filesObj);
                    }

                    previewHskUnit--;
                }
                previewHskLevel--;
                if (previewHskLevel == 5) {
                    previewHskUnit = 36;
                } else if (previewHskLevel == 3 || previewHskLevel == 4) {
                    previewHskUnit = 20;
                } else {
                    previewHskUnit = 15;
                }
            }

            // render view
            res.render('pages/teachingPortal/sohoSlides', {
                title: 'Teacher Portal | Culturestride',
                metadescription: 'Teacher Portal for Culturestride Teachers',
                layout: 'teacherdashlayout', // change to teacherlayout
                sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                sohoLastName: req.session.sohoUserLastName, // lastname
                sohoPermission: req.session.sohoUserPermission, // permission
                sohoSlug: req.session.sohoUserSlug, // permission
                sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                files: filesArr, // files array
            });
        });
    }
});
router.get('/sohopending', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session        
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.sohoGetFutureClasses(function (futureClassData) {
                dbjsMethods.sohoGetClassesPending(function (pendingClassData) {

                    // render view
                    res.render('pages/teachingPortal/sohoPending', {
                        title: 'Teacher Portal | Culturestride',
                        metadescription: 'Teacher Portal for Culturestride Teachers',
                        layout: 'teacherdashlayout', // change to teacherlayout
                        sohoUID: req.session.sohoUserLoggedIn, //uid
                        sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                        sohoLastName: req.session.sohoUserLastName, // lastname
                        sohoPermission: req.session.sohoUserPermission, // permission
                        sohoSlug: req.session.sohoUserSlug, // permission
                        sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                        sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                        sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                        pending: pendingClassData, // trial class data
                        future: futureClassData, // trial class data
                        moment: moment, //
                    });
                });
            });
        });
    }
});
router.get('/sohochangeteacher', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session        
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.getClassForChangeTeacher(function (classData) {
                dbjsMethods.getUsersForChangeTeacher(function (teacherData) {
                    // render view
                    res.render('pages/teachingPortal/sohoChangeTeacher', {
                        title: 'Teacher Portal | Culturestride',
                        metadescription: 'Teacher Portal for Culturestride Teachers',
                        layout: 'teacherdashlayout', // change to teacherlayout
                        sohoUID: req.session.sohoUserLoggedIn, //uid
                        sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                        sohoLastName: req.session.sohoUserLastName, // lastname
                        sohoPermission: req.session.sohoUserPermission, // permission
                        sohoSlug: req.session.sohoUserSlug, // permission
                        sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                        sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                        sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                        classes: classData, // class data
                        teacher: teacherData, // class data
                    });
                });
            });
        });
    }
});
router.get('/sohodialogues', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {

            dbjsMethods.getStudentSlugDialogues(req.session.sohoUserLoggedIn, function (slugData) {
                var slugArr = [];
                for (let i = 0; i < slugData.length; i++) {
                    slugArr.push(slugData[i].slug);
                }
                if (slugData.length > 0) {
                    slugArr.push('');
                }

                dbjsMethods.getRoomsFromSlugsDialogues(slugArr, function (roomsData) {
                    var roomsArr = [];
                    for (let i = 0; i < roomsData.length; i++) {
                        roomsArr.push(roomsData[i].sohoRID);
                    }
                    if (roomsData.length > 0) {
                        roomsArr.push('');
                    };
                    dbjsMethods.getStudentsFromRoomsDialogues(roomsArr, req.session.sohoUserPermission, function (studentsData) {
                        var stuRoomsArr = [];
                        for (let i = 0; i < studentsData.length; i++) {
                            var membersArr = [];
                            var skip = 0;
                            for (let k = 0; k < stuRoomsArr.length; k++) { // skip this if the sohorid is already in the array - preventing duplicates
                                if (stuRoomsArr[k].sohoRID == studentsData[i].sohoRID) {
                                    skip = 1;
                                    break;
                                }
                            } // if not in existing sturoomsarr

                            if (skip == 0) {
                                for (let j = 0; j < studentsData.length; j++) { // cycle through all array looking for names
                                    if (studentsData[j].sohoRID == studentsData[i].sohoRID) {
                                        var name = studentsData[j].firstName + ' ' + studentsData[j].lastName;
                                        membersArr.push(name);
                                    }
                                }
                                var stuRoomsObj = {
                                    sohoRID: studentsData[i].sohoRID,
                                    members: membersArr,
                                }
                                stuRoomsArr.push(stuRoomsObj);
                            }

                        }

                        res.render('pages/teachingPortal/sohoDialogues', {
                            title: 'Teacher Portal | Culturestride',
                            metadescription: 'Teacher Portal for Culturestride Teachers',
                            layout: 'teacherdashlayout', // change to teacherlayout
                            sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                            sohoLastName: req.session.sohoUserLastName, // lastname
                            sohoPermission: req.session.sohoUserPermission, // permission
                            sohoSlug: req.session.sohoUserSlug, // permission
                            sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                            sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                            sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                            stuRooms: stuRoomsArr, // student list
                            moment: moment, // allows us to access moment in EJS
                            sohoUID: req.session.sohoUserLoggedIn, // sohoUID
                        });
                    })
                })
            })
        })

    }
});

router.get('/sohosyllabus', function (req, res) {
    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        dbjsMethods.getSyllabus(function (syllabusData) {
            customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
                res.render('pages/teachingPortal/sohoSyllabus', {
                    title: 'Teacher Portal | Culturestride',
                    metadescription: 'Teacher Portal for Culturestride Teachers',
                    layout: 'teacherdashlayout', // change to teacherlayout
                    sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                    sohoLastName: req.session.sohoUserLastName, // lastname
                    sohoPermission: req.session.sohoUserPermission, // permission
                    sohoSlug: req.session.sohoUserSlug, // permission
                    sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                    sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                    sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                    syllabus: syllabusData, // syllabus
                });
            });
        });
    }
});
router.get('/sohosyllabusedit', function (req, res) {
    var sohoYID = req.query.id; // edit which homework

    if (!req.session.sohoUserLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
        req.session.sPageToBeAccessed = req.path; // gets the url query past the .com and stores it in session            
        res.redirect('/soho');
    } else {
        customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
            dbjsMethods.getSyllabusDataByID(sohoYID, function (syllabusData) {

                // render view
                res.render('pages/teachingPortal/sohoSyllabusEdit', {
                    referer: req.headers.referer, // used to determined where to redirect to when users finish editting - we wanna push them back to wherever they came from
                    title: 'Teacher Portal | Culturestride',
                    metadescription: 'Teacher Portal for Culturestride Teachers',
                    layout: 'teacherdashlayout', // change to teacherlayout
                    sohoFirstName: req.session.sohoUserFirstName, // firstname of teacher
                    sohoLastName: req.session.sohoUserLastName, // lastname
                    sohoPermission: req.session.sohoUserPermission, // permission
                    sohoSlug: req.session.sohoUserSlug, // permission
                    sohoUnreadMsgCount: req.session.sohoUserUnreadMsgCount, // count of unread messages
                    sohoUnreadHWCount: req.session.sohoUserUnreadHWCount, // unreadhw count
                    sohoProfileImage: req.session.sohoUserProfileImage, // profile image
                    syllabus: syllabusData, // syllabus data
                    id: sohoYID, // sohoYID
                });
            });
        });
    }
});
router.get('/join/group/:dynamicroute', function (req, res) {
    var sohoUID = req.params.dynamicroute; // edit which homework
    dbjsMethods.getTeacherMeetingData(sohoUID, function (meetingData) {
        if (meetingData.length > 0) {
            var meetingLink = meetingData[0].videoConfPMI;
        }
        var joinNotesLink = 'https://culturestride.com/a/classroom?join=' + sohoUID;
        var meta = ``;
        // render view
        res.render('pages/join', {
            title: 'Join Class | Culturestride', // title of the page (in the tab window)
            metadescription: 'Join Culturestride Class.', // metadescription of the page for SEO
            layout: 'blanklayout', //blanklayout
            meta: meta, // meta
            code: sohoUID, // code
            meetingLink: meetingLink, // meeting link
            joinNotesLink: joinNotesLink, // joinNotesLink
        });
    });
});
router.get('/join/:dynamicroute', function (req, res) {
    var sohoUID = req.params.dynamicroute; // edit which homework
    dbjsMethods.getTeacherMeetingData(sohoUID, function (meetingData) {
        if (meetingData.length > 0) {
            var meetingLink = meetingData[0].videoConfPMI;
        }
        var joinNotesLink = 'https://culturestride.com/a/classroom?join=' + sohoUID;
        var meta = ``;
        // render view
        res.render('pages/join', {
            title: 'Join Class | Culturestride', // title of the page (in the tab window)
            metadescription: 'Join Culturestride Class.', // metadescription of the page for SEO
            layout: 'blanklayout', //blanklayout
            meta: meta, // meta
            code: sohoUID, // code
            meetingLink: meetingLink, // meeting link
            joinNotesLink: joinNotesLink, // joinNotesLink
        });
    });
});
router.get('/invite/group/:dynamicroute', function (req, res) {
    var sohoGID = req.params.dynamicroute; // edit which homework
    dbjsMethods.getGroupDataForInvite(sohoGID, function (groupData) {
        if (groupData.length > 0) {
            var groupName = groupData[0].groupName
            var meta = ``;
            // render view
            res.render('pages/inviteGroup', {
                title: 'Join ' + groupName + ' Class | Culturestride', // title of the page (in the tab window)
                metadescription: 'Join Culturestride Class.', // metadescription of the page for SEO
                layout: 'blanklayout', //blanklayout
                meta: meta, // meta
                groupData: groupData, // groupData
                parser: parser, // cron parser
                moment: moment, // moment
                groupId: sohoGID, // group id
            });
        }

    });
});
























// // POST

router.post('/soho', function (req, res) {
    // define variables
    var inputEmail = req.body.email;
    var inputPassword = req.body.password;

    // check if email and pw match
    dbjsMethods.sohoGetUserforLogin(inputEmail, function (sohoUserData) { // get society director information row based off inputted email
        if (sohoUserData[0]) { // if there exists an account with the same email
            bcrypt.compare(inputPassword, sohoUserData[0].pw, function (err, result) { // use bcrypt to compare the inputted pw with the stored password hash
                if (result == true) { // inputPassword and hash match
                    req.session.sohoUserLoggedIn = sohoUserData[0].sohoUID;
                    req.session.sohoUserFirstName = sohoUserData[0].firstName;
                    req.session.sohoUserLastName = sohoUserData[0].lastName;
                    req.session.sohoUserPermission = sohoUserData[0].permission;
                    req.session.sohoUserSlug = sohoUserData[0].slug; // for messaging
                    req.session.sohoVideoConfPMI = sohoUserData[0].videoConfPMI; // for conf accs
                    req.session.sohoCharType = sohoUserData[0].charType; // for conf accs
                    // profile image
                    if (sohoUserData[0].profileImage != null) {
                        req.session.sohoUserProfileImage = sohoUserData[0].profileImage;
                    } else { // if there is no profile image stored
                        req.session.sohoUserProfileImage = '/img/guru.png';
                    }

                    console.log('SOHO LOGGED IN USER at ' + new Date() + ' is: ' + req.session.sohoUserLoggedIn);
                    const token = jwt.sign({
                        email: inputEmail
                    }, process.env.JWT_SECRET_KEY, {
                        expiresIn: '365d'
                    });
                    var expiryTime = new Date(new Date().getTime() + 10 * 365 * 24 * 60 * 60 * 1000);
                    res.cookie('access_token', token, {
                        expires: expiryTime
                    });

                    // get count of unread messages
                    dbjsMethods.getUnreadMessagesForSohoLogin(req.session.sohoUserSlug, function (msgData) { // get count of all the unread messages across all the rooms that the teacher is a part of
                        dbjsMethods.getUnreadHWForSoho(req.session.sohoUserPermission, req.session.sohoUserLoggedIn, function (hwData) { // get count of all the unread messages across all the rooms that the teacher is a part of
                            req.session.sohoUserUnreadMsgCount = msgData[0].unreadMsgCount;
                            req.session.sohoUserUnreadHWCount = hwData[0].unreadHWCount;

                            // check if there's a page they were tryna to access in req.session.sPageToBeAccessed, otherwise route to classroom
                            if (!req.session.sPageToBeAccessed) {
                                res.redirect('/sohostudents');
                            } else {
                                res.redirect(req.session.sPageToBeAccessed);
                            }

                        });
                    });


                } else { // inputPassword and hash DO NOT match - FAILED LOGIN
                    console.log('SOHO - login unsuccessful - incorrect password');
                    // render view
                    res.render('pages/teachingPortal/sohoLogin', {
                        title: 'Teacher Portal | Culturestride',
                        metadescription: 'Teacher Portal for Culturestride Teachers',
                        layout: 'teacherlayout', // change to teacherlayout
                        error: 1 // error var for failed login
                    });
                }
            });
        } else { // no matching email is found in the database - FAILED LOGIN
            // render view
            res.render('pages/teachingPortal/sohoLogin', {
                title: 'Teacher Portal | Culturestride',
                metadescription: 'Teacher Portal for Culturestride Teachers',
                layout: 'teacherlayout', // change to teacherlayout
                error: 1 // error var for failed login
            });
        }
    });
});
router.post('/sohocreateuser', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        // hash password
        bcrypt.genSalt(saltRounds, function (err, salt) {
            bcrypt.hash(req.body.password, salt, function (err, hash) {
                var slug = crypto.randomBytes(10).toString('hex').slice(8); // reroll once - TODO in the future you'd probably do a check again but what are the chances????
                dbjsMethods.sohoAddNewUser(req.body.firstName, req.body.lastName, req.body.email, req.body.rate, hash, slug); // update db - society table
            });
        });
        res.redirect('/sohostudents');
    });
});
router.post('/sohoprofile', uploadImageFile.single('file-to-upload'), function (req, res, next) {

    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var availableToBeBooked = req.body.availableToBeBooked;
        var firstName = req.body.firstName;
        var lastName = req.body.lastName;
        var location = req.body.location;
        var languages = req.body.languages;
        var desc1 = customMethods.nl2br(req.body.desc1);
        var desc2 = customMethods.nl2br(req.body.desc2);
        var videoConfPMI = req.body.videoConfPMI;
        var video1 = customMethods.youtube_parser(req.body.video1);
        if (video1 == '') {
            video1 = null;
        }
        var video2 = customMethods.youtube_parser(req.body.video2);
        if (video2 == '') {
            video2 = null;
        }
        var video3 = customMethods.youtube_parser(req.body.video3);
        if (video3 == '') {
            video3 = null;
        }

        try {
            var profileImage = req.file.location;
        } catch (e) {
            var profileImage = null;
        }


        dbjsMethods.updateSohoUserProfile(req.session.sohoUserLoggedIn, availableToBeBooked, firstName, lastName, location, languages, desc1, desc2, videoConfPMI, profileImage, video1, video2, video3);
        res.redirect('/sohoprofile');
    });
});
router.post('/sohostartclass', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var classType = req.body.classType;

        if (classType == 'typea') {
            var sohoCID = req.body.classTypeA;
            var hours = req.body.hoursUsed;

            // trim the date object to remove the milliseconds 
            var classDate = req.body.classDate.split('.')[0] + "Z";
            var humanReadableClassDate = moment(classDate, 'YYYY-MM-DDTHH:mm:ssZ').format("dddd, MMMM Do YYYY HH:mm A Z")

            // before updating class check validitiy 
            // get 1st of current month UTC format
            var start = moment.utc().startOf('month');

            // convert chosen class date and 1st of month to date objects
            var dateObject = new Date(classDate);
            var startObject = new Date(start);

            // check selected date is within current payment cycle 
            if (dateObject <= startObject) { // invalid selected date, not within current payment cycle
                res.redirect('/sohostartclass?error=1');
            } else {
                var readWriteHSKLevel = req.body.RWHSKLevel + '.' + req.body.RWHSKUnit;
                var listenSpeakHSKLevel = req.body.LSHSKLevel + '.' + req.body.LSHSKUnit;

                // INCREASE HOURS USED FOR STUDENT OBJECT
                // get current hours used
                dbjsMethods.sohoGetClassOfStudent(sohoCID, function (classData) {
                    var hoursUsed = parseFloat(classData[0].hoursUsed);
                    var hoursToAdd = parseFloat(hours);
                    var totalHoursUsed = hoursUsed + hoursToAdd;

                    // update class
                    dbjsMethods.sohoUpdateClassDetails(totalHoursUsed, sohoCID, readWriteHSKLevel, listenSpeakHSKLevel);

                    // ADD TO LOG
                    // get sID associated with CID
                    dbjsMethods.sohoGetStudentDataforRecordClassEmail(sohoCID, function (studentData) {
                        dbjsMethods.sohoGetUserData(req.session.sohoUserLoggedIn, function (sohoLoggedInData) { // get sohouser data

                            var sohoSID = classData[0].sohoSID;

                            // compute hours left
                            var hoursLeft = parseFloat(classData[0].hoursPurchased) - totalHoursUsed;

                            var lessonCount = classData[0].lessonCount + 1; // this lesson being recorded is the history  + 1
                            // add to lesson log - payment = card if hoursleft <= 0, payment = bank if hoursLeft > 0
                            // if class type is free and there's been less than 8 hours of classes taken - need to ensure that you account for 
                            if (classData[0].classType == 'free' && lessonCount <= 1) { // free classes
                                dbjsMethods.sohoAddClasstoLessonLog(sohoCID, sohoSID, req.body.sohoUID, req.body.hoursUsed, hoursLeft, classDate, readWriteHSKLevel, listenSpeakHSKLevel, 'bank', 'free'); // TODO - one day update stripe to account for free classes basedtechnically incorrect but "bank" denotes that stripe will not charge them
                            } else { // standard classes
                                if (hoursLeft > 0) {
                                    dbjsMethods.sohoAddClasstoLessonLog(sohoCID, sohoSID, req.body.sohoUID, req.body.hoursUsed, hoursLeft, classDate, readWriteHSKLevel, listenSpeakHSKLevel, 'bank', 'standard');
                                } else {
                                    dbjsMethods.sohoAddClasstoLessonLog(sohoCID, sohoSID, req.body.sohoUID, req.body.hoursUsed, hoursLeft, classDate, readWriteHSKLevel, listenSpeakHSKLevel, 'card', 'standard');
                                }
                            }

                            // EMAILS
                            // if (email == 'freeEnding2') { // prompt stu and tea that free trial is ending soon - add CC!
                            //     customMethods.emailFreeEnding2(studentData[0].email, studentData[0].firstName, sohoLoggedInData[0].firstName);
                            // } else if (email == 'freeEnding3') { // prompt stu and tea that trial has ended - add CC, otherwise do not continue with classes!
                            //     customMethods.emailFreeEnd(studentData[0].email, studentData[0].firstName);
                            // }

                            // email to the student
                            customMethods.emailSohoStudentforRecordClass(studentData[0].email, humanReadableClassDate, studentData[0].firstName, req.body.hoursUsed);

                            // clear all existing non-teacher assigned homework
                            // dbjsMethods.getIncompleteHomework(sohoCID, function (hwData) {
                            //     if (hwData.length > 0) {
                            //         var sohoHAIDArr = [];
                            //         for (let i = 0; i < hwData.length; i++) {
                            //             sohoHAIDArr.push(hwData[i].sohoHAID);
                            //         }
                            //         // delete
                            //         dbjsMethods.deleteHomework(sohoHAIDArr);
                            //     }
                            //     // assign new homework
                            //     dbjsMethods.getHomeworkAssignmentDataForAuto(sohoCID, function (classData) {
                            //         if (classData.length > 0) {
                            //             var arr = [];
                            //             arr.push(classData[0]);
                            //             assignHomeworkAuto(arr);
                            //         }
                            //     })
                            // });

                            // add syllabus to student portal if they don't already have access to it
                            var sohoYID = req.body.syllabus;
                            if (sohoYID) {
                                dbjsMethods.getSyllabusViewByClassIdStartClass(sohoCID, sohoYID, function (syllabusViewData) { // check if syllabus already exists in table for this class
                                    if (syllabusViewData.length == 0) { // add syllabus if it doesn't already exist in the table
                                        dbjsMethods.insertSyllabusView(sohoCID, sohoYID);
                                    }
                                });
                            }

                        });
                    });



                });
                res.redirect('/sohostartclass');
            }
        } else if (classType == 'typeb') {
            var sohoCIDArr = req.body.classTypeB; // array
            var sohoUID = req.body.sohoUID;
            var hours = 1;


            // trim the date object to remove the milliseconds 
            var classDate = req.body.classDate.split('.')[0] + "Z";
            var humanReadableClassDate = moment(classDate, 'YYYY-MM-DDTHH:mm:ssZ').format("dddd, MMMM Do YYYY HH:mm A Z")

            // before updating class check validitiy 
            // get 1st of current month UTC format
            var start = moment.utc().startOf('month');

            // convert chosen class date and 1st of month to date objects
            var dateObject = new Date(classDate);
            var startObject = new Date(start);
            // check selected date is within current payment cycle 
            if (dateObject <= startObject) { // invalid selected date, not within current payment cycle
                res.redirect('/sohostartclass?error=1');
            } else {

                // INCREASE HOURS USED FOR STUDENT OBJECT
                // get current hours used
                dbjsMethods.sohoGetClassOfStudentTypeB(sohoCIDArr, function (classData) {
                    // ADD TO LOG
                    dbjsMethods.sohoGetStudentDataforRecordClassEmail(sohoCIDArr, function (studentData) {

                        var hoursUsed = 1;
                        var hoursLeft = 0;
                        var readWriteHSKLevel = 1.1;
                        var listenSpeakHSKLevel = 1.1;

                        var asyncArr = [];

                        for (let i = 0; i < classData.length; i++) {

                            var sohoCID = classData[i].sohoCID;
                            var sohoSID = classData[i].sohoSID;

                            var classObj = {
                                sohoCID: sohoCID,
                                sohoSID: sohoSID,
                            }

                            asyncArr.push(classObj);
                        }


                        async.forEach(asyncArr, (asyncObj) => {

                            dbjsMethods.sohoAddClasstoLessonLog(asyncObj.sohoCID, asyncObj.sohoSID, sohoUID, hoursUsed, hoursLeft, classDate, readWriteHSKLevel, listenSpeakHSKLevel, 'card', 'typeb');


                        });


                        // email to the student
                        customMethods.emailSohoStudentforRecordClassTypeB(studentData[0].email, humanReadableClassDate, studentData[0].firstName);


                    });



                });
                res.redirect('/sohostartclass');
            }

        } else {
            console.log('sohostartclass something has gone wrong')
            res.redirect('/sohostartclass');
        }

    })
});
router.post('/soholessonhistory/:dynamicroute', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {

        var sohoCID = req.body.sohoCID;
        var sohoLID = req.params.dynamicroute;
        var refundHours = req.body.sohoHours;
        console.log('sohoLID: ' + sohoLID);
        console.log('sohoCID: ' + sohoCID);
        console.log('refundHours: ' + refundHours);
        dbjsMethods.sohoGetSohoClasses(sohoCID, function (classData) {

            var hoursUsed = parseFloat(classData[0].hoursUsed);
            console.log('hoursUsed: ' + hoursUsed);
            var newHoursUsed = hoursUsed - refundHours;
            dbjsMethods.updateHoursUsed(sohoCID, newHoursUsed);
        });
        dbjsMethods.sohoDeleteLesson(sohoLID);

        res.redirect('/soholessonhistory/' + sohoCID);
    });
});
router.post('/sohoapprove', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        dbjsMethods.sohoGetHoursPurchasedforAddPurchasedHours(req.body.class, function (classData) {
            // incremenet hours purchased
            var hoursPurchased = parseFloat(classData[0].hoursPurchased);
            var hoursToAdd = parseFloat(req.body.hoursToAdd);
            var hoursTotal = hoursPurchased + hoursToAdd;
            // update
            dbjsMethods.sohoUpdateHoursPurchasedforAddPurchasedHours(hoursTotal, req.body.class);
            dbjsMethods.sohoApproveTransaction(req.body.transaction);
            res.redirect('/sohoapprove');
        });
    });
});
router.post('/sohoaddpurchasedhours', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        // get current hourspurchased var of the sohoCID
        dbjsMethods.sohoGetHoursPurchasedforAddPurchasedHours(req.body.class, function (classData) {
            // incremenet hours purchased
            var hoursPurchased = parseFloat(classData[0].hoursPurchased);
            var hoursToAdd = parseFloat(req.body.hoursToAdd);
            var hoursTotal = hoursPurchased + hoursToAdd;

            // update
            dbjsMethods.sohoUpdateHoursPurchasedforAddPurchasedHours(hoursTotal, req.body.class);
        });
        res.redirect('/sohostudents');
    });
});
router.post('/sohologout', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        req.session.sohoUserLoggedIn = null;
        res.redirect('/soho');
    });
});
router.post('/sohoforgotpassword', function (req, res) {
    dbjsMethods.sohoGetEmailsofUsers(req.body.email, function (emailRecords) { //check if email has actually been signed up
        if (emailRecords.length == 0) {
            res.render('pages/teachingPortal/sohoForgotPassword', {
                title: 'Teacher Portal | Culturestride',
                metadescription: 'Teacher Portal for Culturestride Teachers',
                layout: 'teacherlayout', // change to teacherlayout
                error: 1, // error var for failed login
                expire: 0
            });
        } else {
            crypto.randomBytes(20, function (err, buf) {
                var token = buf.toString('hex'); //generates random token to be used in url
                var expiryDate = Date.now() + 3600000; //sets expiry date of token to 1 hour past present time
                dbjsMethods.sohoAllocateTokenandExpiryDate(req.body.email, token, expiryDate, function (err) { //updates relevant db row with token and expiry date
                    customMethods.emailSohoUserthatForgotPassword(req.body.email, req.headers.host, token); //emails society with link to reset password
                    res.redirect('/sohoforgotpasswordthankyou');
                });
            })
        }
    })
});
router.post('/sohoresetpassword', function (req, res) {
    var tokenURL = req.body.token;

    dbjsMethods.sohoGetExpiryDateOfToken(tokenURL, function (expiryDateData) {

        var expiryDate = parseInt(expiryDateData[0].resetPasswordExpires, 10);

        if (Date.now() >= expiryDate) { //checks if it's been more than 1 hour since user requested to change password

            dbjsMethods.sohoClearTokenandExpiryDate(tokenURL);

            res.render('pages/teachingPortal/sohoForgotPassword', {
                title: 'Teacher Portal | Culturestride',
                metadescription: 'Teacher Portal for Culturestride Teachers',
                layout: 'teacherlayout', // change to teacherlayout
                error: 0,
                expire: 1 //token has expired and email will need to be entered again
            });

        } else {

            if (req.body.newPassword == req.body.confirmPassword) { //check if user correctly confirms their new password/correctly enters the same password twice
                bcrypt.genSalt(saltRounds, function (err, salt) {
                    bcrypt.hash(req.body.newPassword, salt, function (err, hash) {
                        dbjsMethods.sohoResetPassword(hash, req.body.token); //sets new password in db
                        res.redirect('/sohoresetpasswordthankyou');
                    });
                });
            } else { //executes if user doesn't confirm password correctly
                res.render('pages/teachingPortal/sohoResetPassword', {
                    title: 'Teacher Portal | Culturestride',
                    metadescription: 'Teacher Portal for Culturestride Teachers',
                    layout: 'teacherlayout', // change to teacherlayout
                    token: tokenURL,
                    error: 1
                });
            }

        }
    })
});
router.post('/sohoSalary', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        // get the date ranges
        var startDate = req.body.startDate;
        var endDate = req.body.endDate;
        res.redirect('/sohosalary?startDate=' + startDate + '&endDate=' + endDate);
    });
});
router.post('/sohosalaryall', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        // get the date ranges
        var startDate = req.body.startDate;
        var endDate = req.body.endDate;
        res.redirect('/sohosalaryall?startDate=' + startDate + '&endDate=' + endDate);
    });
});
router.post('/ajaxToggleCharTypeTea', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var charType = req.body.charType;
        var sohoUID = req.session.sohoUserLoggedIn;
        // update events
        dbjsMethods.updateCharTypeTea(charType, sohoUID);
        req.session.sohoCharType = charType;
        req.session.save();
        res.status(200).send();
    });
});
router.post('/ajaxCalendarRemoveEvent', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoAID = req.body.eventId;
        var gcEventId = req.body.gcEventID;
        var eventType = req.body.eventType;

        if (eventType == 'theory') {

            dbjsMethods.getEmailDataDeleteTheory(sohoAID, function (emailData) {
                var timezone = emailData[0].timezone;
                var sFirstName = emailData[0].sFirstName;
                var tFirstName = emailData[0].tFirstName;
                var tLastName = emailData[0].tLastName;
                var sEmail = emailData[0].email;
                var start = emailData[0].start;
                var startMom = moment.tz(start, timezone); // offset to create the right time on cal
                var startFormatted = startMom.format('LLLL')
                dbjsMethods.deleteClassByCalendarId(sohoAID);
                dbjsMethods.sohoCalendarRemoveEvent(sohoAID);
                // remove from gcal
                fs.readFile('credentials.json', (err, content) => {
                    if (err) return console.log('Error loading client secret file:', err);
                    gCalData = {
                        gcEventId: gcEventId,
                    }
                    if (gcEventId) {
                        customMethods.gCalDelete(JSON.parse(content), gCalData);
                    }
                });
                // email student of cancellation + no charge
                customMethods.emailStudentCancelledTheoryClass(sFirstName, sEmail, tFirstName, tLastName, startFormatted, timezone)
                res.redirect('/sohocalendar');
            });
        } else if (eventType == 'practical') {
            dbjsMethods.getEmailDataDeleteTheory(sohoAID, function (emailData) {
                dbjsMethods.deleteClassByCalendarId(sohoAID);
                dbjsMethods.sohoCalendarRemoveEvent(sohoAID);

                // remove from gcal
                fs.readFile('credentials.json', (err, content) => {
                    if (err) return console.log('Error loading client secret file:', err);
                    gCalData = {
                        gcEventId: gcEventId,
                    }
                    if (gcEventId) {
                        customMethods.gCalDelete(JSON.parse(content), gCalData);
                    }
                });

                for (let i = 0; i < emailData.length; i++) {
                    var timezone = emailData[i].timezone;
                    var sFirstName = emailData[i].sFirstName;
                    var tFirstName = emailData[i].tFirstName;
                    var tLastName = emailData[i].tLastName;
                    var sEmail = emailData[i].email;
                    var start = emailData[i].start;
                    var startMom = moment.tz(start, timezone); // offset to create the right time on cal
                    var startFormatted = startMom.format('LLLL')

                    // email student of cancellation + no charge
                    customMethods.emailStudentCancelledPracticalClass(sFirstName, sEmail, tFirstName, tLastName, startFormatted, timezone)

                }



                res.redirect('/sohocalendar');
            });
        }

    });
});
router.post('/ajaxCalendarAddEventFree', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var start = moment.utc(req.body.start);
        var end = moment.utc(req.body.end);
        var free = 1;
        var sohoUID = req.body.selectedTeacher || req.session.sohoUserLoggedIn; // if selected teacher exists then edit that cal (set in admin only, teacher calendar) otherwise edit own calendar

        if (req.body.recurring == 0) { // single free time
            // check if free time already in calendar 
            dbjsMethods.sohoCalendarGetFreeEvent(sohoUID, start.format(), end.format(), function (data) {
                if (data.length == 0) { // no free time already in calendar
                    // add free time event
                    dbjsMethods.sohoCalendarAddEventFree(sohoUID, start.clone().format(), end.clone().format(), free, null);
                }
            });
        } else {
            // generate slug for group identifier
            var slug = crypto.randomBytes(10).toString('hex').slice(10);
            var asyncArr = [];
            for (i = 0; i < 30; i++) { // 30 individual instances
                var eventStartRepeat = start.clone().add(i * 7, 'days')
                var eventEndRepeat = end.clone().add(i * 7, 'days')
                var calDataObj = {
                    start: eventStartRepeat,
                    end: eventEndRepeat,
                }
                asyncArr.push(calDataObj);
            }

            // for recurring instances, check for clashes with classes or free events
            async.forEach(asyncArr, (asyncObj) => {
                // check if free event already exists 
                dbjsMethods.sohoCalendarGetFreeEvent(sohoUID, asyncObj.start.format(), asyncObj.end.format(), function (data) {
                    if (data.length == 0) { // no free time exists
                        var startPrev = asyncObj.start.clone().subtract(2, 'hours');
                        // check events from 2 hours before start time
                        dbjsMethods.sohoCalendarGetEventStart(sohoUID, startPrev.format(), asyncObj.end.format(), function (data) {
                            if (data.length == 0) { // no events
                                // add free time event
                                dbjsMethods.sohoCalendarAddEventFree(sohoUID, asyncObj.start.clone().format(), asyncObj.end.clone().format(), free, slug);
                            } else { // potential clashes with classes
                                let timeIntervalFree = asyncObj.start.format() + '/' + asyncObj.end.format();
                                let rangeFree = momentRange.range(timeIntervalFree);
                                for (i = 0; i < data.length; i++) {
                                    let timeInterval = data[i].start + '/' + data[i].end;
                                    let range = momentRange.range(timeInterval)
                                    if (!range.overlaps(rangeFree)) {
                                        dbjsMethods.sohoCalendarAddEventFree(sohoUID, asyncObj.start.format(), asyncObj.end.format(), free, slug);
                                    }
                                }
                            }
                        });
                    }
                });

            });
        }
        res.redirect('/sohocalendar');
    });
});
router.post('/ajaxCalendarUpdateEventRecurringAll', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var groupSlug = req.body.groupSlug;
        var sohoAID = req.body.eventId;
        var gcEventId;
        if (req.body.gcEventId) {
            gcEventId = req.body.gcEventId.split('_')[0]; // the id for the entire recurring event series is the gceventid without everything after the "_"
        }
        var newStart = req.body.start;
        var newEnd = req.body.end;

        dbjsMethods.getStartByCalendarId(sohoAID, function (startData) {
            dbjsMethods.getCalendarDataUpdateFutureRecurring(sohoAID, function (newEventData) {
                var eventStart = startData[0].start;
                dbjsMethods.getCalendarIdByGroupSlugFutureRecurring(groupSlug, eventStart, function (calData) {
                    var sohoAIDArr = [];
                    for (let i = 0; i < calData.length; i++) {
                        sohoAIDArr.push(calData[i].sohoAID)
                    }

                    // email stu
                    dbjsMethods.getEarliestInstanceOfGroupSlugCalendar(groupSlug, function (earlyEventData) {
                        var earliestEvent = earlyEventData[0].earliestEvent; // we need this because otherwise updating recurrence for the first event doesn't delete the event
                        fs.readFile('credentials.json', (err, content) => {
                            if (err) return console.log('Error loading client secret file:', err);

                            if (earliestEvent == eventStart) { // delete the event if it's the first
                                var gCalData = {
                                    gcEventId: gcEventId
                                }
                                customMethods.gCalDelete(JSON.parse(content), gCalData);
                            } else {
                                // stop recurrence at the current date
                                var gCalData = {
                                    gcEventId: gcEventId,
                                    start: eventStart,
                                }
                                customMethods.gCalUpdateRecurrence(JSON.parse(content), gCalData);
                            }

                            // create gcal event with new date
                            var teacherName = newEventData[0].tFirstName + ' ' + newEventData[0].tLastName;
                            var summary = newEventData[0].groupName + ' | ' + teacherName;
                            var location = 'https://culturestride.com/join/' + newEventData[0].sohoUID;
                            var description = 'Class will begin 5 minutes after the event start time.';
                            var colorId = 2; // green
                            var recurringNo = sohoAIDArr.length;

                            // for new gcal event
                            var gCalData = {
                                summary: summary,
                                description: description,
                                colorId: colorId,
                                recurringNo: recurringNo,
                                eventStart: newStart,
                                eventEnd: newEnd,
                                teacherName: teacherName,
                                location: location,
                                email: '',
                            }

                            customMethods.gCalCreateRecurring(JSON.parse(content), gCalData, function (data) { // create recurring event in gcal
                                // get instance ids from gcal again 
                                var eventId = data;
                                customMethods.gCalGetInstanceId(JSON.parse(content), eventId, function (instData) { // get the individual instance ids of the events that were created

                                    var asyncArr = []; // used later to loop async db calls
                                    for (var i = 0; i < instData.data.items.length; i++) {
                                        const e = instData.data.items[i];

                                        var attendeesArr = [];
                                        var studentsToEmailArr = [];
                                        var memberJSON = JSON.parse(calData[i].memberJSON);
                                        if (memberJSON[0].sEmail != null) {
                                            for (let j = 0; j < memberJSON.length; j++) {
                                                // build attendeesarr for gcal
                                                var attendeesObj = {
                                                    'email': memberJSON[j].sEmail
                                                }
                                                attendeesArr.push(attendeesObj);
                                                var attendeesObj = {
                                                    'email': calData[i].tEmail
                                                }
                                                attendeesArr.push(attendeesObj); // teacher email duplicates but gcal doesn't show 2 so who cares

                                                // for email later
                                                var studentsToEmailObj = {
                                                    'sEmail': memberJSON[j].sEmail,
                                                    'sFirstName': memberJSON[j].sFirstName,
                                                    'tFirstName': memberJSON[j].tFirstName,
                                                    'tLastName': memberJSON[j].tLastName,
                                                    'timezone': memberJSON[j].timezone,
                                                }
                                                studentsToEmailArr.push(studentsToEmailObj);
                                            }

                                        }

                                        // create cal object
                                        var calDataObj = {
                                            sohoAID: sohoAIDArr[i],
                                            start: e.start.dateTime,
                                            end: e.end.dateTime,
                                            gcEventId: e.id,
                                            studentsToEmail: studentsToEmailArr,
                                            attendees: attendeesArr,
                                            oldStart: calData[i].oldStart
                                        }
                                        asyncArr.push(calDataObj);
                                    }
                                    async.forEach(asyncArr, (asyncObj) => { // we use async to be able to do mysql calls within for loops (otherwise only the last data point is bound and then repeated)
                                        var start = moment(asyncObj.start).clone().utc().startOf('hour');
                                        var end = moment(asyncObj.end).clone().utc().add(1, 'hour').startOf('hour');
                                        dbjsMethods.sohoCalendarGetFreeClash(req.session.sohoUserLoggedIn, start.format(), end.format(), function (data) {
                                            if (data.length != 0) {
                                                let classInterval = moment(asyncObj.start).clone().format() + '/' + moment(asyncObj.end).clone().format();
                                                let classRange = momentRange.range(classInterval);
                                                for (i = 0; i < data.length; i++) {
                                                    let freeInterval = data[i].start + '/' + data[i].end;
                                                    let freeRange = momentRange.range(freeInterval);
                                                    if (freeRange.overlaps(classRange)) {
                                                        dbjsMethods.sohoCalendarRemoveEvent(data[i].sohoAID);
                                                    }
                                                }
                                            }
                                        });
                                        dbjsMethods.sohoCalendarUpdateEventRescheduleFuture(asyncObj.sohoAID, asyncObj.start, asyncObj.end, asyncObj.gcEventId); // add to own calendar

                                        // add attendees to the gcal if there are any
                                        if (asyncObj.attendees.length > 0) {
                                            customMethods.gCalUpdateAttendees(JSON.parse(content), asyncObj, function (data) {});
                                        }

                                        // send emails to all the students that have updated events
                                        if (asyncObj.studentsToEmail.length > 0) {
                                            for (let k = 0; k < asyncObj.studentsToEmail.length; k++) {

                                                var timezone = asyncObj.studentsToEmail[k].timezone;
                                                var startMom = moment.tz(asyncObj.start, timezone); // offset to create the right time on cal
                                                var startFormatted = startMom.format('LLLL');
                                                var oldEventStartMom = moment.tz(asyncObj.oldStart, timezone); // offset to create the right time on cal
                                                var oldEventStartFormatted = oldEventStartMom.format('LLLL');

                                                customMethods.emailStudentUpdatedPracticalClass(asyncObj.studentsToEmail[k].sFirstName, asyncObj.studentsToEmail[k].sEmail, asyncObj.studentsToEmail[k].tFirstName, asyncObj.studentsToEmail[k].tLastName, startFormatted, timezone, oldEventStartFormatted)
                                            }

                                        }

                                    }, err => {
                                        if (err) console.error(err.message);
                                    });
                                    res.status(200).send();

                                })

                            });

                        });
                    });


                });
            });

        });
    });
});

router.post('/ajaxCalendarUpdateEventRecurringSingle', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        // get length
        var start = moment(req.body.start);
        var end = start.clone().add(req.body.duration, 'hours');
        var sohoAID = req.body.eventId;
        var gcEventId = req.body.gcEventID;
        var oldEventStart = req.body.oldEventStart;

        // update events
        var startCheck = moment(start).clone().utc().startOf('hour');
        var endCheck = moment(end).clone().utc().add(1, 'hour').startOf('hour');
        dbjsMethods.sohoCalendarGetFreeClash(req.session.sohoUserLoggedIn, startCheck.format(), endCheck.format(), function (data) {
            if (data.length != 0) {
                let classInterval = moment(start).clone().format() + '/' + moment(end).clone().format();
                let classRange = momentRange.range(classInterval);
                for (i = 0; i < data.length; i++) {
                    let freeInterval = data[i].start + '/' + data[i].end;
                    let freeRange = momentRange.range(freeInterval);
                    if (freeRange.overlaps(classRange)) {
                        dbjsMethods.sohoCalendarRemoveEvent(data[i].sohoAID);
                    }
                }
            }
        });
        dbjsMethods.sohoCalendarUpdateEvent(sohoAID, start.clone().utc().format(), end.clone().utc().format());
        // update gcal
        fs.readFile('credentials.json', (err, content) => {
            if (err) return console.log('Error loading client secret file:', err);
            gCalData = {
                gcEventId: gcEventId,
                start: start.clone().utc().format(),
                end: end.clone().utc().format()
            }
            customMethods.gCalUpdate(JSON.parse(content), gCalData);
        });


        // send an email to the affected students
        dbjsMethods.getEmailDataDeleteTheory(sohoAID, function (emailData) {

            for (let i = 0; i < emailData.length; i++) {
                var timezone = emailData[i].timezone;
                var sFirstName = emailData[i].sFirstName;
                var tFirstName = emailData[i].tFirstName;
                var tLastName = emailData[i].tLastName;
                var sEmail = emailData[i].email;
                var startMom = moment.tz(start, timezone); // offset to create the right time on cal
                var startFormatted = startMom.format('LLLL');
                var oldEventStartMom = moment.tz(oldEventStart, timezone); // offset to create the right time on cal
                var oldEventStartFormatted = oldEventStartMom.format('LLLL');

                // email student of cancellation + no charge
                customMethods.emailStudentUpdatedPracticalClass(sFirstName, sEmail, tFirstName, tLastName, startFormatted, timezone, oldEventStartFormatted)
            }
        });

        res.redirect('/sohocalendar');
    });
});
router.post('/ajaxCalendarUpdateEvent', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        // get length
        var start = moment(req.body.start);
        var end = moment(req.body.end);
        var sohoAID = req.body.eventId;
        var gcEventId = req.body.gcEventID;

        // update events
        var startCheck = moment(start).clone().utc().startOf('hour');
        var endCheck = moment(end).clone().utc().add(1, 'hour').startOf('hour');
        dbjsMethods.sohoCalendarGetFreeClash(req.session.sohoUserLoggedIn, startCheck.format(), endCheck.format(), function (data) {
            if (data.length != 0) {
                let classInterval = moment(start).clone().format() + '/' + moment(end).clone().format();
                let classRange = momentRange.range(classInterval);
                for (i = 0; i < data.length; i++) {
                    let freeInterval = data[i].start + '/' + data[i].end;
                    let freeRange = momentRange.range(freeInterval);
                    if (freeRange.overlaps(classRange)) {
                        dbjsMethods.sohoCalendarRemoveEvent(data[i].sohoAID);
                    }
                }
            }
        });

        dbjsMethods.sohoCalendarUpdateEvent(sohoAID, start.clone().utc().format(), end.clone().utc().format());
        // update gcal
        fs.readFile('credentials.json', (err, content) => {
            if (err) return console.log('Error loading client secret file:', err);
            gCalData = {
                gcEventId: gcEventId,
                start: start.clone().utc().format(),
                end: end.clone().utc().format()
            }
            customMethods.gCalUpdate(JSON.parse(content), gCalData);
        });
        res.redirect('/sohocalendar');
    });
});

router.post('/removeRecurringEvent', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var groupSlug = req.body.groupSlug;
        var sohoAID = req.body.eventId;
        var gcEventId;
        if (req.body.gcEventId) {
            gcEventId = req.body.gcEventId.split('_')[0]; // the id for the entire recurring event series is the gceventid without everything after the "_"
        }

        // remove from own calendar
        dbjsMethods.getStartByCalendarId(sohoAID, function (startData) {
            var eventStart = startData[0].start;
            dbjsMethods.getCalendarIdByGroupSlugFuture(groupSlug, eventStart, function (calData) {
                var sohoAIDArr = [];
                for (let i = 0; i < calData.length; i++) {
                    sohoAIDArr.push(calData[i].sohoAID)
                }

                // email stu
                dbjsMethods.getEmailDataDeleteTheory(sohoAIDArr, function (emailData) {
                    for (let i = 0; i < emailData.length; i++) {

                        var timezone = emailData[i].timezone;
                        var sFirstName = emailData[i].sFirstName;
                        var tFirstName = emailData[i].tFirstName;
                        var tLastName = emailData[i].tLastName;
                        var sEmail = emailData[i].email;
                        var start = emailData[i].start;
                        var startMom = moment.tz(start, timezone); // offset to create the right time on cal
                        var startFormatted = startMom.format('LLLL')

                        // email student of cancellation + no charge
                        customMethods.emailStudentCancelledPracticalClass(sFirstName, sEmail, tFirstName, tLastName, startFormatted, timezone)
                    }

                    // delete from gcal
                    fs.readFile('credentials.json', (err, content) => {
                        if (err) return console.log('Error loading client secret file:', err);

                        var gCalData = {
                            gcEventId: gcEventId,
                            start: eventStart,
                        }
                        customMethods.gCalUpdateRecurrence(JSON.parse(content), gCalData);
                    });


                    dbjsMethods.deleteClassByCalendarId(sohoAIDArr);
                    dbjsMethods.sohoCalendarRemoveEvent(sohoAIDArr);

                    res.redirect('/sohocalendar');
                });

            });
        });
    });
});
router.post('/sohocalendar/limit', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var studentLimit = req.body.studentLimit;
        var sohoUID = req.session.sohoUserLoggedIn;
        if (studentLimit != '') {
            dbjsMethods.sohoUpdateStudentLimit(sohoUID, studentLimit);
        }
        dbjsMethods.getUserDataForLimit(sohoUID, function (data) {
            // check if new student is equal to student limit set by teacher
            if (data[0].acceptClass != 'unlimited') {
                if (data[0].numStudents >= data[0].acceptClass) {
                    // Set student limit to 0, as the limit as been reached
                    console.log("Setting accept class to 0");
                    dbjsMethods.sohoUpdateStudentLimit(sohoUID, '0');
                }
            }
        })

        res.redirect('/sohocalendar');
    });
});
router.post('/sohoschedule', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var classType = req.body.classType;

        if (classType == 'theory') {
            var classLength = req.body.classLength;
        } else {
            var classLength = 1; // all group classes be 1 hrs
            var sohoGID = req.body.groupClass;
        }


        // create event object - differentiating between recurring and single
        var eventStartMom = moment(req.body.classDate, 'YYYY-MM-DDTHH:mm:ssZ');
        var eventEndMom = eventStartMom.clone().add(classLength, 'hours');

        if (classType == 'theory') {

            dbjsMethods.getStudentFromClasses(req.body.class, function (studentData) {
                var studentName = studentData[0].sFirstName + ' ' + studentData[0].sLastName;
                var teacherName = studentData[0].tFirstName + ' ' + studentData[0].tLastName;

                // build emailarr
                var emailArr = [];
                var emailObj = {
                    'email': studentData[0].sEmail
                };
                emailArr.push(emailObj);
                var emailObj = {
                    'email': studentData[0].tEmail
                };
                emailArr.push(emailObj);

                var summary = 'Culturestride Class - ' + studentName + ' | ' + teacherName;
                var description = 'Class will begin 5 minutes after the event start time.';
                var colorId = 9; // dark blue
                var location = 'https://culturestride.com/join/' + studentData[0].sohoUID;

                if (req.body.eventType == 'recurring') {


                    var gCalData = {
                        summary: summary,
                        description: description,
                        colorId: colorId,
                        recurringNo: 52,
                        eventStart: eventStartMom.clone().utc().format(),
                        eventEnd: eventEndMom.clone().utc().format(),
                        email: emailArr,
                        studentName: studentName,
                        teacherName: teacherName,
                        location: location,
                    }

                    // add recurring gcal event and then add it to own calendar
                    fs.readFile('credentials.json', (err, content) => {
                        if (err) return console.log('Error loading client secret file:', err);
                        customMethods.gCalCreateRecurring(JSON.parse(content), gCalData, function (data) { // create recurring event in gcal
                            // get instance ids from gcal again 
                            var eventId = data;
                            customMethods.gCalGetInstanceId(JSON.parse(content), eventId, function (instData) { // get the individual instance ids of the events that were created
                                var slug = crypto.randomBytes(10).toString('hex').slice(10); // potential risk of double up slug

                                var asyncArr = []; // used later to loop async db calls
                                for (var i = 0; i < instData.data.items.length; i++) {
                                    const e = instData.data.items[i];
                                    // create cal object
                                    var calDataObj = {
                                        sohoSID: studentData[0].sohoSID,
                                        sohoUID: req.session.sohoUserLoggedIn,
                                        sohoCID: req.body.class,
                                        start: e.start.dateTime,
                                        end: e.end.dateTime,
                                        title: req.body.className,
                                        free: 0,
                                        groupSlug: slug,
                                        gcEventID: e.id,
                                        confirmed: 2,
                                        lessonType: 'standard'
                                    }
                                    asyncArr.push(calDataObj);
                                }

                                async.forEach(asyncArr, (asyncObj) => { // we use async to be able to do mysql calls within for loops (otherwise only the last data point is bound and then repeated)
                                    var start = moment(asyncObj.start).clone().utc().startOf('hour');
                                    var end = moment(asyncObj.end).clone().utc().add(1, 'hour').startOf('hour');
                                    dbjsMethods.sohoCalendarGetFreeClash(req.session.sohoUserLoggedIn, start.format(), end.format(), function (data) {
                                        if (data.length != 0) {
                                            let classInterval = moment(asyncObj.start).clone().format() + '/' + moment(asyncObj.end).clone().format();
                                            let classRange = momentRange.range(classInterval);
                                            for (i = 0; i < data.length; i++) {
                                                let freeInterval = data[i].start + '/' + data[i].end;
                                                let freeRange = momentRange.range(freeInterval);
                                                if (freeRange.overlaps(classRange)) {
                                                    dbjsMethods.sohoCalendarRemoveEvent(data[i].sohoAID);
                                                }
                                            }
                                        }
                                    });
                                    dbjsMethods.createLessonEventInstance(asyncObj.sohoSID, asyncObj.sohoUID, asyncObj.sohoCID, asyncObj.start, asyncObj.end, asyncObj.title, asyncObj.free, asyncObj.groupSlug, asyncObj.gcEventID, asyncObj.confirmed, asyncObj.lessonType); // add to own calendar
                                }, err => {
                                    if (err) console.error(err.message);
                                });

                            });

                        });
                    });

                } else { // single class

                    var slug = crypto.randomBytes(10).toString('hex').slice(10); // potential risk of double up slug

                    // build emailarr
                    var emailArr = [];
                    var emailObj = {
                        'email': studentData[0].sEmail
                    };
                    emailArr.push(emailObj);
                    var emailObj = {
                        'email': studentData[0].tEmail
                    };
                    emailArr.push(emailObj);

                    var summary = 'Culturestride Class - ' + studentName + ' | ' + teacherName;
                    var description = 'Class will begin 5 minutes after the event start time.';
                    var colorId = 9; // dark blue
                    var location = 'https://culturestride.com/join/' + studentData[0].sohoUID;


                    var gCalData = {
                        summary: summary,
                        description: description,
                        colorId: colorId,
                        eventStart: eventStartMom.clone().utc().format(),
                        eventEnd: eventEndMom.clone().utc().format(),
                        email: emailArr,
                        studentName: studentName,
                        teacherName: teacherName,
                        location: location,
                    }

                    // add single gcal event and then add it to own calendar
                    fs.readFile('credentials.json', (err, content) => {
                        if (err) return console.log('Error loading client secret file:', err);
                        customMethods.gCalCreateSingle(JSON.parse(content), gCalData, function (data) { // create recurring event in gcal
                            var eventId = data;
                            var free = 0;
                            var confirmed = 2;
                            var lessonType = 'standard';
                            var start = eventStartMom.clone().utc().startOf('hour');
                            var end = eventEndMom.clone().utc().add(1, 'hour').startOf('hour');
                            dbjsMethods.sohoCalendarGetFreeClash(req.session.sohoUserLoggedIn, start.format(), end.format(), function (data) {
                                if (data.length != 0) {
                                    let classInterval = eventStartMom.clone().format() + '/' + eventEndMom.clone().format();
                                    let classRange = momentRange.range(classInterval);
                                    for (i = 0; i < data.length; i++) {
                                        let freeInterval = data[i].start + '/' + data[i].end;
                                        let freeRange = momentRange.range(freeInterval);
                                        if (freeRange.overlaps(classRange)) {
                                            dbjsMethods.sohoCalendarRemoveEvent(data[i].sohoAID);
                                        }
                                    }
                                }
                            });
                            dbjsMethods.createLessonEventInstanceSingle(studentData[0].sohoSID, req.session.sohoUserLoggedIn, req.body.class, eventStartMom.clone().utc().format(), eventEndMom.clone().utc().format(), req.body.className, free, eventId, slug, confirmed, lessonType); // add to own calendar
                        });
                    });

                }


            });
        } else { // classtype is practical

            dbjsMethods.getGroupAddDataForCalendarAdd(sohoGID, function (groupData) {
                var teacherName = groupData[0].tFirstName + ' ' + groupData[0].tLastName;

                // build emailarr
                var emailArr = [];
                for (let i = 0; i < groupData.length; i++) {
                    var emailObj = {
                        'email': groupData[i].sEmail
                    };
                    emailArr.push(emailObj);
                }
                var emailObj = {
                    'email': groupData[0].tEmail
                };
                emailArr.push(emailObj);

                var summary = groupData[0].groupName + ' | ' + teacherName;
                var location = 'https://culturestride.com/join/' + groupData[0].sohoUID;
                var description = 'Class will begin 5 minutes after the event start time.';

                var colorId = 2; // green

                var gCalData = {
                    summary: summary,
                    description: description,
                    colorId: colorId,
                    recurringNo: 52,
                    eventStart: eventStartMom.clone().utc().format(),
                    eventEnd: eventEndMom.clone().utc().format(),
                    email: emailArr,
                    teacherName: teacherName,
                    location: location,
                }

                // add recurring gcal event and then add it to own calendar
                fs.readFile('credentials.json', (err, content) => {
                    if (err) return console.log('Error loading client secret file:', err);
                    customMethods.gCalCreateRecurring(JSON.parse(content), gCalData, function (data) { // create recurring event in gcal
                        // get instance ids from gcal again 
                        var eventId = data;
                        customMethods.gCalGetInstanceId(JSON.parse(content), eventId, function (instData) { // get the individual instance ids of the events that were created
                            var slug = crypto.randomBytes(10).toString('hex').slice(10); // potential risk of double up slug

                            var asyncArr = []; // used later to loop async db calls
                            for (var i = 0; i < instData.data.items.length; i++) {
                                const e = instData.data.items[i];
                                // create cal object
                                var calDataObj = {
                                    sohoUID: req.session.sohoUserLoggedIn,
                                    sohoGID: sohoGID,
                                    start: e.start.dateTime,
                                    end: e.end.dateTime,
                                    title: req.body.className,
                                    free: 0,
                                    groupSlug: slug,
                                    gcEventID: e.id,
                                    confirmed: 2,
                                    lessonType: 'standard'
                                }
                                asyncArr.push(calDataObj);
                            }

                            async.forEach(asyncArr, (asyncObj) => { // we use async to be able to do mysql calls within for loops (otherwise only the last data point is bound and then repeated)
                                var start = moment(asyncObj.start).clone().utc().startOf('hour');
                                var end = moment(asyncObj.end).clone().utc().add(1, 'hour').startOf('hour');
                                dbjsMethods.sohoCalendarGetFreeClash(req.session.sohoUserLoggedIn, start.format(), end.format(), function (data) {
                                    if (data.length != 0) {
                                        let classInterval = moment(asyncObj.start).clone().format() + '/' + moment(asyncObj.end).clone().format();
                                        let classRange = momentRange.range(classInterval);
                                        for (i = 0; i < data.length; i++) {
                                            let freeInterval = data[i].start + '/' + data[i].end;
                                            let freeRange = momentRange.range(freeInterval);
                                            if (freeRange.overlaps(classRange)) {
                                                dbjsMethods.sohoCalendarRemoveEvent(data[i].sohoAID);
                                            }
                                        }
                                    }
                                });
                                dbjsMethods.createLessonEventInstanceGroup(asyncObj.sohoUID, asyncObj.sohoGID, asyncObj.start, asyncObj.end, asyncObj.title, asyncObj.free, asyncObj.groupSlug, asyncObj.gcEventID, asyncObj.confirmed, asyncObj.lessonType); // add to own calendar
                            }, err => {
                                if (err) console.error(err.message);
                            });

                        });

                    });
                });

            });
        }

        // update db
        res.redirect('/sohoschedule'); // redirect
    });
});
router.post('/ajaxGetMessageHistory', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        dbjsMethods.getMessagesforRoom(req.body.room, function (messageData) { // get messages for teachingslug
            res.send(messageData);
        });

    });
});
router.post('/ajaxGetFreeTimes', function (req, res) {
    var startTimeMom = moment(req.body.date);
    var endTimeMom = startTimeMom.clone().add(24, 'hours');
    dbjsMethods.getFreeTimes(startTimeMom.toISOString(), endTimeMom.toISOString(), function (freeTimesData) {
        res.send(freeTimesData);
    });
});
router.post('/ajaxGetCurrentStudentLimit', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        dbjsMethods.getStudentLimitCalendar(req.session.sohoUserLoggedIn, function (currentStudentLimit) {
            res.send(currentStudentLimit);
        });
    });
});

router.post('/sohoAcceptTrialStudent', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoAID = req.body.sohoAID;

        dbjsMethods.sohoConfirmBookedClass(sohoAID); // update confirmed field in lessonlog

        dbjsMethods.sohoGetDataAcceptTrialStudent(sohoAID, function (stuData) {
            var eventStartMom = moment(stuData[0].start, 'YYYY-MM-DDTHH:mm:ssZ');
            var eventEndMom = moment(stuData[0].end, 'YYYY-MM-DDTHH:mm:ssZ');
            var studentName = stuData[0].sFirstName + ' ' + stuData[0].sLastName;
            var teacherName = stuData[0].tFirstName + ' ' + stuData[0].tLastName;

            var emailArr = [];
            var emailObj = {
                'email': stuData[0].sEmail
            };
            emailArr.push(emailObj);
            var emailObj = {
                'email': stuData[0].tEmail
            };
            emailArr.push(emailObj);

            var summary = 'Culturestride Class - ' + studentName + ' | ' + teacherName;
            var description = 'Class will begin 5 minutes after the event start time.';
            var colorId = 9; // dark blue
            var location = 'https://culturestride.com/join/' + stuData[0].sohoUID;

            var gCalData = {
                summary: summary,
                description: description,
                colorId: colorId,
                eventStart: eventStartMom.clone().utc().format(),
                eventEnd: eventEndMom.clone().utc().format(),
                email: emailArr,
                studentName: studentName,
                teacherName: teacherName,
                location: location,
            }


            fs.readFile('credentials.json', (err, content) => {
                if (err) return console.log('Error loading client secret file:', err);
                customMethods.gCalCreateSingle(JSON.parse(content), gCalData, function (data) { // gcal
                    var eventId = data;
                    dbjsMethods.updateEventWithGcalEventId(sohoAID, eventId); // add to own calendar
                });
            });
        });

        res.redirect('/sohostudents');
    });
});
router.post('/sohoRejectTrialStudent', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoAID = req.body.sohoAID;
        dbjsMethods.sohoGetDataRejectTrialStudent(sohoAID, function (stuData) {
            var lessonStartTime = moment(stuData[0].start, 'YYYY-MM-DDTHH:mm:ssZ');
            var teacherName = stuData[0].tFirstName + ' ' + stuData[0].tLastName;
            var sEmail = stuData[0].sEmail;
            var sFirstName = stuData[0].sFirstName;
            var timezone = stuData[0].timezone;
            // clear the class
            dbjsMethods.deleteLessonAndCalendarEvent(sohoAID);

            customMethods.teaRejectedBookedClass(sFirstName, sEmail, lessonStartTime.format("dddd, MMMM Do YYYY HH:mm A Z"), teacherName, timezone);



            res.redirect('/sohostudents');
        });

    });
});
router.post('/ajaxGetHomeworkAssignment', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var lastUpdatedDate = req.body.lastUpdatedDate;
        dbjsMethods.sohoGetHomeworkAssignmentsForSohoHomework(req.body.selectedClass, lastUpdatedDate, req.session.sohoUserSlug, function (homeworkAssignmentData) {
            res.send(homeworkAssignmentData);
        });
    });
});
router.post('/ajaxGetClassNotes', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        dbjsMethods.sohoGetClassNotes(req.body.selectedClass, function (classNotesData) {
            dbjsMethods.sohoGetLastLesson(req.body.selectedClass, function (lastLessonData) {
                if (lastLessonData.length > 0 && lastLessonData[0].lastLessonDate != 'unavailable') {
                    var lastLessonDate = lastLessonData[0].lastLessonDate;
                } else {
                    var lastLessonDate = moment().format(); // this will produce hoemwork updated = 0
                }
                dbjsMethods.sohoGetHomeworkUpdated(lastLessonDate, req.body.selectedClass, function (homeworkUpdatedData) {
                    res.send({
                        classNotes: classNotesData,
                        homework: homeworkUpdatedData[0].count,
                        lastUpdated: lastLessonDate,
                    });
                });
            });
        });
    });
});
router.post('/ajaxGetSyllabus', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        dbjsMethods.getSyllabusPagesByID(req.body.selectedSyllabus, function (syllabusData) {
            if (syllabusData.length > 0) {
                res.send(syllabusData);
            } else {
                res.status(200).send();
            }
        });
    });
});
router.post('/ajaxGetSyllabusStu', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoYID = req.body.id;
        dbjsMethods.getSyllabusPagesByID(sohoYID, function (syllabusData) {
            if (syllabusData.length > 0) {
                res.send(syllabusData);
            } else {
                res.status(400).send();
            }
        });
    });
});
router.post('/sohohomeworkcreate', uploadHomeworkFile.single('file-to-upload'), function (req, res, next) { // uses multer npm module to handle file upload
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var question = req.body.question;
        var addToRepo = req.body.checkboxAddToRepo; // "on" if checked, undefined if not checked
        var questionLevel = req.body.hskLevel + '.' + req.body.hskUnit;
        // if listening then prepend audio file html to question
        if (req.body.questionType == 'Listening') {
            var audioHTML = ` <div class="qAudio"><figure><audio controls id="audioPreview" src="` + req.file.location + `" type="audio/mp3" preload="none">Your browser does not support this <code>audio</code> element.</audio></figure></div>`;
            question = audioHTML + question;
        }
        if (addToRepo) { // if add to repo checkbox has been checked
            var state = 'active';
        } else {
            var state = 'teaRepo';
        }
        dbjsMethods.sohoCreateNewHomework(req.body.questionType, question, questionLevel, req.body.difficulty, req.session.sohoUserSlug, state, function (newSohoHID) {
            // assign homework to certain class
            if (req.body.assign) {
                dbjsMethods.sohoGetClassDataForSohoHomeworkCreate(req.body.assign, function (classData) {
                    var d = new Date();
                    dbjsMethods.sohoCreateNewHomeworkAssignment(newSohoHID, req.body.assign, req.session.sohoUserLoggedIn, d.toISOString().split('.')[0] + "Z");
                    // email student
                    customMethods.notifyStudentAboutHomeworkAssignment(classData[0].stuFirstName, classData[0].email, questionLevel, question);
                });
            }
        }); // create new homework object
        res.redirect('/sohohomeworkcreate');
    });
});
router.post('/sohohomeworkedit', function (req, res, next) { // uses multer npm module to handle file upload
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var referer = req.body.referer;
        var questionLevel = req.body.hskLevel + '.' + req.body.hskUnit;
        dbjsMethods.sohoUpdateHomework(req.body.question, req.body.questionType, questionLevel, req.body.difficulty, req.body.id);
        res.redirect(referer);
    });
});
router.post('/ajaxAddClassNotesPage', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoCID = req.body.addPageClass;
        // get shuffle no
        dbjsMethods.getMaxShuffleNoInNotes(sohoCID, function (maxShuffleNoData) {
            if (maxShuffleNoData[0].shuffle != null) { // not null
                var shuffleNo = maxShuffleNoData[0].shuffle + 1;
            } else {
                var shuffleNo = 1;
            }
            dbjsMethods.insertNewPageInNotes(sohoCID, shuffleNo, function (sohoNIDData) {
                var sohoNID = sohoNIDData;
                res.json(sohoNID);
            });
        });
    });
});
router.post('/ajaxDeleteClassNotesPage', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoNID = req.body.notesID;
        dbjsMethods.deleteNotesForClassroomNotes(sohoNID); // delete notes
        res.status(200).send();
    });
});
router.post('/ajaxSaveHomeworkTea', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoHAID = req.body.homeworkID;
        var text = req.body.text.replace(/<span class="diffRemove">[\s\S]*?<\/span>/g, '').replace(/<span class="diffAdd">(.*)<\/span>/g, '$1').replace(/<span class="diffAdd">/g, '').replace(/<span class="diffRemove">/g, ''); // remove all added spans
        var state = 'corrected';

        // run a diff
        dbjsMethods.getOldHomeworkAssignment(sohoHAID, function (hwData) {
            var oldText = hwData[0].answer;
            var diffText = '';
            if (oldText != null && oldText != '') {
                var oldTextNoSpan = oldText.replace(/<span class="diffRemove">[\s\S]*?<\/span>/g, '').replace(/<span class="diffAdd">(.*)<\/span>/g, '$1').replace(/<span class="diffAdd">/g, '').replace(/<span class="diffRemove">/g, ''); // remove all added spans
                const diff = Diff.diffChars(oldTextNoSpan, text);
                diff.forEach((part) => {
                    var partValue;
                    if (part.added) {
                        partValue = '<span class="diffAdd">' + part.value + '</span>';
                    } else if (part.removed) {
                        partValue = '<span class="diffRemove">' + part.value + '</span>';
                    } else {
                        partValue = part.value;
                    }

                    diffText += partValue;
                });
            } else {
                diffText = text;
            }

            dbjsMethods.updateAnswerforHomeworkAssignmentTea(sohoHAID, state, diffText);
            res.status(200).json(diffText);
        });

    });
});
router.post('/ajaxSaveClassNotes', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoNID = req.body.notesID;
        var text = req.body.text;
        dbjsMethods.saveNotesForClassroomNotes(sohoNID, text); // save notes
        res.status(200).send();
    });
});
router.post('/ajaxSaveClassNotesGroup', function (req, res) {
    var groupMembers = req.query.groupMembers;
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        if (groupMembers != '') { // no students selected

            var text = req.body.text;
            var title = req.body.title;

            // split save by , to get save array
            var sohoCIDArr = [];
            sohoCIDArr = groupMembers.split(',');
            var shuffle = 1;
            var asyncArr = [];

            for (let i = 0; i < sohoCIDArr.length; i++) {

                var notesObj = {
                    sohoCID: sohoCIDArr[i],
                    title: title,
                    text: text,
                    shuffle: shuffle,
                }

                asyncArr.push(notesObj);
            }
            async.forEach(asyncArr, (asyncObj) => {
                dbjsMethods.saveNotesForClassroomGroupNotes(asyncObj.sohoCID, asyncObj.title, asyncObj.text, asyncObj.shuffle);
            });
            res.status(200).send();
        } else {
            res.status(404).send();
        }

    });
});
router.post('/ajaxSaveSyllabusPage', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoYPID = req.body.sohoYPID;
        var text = req.body.text;
        var notes = req.body.notes;
        var title = req.body.title;
        dbjsMethods.saveSyllabus(sohoYPID, text, notes); // save notes
        dbjsMethods.getSyllabusIDByPageID(sohoYPID, function (syllabusData) {
            if (syllabusData.length > 0) {
                dbjsMethods.saveSyllabusTitle(title, syllabusData[0].sohoYID); // save title
            }
        })
        res.status(200).send();
    });
});
router.post('/sohohomeworkv2/complete', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var homeworkAssignmentID = req.body.homeworkID;
        var state = 'complete';
        dbjsMethods.updateStateHomeworkAssignment(state, homeworkAssignmentID)
        res.redirect('/sohohomework?class=' + req.body.class);
    });
});
router.post('/ajaxToggleOnOffAcceptClass', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        dbjsMethods.sohoUpdateStudentLimit(req.session.sohoUserLoggedIn, req.body.acceptClass);
        res.redirect('/sohocalendar');
    });
});
router.post('/sohoDeletePendingClass', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        dbjsMethods.deletePendingClass(req.body.sohoAID);
        res.redirect('/sohopending');
    });
});
router.post('/sohoMakeClassInactive', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        dbjsMethods.makeInactiveClass(req.body.sohoCID);
        res.redirect('/sohostudents');
    });
});
router.post('/sohoMakeClassActive', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        dbjsMethods.makeActiveClass(req.body.sohoCID);
        res.redirect('/sohostudents');
    });
});
router.post('/sohoAcceptReschedule', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        // compute end time
        var newStart = moment(req.body.newStart, 'YYYY-MM-DDTHH:mm:ssZ');
        var newEnd = newStart.add(req.body.duration, 'hours');
        dbjsMethods.rescheduleNewClassFromCalendar(req.body.sohoSID, req.body.sohoCID, newEnd.clone().toISOString().split('.')[0] + "Z", req.body.title, req.body.newSohoAID);
        dbjsMethods.deleteOldClassFromCalendar(req.body.sohoAID); // delete old class
        // notify student
        dbjsMethods.getEmailDataforReschedule(req.body.sohoSID, function (emailData) {
            var stuFirstName = emailData[0].firstName;
            var stuEmail = emailData[0].email;
            var oldStart = moment(req.body.oldStart, 'YYYY-MM-DDTHH:mm:ssZ');
            customMethods.emailReschedule(stuFirstName, stuEmail, req.session.sohoUserFirstName, oldStart.clone().format('DD/MM/YYYY, HH:mm:ss Z'), newStart.clone().format('DD/MM/YYYY, HH:mm:ss Z'))
        });
        res.redirect('/sohostudents');
    });
});
router.post('/sohoDeleteRequest', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        // clear reschedulerequest in sohoAID
        dbjsMethods.deleteRescheduleRequest(req.body.sohoAID);
        res.redirect('/sohostudents');
    });
});
router.post('/sohoNewTimeReschedule', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        // update the start end of target calendar to the new time
        console.log("file: index.js ~ line 4620 ~ req.body.flatpickr", req.body.flatpickr)
        var start = moment(req.body.flatpickr.split('.')[0] + "Z", 'YYYY-MM-DDTHH:mm:ssZ');
        var end = start.clone().add(req.body.duration, 'hours');
        dbjsMethods.rescheduleNewClassManual(start.toISOString().split('.')[0] + "Z", end.toISOString().split('.')[0] + "Z", req.body.sohoAID);
        // notify student
        dbjsMethods.getEmailDataforReschedule(req.body.sohoSID, function (emailData) {
            var stuFirstName = emailData[0].firstName;
            var stuEmail = emailData[0].email;
            var oldStart = moment(req.body.oldStart, 'YYYY-MM-DDTHH:mm:ssZ');
            customMethods.emailReschedule(stuFirstName, stuEmail, req.session.sohoUserFirstName, oldStart.clone().format('DD/MM/YYYY, HH:mm:ss Z'), start.clone().format('DD/MM/YYYY, HH:mm:ss Z'))
        });
        res.redirect('/sohostudents');
    });
});
router.post('/sohoDeleteClassReschedule', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        // delete class in sohoAID
        dbjsMethods.deleteClassReschedule(req.body.sohoAID);
        dbjsMethods.getEmailDataforReschedule(req.body.sohoSID, function (emailData) {
            var stuFirstName = emailData[0].firstName;
            var stuEmail = emailData[0].email;
            var oldStart = moment(req.body.oldStart, 'YYYY-MM-DDTHH:mm:ssZ');
            customMethods.emailDeleteClassReschedule(stuFirstName, stuEmail, req.session.sohoUserFirstName, oldStart.clone().format('DD/MM/YYYY, HH:mm:ss Z'));
        });
        res.redirect('/sohostudents');
    });
});
router.post('/ajaxGetSupportChannels', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        dbjsMethods.getSupportChannels(function (channelData) {
            res.send(channelData);
        });
    });
});
router.post('/sohochangeteacher', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoCID = req.body.class;
        var sohoUID = req.body.teacher;
        var sohoSlug = req.body.sohoSlug; // I guess this is new teacher slug?
        var stuSlug = req.body.stuSlug;

        // update sohoclasses
        dbjsMethods.updateTeacherinClasses(sohoCID, sohoUID);
        // update sohorooms
        dbjsMethods.getRoomChangeTeacher(sohoCID, stuSlug, function (roomData) {
            if (roomData.length > 0) { // so no crash app
                var sohoRUID = roomData[0].sohoRUID; // roomsuser idea of the teacher that we'll replace the slug of
                dbjsMethods.updateRoomsChangeTeacher(sohoSlug, sohoRUID);
            }
        });
        // update all future upcoming classes
        dbjsMethods.getUpcomingClassesChangeTeacher(sohoCID, function (upcomingClassData) { // get all calendar events that have the same class id and are in the future
            if (upcomingClassData.length > 0) {
                var upcomingClassArr = [];
                for (let i = 0; i < upcomingClassData.length; i++) {
                    upcomingClassArr.push(upcomingClassData[i].sohoAID)
                }
                dbjsMethods.updateTeacherUpcomingClassesChangeTeacher(upcomingClassArr, sohoUID); // update UID of all future cal events
            }
        });
        // email teacher 
        dbjsMethods.getTeacherForStuTransferred(sohoCID, function (teacherData) {
            var sohoSID = teacherData[0].sohoSID;
            dbjsMethods.getStudentForStuTransferred(sohoSID, function (stuData) {
                if (stuData.length > 0) {
                    // email teacher to confirm class or message student depending on confirmed status
                    var startTime = moment(stuData[0].start, 'YYYY-MM-DDTHH:mm:ssZ').utc();
                    var endTime = moment(stuData[0].end, 'YYYY-MM-DDTHH:mm:ssZ').utc();
                    customMethods.emailTeacherStuTransferred(stuData[0].firstName, stuData[0].lastName, stuData[0].primaryLevel, stuData[0].langHome, stuData[0].email, teacherData[0].email, teacherData[0].firstName, teacherData[0].lastName, stuData[0].confirmed, stuData[0].lessonType, startTime.clone().tz('Asia/Shanghai').format("dddd, MMMM Do YYYY HH:mm A Z"), endTime.clone().tz('Asia/Shanghai').format("dddd, MMMM Do YYYY HH:mm A Z"));
                } else { // no upcoming classes
                    // email teacher to message student
                    dbjsMethods.getStudentDetailsForStuTransferred(sohoSID, function (stuDetails) {
                        customMethods.emailTeacherMessageStuTransferred(stuDetails[0].firstName, stuDetails[0].lastName, stuDetails[0].primaryLevel, stuDetails[0].langHome, stuDetails[0].email, teacherData[0].email, teacherData[0].firstName, teacherData[0].lastName);
                    })
                }
            });
        });

        res.redirect('/sohochangeteacher');
    });
});
router.post('/sohoDeleteHomework', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoHID = req.body.sohoHID
        dbjsMethods.setInactiveHomework(sohoHID);
        res.redirect('/sohohomeworkall');
    });
});
router.post('/sohoAssignHomework', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoHID = req.body.sohoHID;
        var assignedClass = req.body.assign;
        dbjsMethods.sohoGetClassDataForSohoHomeworkAssign(assignedClass, function (classData) {
            dbjsMethods.sohoGetHomeworkForSohoHomeworkAssign(sohoHID, function (hwData) {
                var level = hwData[0].level;
                var question = hwData[0].question;
                var d = new Date();
                dbjsMethods.sohoCreateNewHomeworkAssignment(sohoHID, assignedClass, req.session.sohoUserLoggedIn, d.toISOString().split('.')[0] + "Z");
                // email student
                customMethods.notifyStudentAboutHomeworkAssignment(classData[0].stuFirstName, classData[0].email, level, question);
            });
        });
        res.redirect('back'); // redirect to the same page - refreshes
    });
});
router.post('/sohoAddToHomeworkRepo', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoHID = req.body.sohoHID;
        var state = 'active';
        dbjsMethods.updateStateHomework(state, sohoHID);
        res.redirect('back'); // redirect to the same page - refreshes
    });
});
router.post('/sohoAssignCreateHomework', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var questionType = req.body.questionType;
        var question = req.body.tinyTextEditorHW;
        var sohoCID = req.body.classID;
        var difficulty = 5; // arbitrary
        var state = 'teaRepo'; // does not allow the hw piece to enter the autoassignment loop

        // get question level
        dbjsMethods.getLevelsOfClass(sohoCID, function (levelsData) {
            var RWHSKLevel = levelsData[0].readWriteHSKLevel;
            var LSHSKLevel = levelsData[0].listenSpeakHSKLevel;
            if (questionType == 'Reading' || questionType == 'Writing') {
                var questionLevel = RWHSKLevel;
            } else {
                var questionLevel = LSHSKLevel;
            }

            // create homework piece
            dbjsMethods.sohoCreateNewHomework(questionType, question, questionLevel, difficulty, req.session.sohoUserSlug, state, function (newSohoHID) {
                // assign homework to certain class
                dbjsMethods.sohoGetClassDataForSohoHomeworkCreate(sohoCID, function (classData) {
                    var d = new Date();
                    dbjsMethods.sohoCreateNewHomeworkAssignment(newSohoHID, sohoCID, req.session.sohoUserLoggedIn, d.toISOString().split('.')[0] + "Z");
                    // email student
                    customMethods.notifyStudentAboutHomeworkAssignment(classData[0].stuFirstName, classData[0].email, questionLevel, question);
                });
            });
        });

        res.redirect('/sohoclassnotes?class=' + sohoCID); // redirect to the same page - refreshes
    });
});
router.post('/sohosyllabuscreate', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var title = 'Untitled Syllabus';
        dbjsMethods.createSyllabus(title, function (sohoYIDData) { // create syllabus
            // create 1 empty syllabus page
            dbjsMethods.createSyllabusPage(sohoYIDData);
        });
        res.redirect('/sohosyllabus');
    });
});
router.post('/sohosyllabuspagecreate', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoYID = req.body.id;
        dbjsMethods.addSyllabusPage(sohoYID);
        res.redirect('/sohosyllabusedit?id=' + sohoYID);
    });
});
router.post('/ajaxRenderSyllabus', function (req, res) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoYID = req.body.id;
        dbjsMethods.getSyllabusPagesByID(sohoYID, function (syllabusData) {
            if (syllabusData.length > 0) {
                res.send(syllabusData);
            } else {
                res.status(200).send();
            }
        })
    });
});
router.post('/ajaxCompleteHomework', function (req, res, next) { // uses multer npm module to handle file upload
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoHAID = req.body.homeworkID;
        var state = 'complete';
        dbjsMethods.updateStateHomeworkAssignment(state, sohoHAID);
        dbjsMethods.getUnreadHWCount(req.session.csStudentClassID, function (hwData) {
            req.session.csStudentHWNotif = hwData[0].count;
            req.session.save();
            res.status(200).json(req.session.csStudentHWNotif);
        });
    });
});
router.post('/ajaxSkipHomework', function (req, res, next) { // uses multer npm module to handle file upload
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        var sohoHAID = req.body.homeworkID;
        var state = 'skip';
        dbjsMethods.updateStateHomeworkAssignment(state, sohoHAID);
        dbjsMethods.getUnreadHWCount(req.session.csStudentClassID, function (hwData) {
            req.session.csStudentHWNotif = hwData[0].count;
            req.session.save();
            res.status(200).json(req.session.csStudentHWNotif);
        });
    });
});
router.post('/ajaxLikeHomework', function (req, res, next) { // uses multer npm module to handle file upload
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        // add like
        var liker = req.session.sohoUserSlug;
        var sohoHAID = req.body.homeworkID;
        dbjsMethods.addLikeHomeworkAssignment(liker, sohoHAID);
        var state = 'corrected';
        dbjsMethods.updateStateHomeworkAssignment(state, sohoHAID);
        res.status(200).send();
    });
});
router.post('/ajaxCommentHomework', function (req, res, next) { // uses multer npm module to handle file upload
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var who = req.body.who;
        var sohoHAID = req.body.homeworkID;
        var content = customMethods.nl2br(req.body.comment);

        if (who == 'stu') {
            var sender = req.session.csStudentSlug;
        } else if (who == 'tea') {
            var sender = req.session.sohoUserSlug;
            var state = 'corrected';
            dbjsMethods.updateStateHomeworkAssignment(state, sohoHAID); // change hw state to corrected
        }
        dbjsMethods.addCommentHomework(sender, content, sohoHAID);
        res.status(200).send();
    });
});
router.post('/ajaxViewAllComments', function (req, res, next) { // uses multer npm module to handle file upload
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoHAID = req.body.homeworkID;
        dbjsMethods.getComments(sohoHAID, function (commentsData) {
            res.status(200).send(commentsData);
        });
    });
});
router.post('/ajaxSaveHomework', function (req, res, next) { // uses multer npm module to handle file upload
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoHAID = req.body.homeworkID;
        var text = req.body.text;
        var state = 'teaAction';
        var answerType = 'text';
        dbjsMethods.updateAnswerforHomeworkAssignmentStu(sohoHAID, state, text, answerType);
        // update state of hwnotif
        dbjsMethods.getUnreadHWCount(req.session.csStudentClassID, function (hwData) {
            req.session.csStudentHWNotif = hwData[0].count;
            req.session.save();
            res.status(200).json(req.session.csStudentHWNotif);
        });

    });
});
router.post('/ajaxMakeClassInactive', function (req, res, next) { // uses multer npm module to handle file upload
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoCID = req.body.id;
        dbjsMethods.makeInactiveClass(sohoCID);
        res.status(200).send();
    });
});
router.post('/ajaxSaveStudentDetailNotes', function (req, res, next) { // uses multer npm module to handle file upload
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoCID = req.body.id;
        var text = req.body.text;
        dbjsMethods.updateStudentDetailsNotes(text, sohoCID);
        res.status(200).send();
    });
});
router.post('/ajaxOpenHW', function (req, res, next) { // uses multer npm module to handle file upload
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoHID = req.body.id;
        dbjsMethods.getHomeworkById(sohoHID, function (hwData) {
            dbjsMethods.sohoGetActiveClasses(req.session.sohoUserLoggedIn, req.session.sohoUserPermission, function (classesData) {
                res.status(200).send({
                    hw: hwData[0],
                    classes: classesData,
                    sohoUID: req.session.sohoUserLoggedIn
                });
            });
        });
    });
});
router.post('/ajaxGetSyllabusPreview', function (req, res, next) { // uses multer npm module to handle file upload
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoYID = req.body.id;
        dbjsMethods.getSyllabusPagesByID(sohoYID, function (syllabusData) {
            if (syllabusData.length > 0) {
                res.status(200).send({
                    syllabus: syllabusData,
                });
            } else {
                res.status(400).send();
            }
        });
    });
});
router.post('/ajaxPinyinApi', function (req, res, next) {
    try {
        var content = req.body.content;
        var result = segment.doSegment(content); // use novel-segment to split the words
        var annotatedDataArr = [];
        for (let i = 0; i < result.length; i++) {
            if (!result[i]._debug || result[i]._debug.DictOptimizer || result[i]._debug.autoCreate) { // ignore non chinese chars
                var data = '';
                data = chineselexicon.getEntries(result[i].w); // use the chinese-lexicon diary to get the dictionary meanings
                var dataArr = [];
                if (data.length == 0) { // no entries for this so we segment into individual characters and then retry
                    var resultCharArr = []; // split into individual chars then retry
                    resultCharArr = [...result[i].w];
                    for (let j = 0; j < resultCharArr.length; j++) {
                        data = chineselexicon.getEntries(resultCharArr[j]);
                        dataArr = []; // clear the dataArr so it doesn't get cluttered between individual characters
                        for (let k = 0; k < data.length; k++) { // so we push all possible interpretations of the word
                            dataArr.push(data[k]);
                        }
                        var dataObj = {
                            dataArr: dataArr,
                            originalWord: resultCharArr[j]
                        }
                        annotatedDataArr.push(dataObj);
                    }
                } else {
                    for (let k = 0; k < data.length; k++) { // so we push all possible interpretations of the word
                        dataArr.push(data[k]);
                    }
                    var dataObj = {
                        dataArr: dataArr,
                        originalWord: result[i].w
                    }
                    annotatedDataArr.push(dataObj);

                }
            }
        }
        res.send(annotatedDataArr);
    } catch (e) {
        console.log(e);
    }
});
router.post('/sohogroupclass/create', function (req, res, next) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var level = req.body.level;
        var classTime = req.body.classTime;
        var sohoUID = req.body.teacher || req.session.sohoUserLoggedIn; // admins will have a teacher var, non admins will not
        var groupName = 'HSK ' + level + ' Practical';

        // build the cron
        var startMom = moment(classTime).utc();
        console.log('aslkdfj: ' + startMom.clone().format());

        var cronExpression = null;
        dbjsMethods.createNewGroupClass(sohoUID, groupName, cronExpression, level, function (sohoGID) {
            // create gcal
            dbjsMethods.getDataForGroupClassCreate(sohoUID, function (calData) {
                var teacherName = calData[0].tFirstName + ' ' + calData[0].tLastName;
                var summary = groupName + ' | ' + teacherName;
                var location = 'https://culturestride.com/join/' + sohoUID;
                var description = 'Class will begin 5 minutes after the event start time.';
                var colorId = 2; // green


                var endMom = startMom.clone().add(1, 'hours');
                console.log('aslkdfj: ' + endMom.clone().format());
                var gCalData = {
                    summary: summary,
                    description: description,
                    colorId: colorId,
                    recurringNo: 52,
                    eventStart: startMom.clone().format(),
                    eventEnd: endMom.clone().format(),
                    teacherName: teacherName,
                    location: location,
                    email: '',
                }

                // add recurring gcal event and then add it to own calendar
                fs.readFile('credentials.json', (err, content) => {
                    if (err) return console.log('Error loading client secret file:', err);
                    customMethods.gCalCreateRecurring(JSON.parse(content), gCalData, function (data) { // create recurring event in gcal
                        // get instance ids from gcal again 
                        var eventId = data;
                        customMethods.gCalGetInstanceId(JSON.parse(content), eventId, function (instData) { // get the individual instance ids of the events that were created
                            var slug = crypto.randomBytes(10).toString('hex').slice(10); // potential risk of double up slug

                            var asyncArr = []; // used later to loop async db calls
                            for (var i = 0; i < instData.data.items.length; i++) {
                                const e = instData.data.items[i];
                                // create cal object
                                var calDataObj = {
                                    sohoUID: sohoUID,
                                    sohoGID: sohoGID,
                                    start: e.start.dateTime,
                                    end: e.end.dateTime,
                                    title: groupName,
                                    free: 0,
                                    groupSlug: slug,
                                    gcEventID: e.id,
                                    confirmed: 2,
                                    lessonType: 'practical'
                                }
                                asyncArr.push(calDataObj);
                            }

                            async.forEach(asyncArr, (asyncObj) => { // we use async to be able to do mysql calls within for loops (otherwise only the last data point is bound and then repeated)
                                var start = moment(asyncObj.start).clone().utc();
                                var end = moment(asyncObj.end).clone().utc().add(1, 'hour');
                                dbjsMethods.sohoCalendarGetFreeClash(req.session.sohoUserLoggedIn, start.format(), end.format(), function (data) {
                                    if (data.length != 0) {
                                        let classInterval = moment(asyncObj.start).clone().format() + '/' + moment(asyncObj.end).clone().format();
                                        let classRange = momentRange.range(classInterval);
                                        for (i = 0; i < data.length; i++) {
                                            let freeInterval = data[i].start + '/' + data[i].end;
                                            let freeRange = momentRange.range(freeInterval);
                                            if (freeRange.overlaps(classRange)) {
                                                dbjsMethods.sohoCalendarRemoveEvent(data[i].sohoAID);
                                            }
                                        }
                                    }
                                });
                                dbjsMethods.createLessonEventInstanceGroup(asyncObj.sohoUID, asyncObj.sohoGID, asyncObj.start, asyncObj.end, asyncObj.title, asyncObj.free, asyncObj.groupSlug, asyncObj.gcEventID, asyncObj.confirmed, asyncObj.lessonType); // add to own calendar
                            }, err => {
                                if (err) console.error(err.message);
                            });

                        });

                    });
                });

                // create practical messaging room
                var roomType = 'practical';
                var teacherSlug = req.session.sohoUserSlug;
                var title = groupName; // HSK X Practical
                dbjsMethods.createMessagingRoomPrac(roomType, title, sohoGID, function (newSohoRID) { // create messaging room
                    dbjsMethods.addRoomsUser(newSohoRID, teacherSlug); // add student into sohoroomsusers
                    var state = 'sent';
                    var sender = teacherSlug;
                    var message = 'Welcome to my Practical class group chat!';
                    var messageType = 'text';
                    dbjsMethods.saveMessageforChat(newSohoRID, sender, message, state, messageType);
                });

            });
        });


        res.redirect('/sohocalendar');

    });
});
router.post('/addStudentToGroup', function (req, res, next) { // uses multer npm module to handle file upload
    var sohoCIDArr = req.body.students;
    var nextClass = req.body.nextClass;
    var sohoGID = req.body.groupId;

    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        dbjsMethods.getPracticalGroupDetails(sohoGID, function (groupData) {

            var count = groupData[0].count;
            if (typeof (sohoCIDArr) == 'string') {
                var noOfStudentsToAdd = 1;
            } else {
                var noOfStudentsToAdd = sohoCIDArr.length;
            }
            var finalGroupSize = count + noOfStudentsToAdd;


            // add to groupmember table        
            var asyncArr = [];

            if (typeof (sohoCIDArr) == 'string') { // this means only 1 option was selected
                dbjsMethods.insertGroupMemberGroupClass(sohoCIDArr, sohoGID);
            } else {
                for (let i = 0; i < sohoCIDArr.length; i++) {
                    var sohoCID = sohoCIDArr[i];
                    var classObj = {
                        sohoCID: sohoCID,
                        sohoGID: sohoGID,
                    }
                    asyncArr.push(classObj);
                }
                async.forEach(asyncArr, (asyncObj) => {
                    dbjsMethods.insertGroupMemberGroupClass(asyncObj.sohoCID, asyncObj.sohoGID);
                });
            }

            if (finalGroupSize >= 3) { // class is confirmed happening, send confirmations to that one person
                dbjsMethods.getEmailDataForAddStudentToGroup(sohoCIDArr, function (stuData) {
                    dbjsMethods.getPracticalGroupDetails(sohoGID, function (groupDetailsData) {
                        dbjsMethods.getGcEventIDBySohoGID(sohoGID, function (eventData) {
                            var sohoUID = groupDetailsData[0].sohoUID;
                            for (let i = 0; i < stuData.length; i++) {

                                var email = stuData[i].email;
                                var sFirstName = stuData[i].firstName;
                                var timezone = stuData[i].timezone;
                                var startTime = moment(nextClass, 'YYYY-MM-DDTHH:mm:ssZ').utc();
                                var time = startTime.clone().tz(timezone).format('LLLL');

                                var joinlink = 'https://culturestride.com/join/' + sohoUID;

                                // email the student
                                customMethods.emailStuAcceptJoinGroupClass(sFirstName, email, time, timezone, joinlink);

                            }

                            if (eventData.length > 0) {
                                try {
                                    var gcEventID = eventData[0].gcEventID.split('_')[0];
                                } catch (e) {
                                    console.log(e);
                                }
                            }
                            // add the student email to the google calendar invite
                            dbjsMethods.getCalendarDataForAcceptJoinGroupClass(sohoGID, function (calData) {

                                fs.readFile('credentials.json', (err, content) => {
                                    if (err) return console.log('Error loading client secret file:', err);
                                    var attendeesArr = [];

                                    // push student
                                    if (calData.length > 0) { // inadvertently no teachers are invited to this event unless someone is already confirmed, ie you're confirming attendance of the 2nd student
                                        for (let i = 0; i < calData.length; i++) {
                                            var attendeesObj = {
                                                'email': calData[i].sEmail
                                            }
                                            attendeesArr.push(attendeesObj);
                                        }

                                        // push teacher
                                        var attendeesObj = {
                                            'email': calData[0].tEmail
                                        }
                                        attendeesArr.push(attendeesObj);

                                    }

                                    for (let j = 0; j < stuData.length; j++) {
                                        // add new students
                                        var attendeesObj = {
                                            'email': stuData[j].email
                                        }
                                        attendeesArr.push(attendeesObj);

                                    }

                                    var gCalData = { // there may be duplicates in emails because the insert to groupsmembers table may have finished before this getcaldata method runs but it's okay because gcal removes duplicates
                                        gcEventId: gcEventID,
                                        attendees: attendeesArr,
                                    }

                                    customMethods.gCalUpdateAttendees(JSON.parse(content), gCalData, function (data) {

                                    });
                                });
                            });
                        });
                    });
                });
            } else if (finalGroupSize == 2) { // class is happening, send confirmation emails to all
                dbjsMethods.getEmailDataForAddStudentToGroup2(sohoGID, function (stuData) {
                    dbjsMethods.getPracticalGroupDetails(sohoGID, function (groupDetailsData) {
                        dbjsMethods.getGcEventIDBySohoGID(sohoGID, function (eventData) {
                            var sohoUID = groupDetailsData[0].sohoUID;
                            for (let i = 0; i < stuData.length; i++) {

                                var email = stuData[i].email;
                                var sFirstName = stuData[i].firstName;
                                var timezone = stuData[i].timezone;
                                var startTime = moment(nextClass, 'YYYY-MM-DDTHH:mm:ssZ').utc();
                                var time = startTime.clone().tz(timezone).format('LLLL');

                                var joinlink = 'https://culturestride.com/join/' + sohoUID;

                                // email the student
                                customMethods.emailStuAcceptJoinGroupClass(sFirstName, email, time, timezone, joinlink);

                            }

                            if (eventData.length > 0) {
                                try {
                                    var gcEventID = eventData[0].gcEventID.split('_')[0];
                                } catch (e) {
                                    console.log(e);
                                }
                            }
                            // add the student email to the google calendar invite
                            dbjsMethods.getCalendarDataForAcceptJoinGroupClass(sohoGID, function (calData) {

                                fs.readFile('credentials.json', (err, content) => {
                                    if (err) return console.log('Error loading client secret file:', err);
                                    var attendeesArr = [];

                                    // push student
                                    if (calData.length > 0) { // inadvertently no teachers are invited to this event unless someone is already confirmed, ie you're confirming attendance of the 2nd student
                                        for (let i = 0; i < calData.length; i++) {
                                            var attendeesObj = {
                                                'email': calData[i].sEmail
                                            }
                                            attendeesArr.push(attendeesObj);
                                        }

                                        // push teacher
                                        var attendeesObj = {
                                            'email': calData[0].tEmail
                                        }
                                        attendeesArr.push(attendeesObj);

                                    }

                                    for (let j = 0; j < stuData.length; j++) {
                                        // add new students
                                        var attendeesObj = {
                                            'email': stuData[j].email
                                        }
                                        attendeesArr.push(attendeesObj);

                                    }

                                    var gCalData = { // there may be duplicates in emails because the insert to groupsmembers table may have finished before this getcaldata method runs but it's okay because gcal removes duplicates
                                        gcEventId: gcEventID,
                                        attendees: attendeesArr,
                                    }

                                    customMethods.gCalUpdateAttendees(JSON.parse(content), gCalData, function (data) {

                                    });
                                });
                            });
                        });
                    });
                });
            } else if (finalGroupSize == 1) { // class is not confirmed happening, no gcal, send reserve email
                dbjsMethods.getEmailDataForAddStudentToGroup(sohoCIDArr, function (stuData) {

                    for (let i = 0; i < stuData.length; i++) {

                        var email = stuData[i].email;
                        var sFirstName = stuData[i].firstName;
                        var timezone = stuData[i].timezone;
                        var startTime = moment(nextClass, 'YYYY-MM-DDTHH:mm:ssZ').utc();
                        var time = startTime.clone().tz(timezone).format('LLLL');

                        // email the student
                        customMethods.emailStuAcceptJoinGroupClassUnconfirmed(sFirstName, email, time, timezone);

                    }

                });
            }


        });

        res.redirect('/sohogroupclass');

    });
});
router.post('/deleteStudentFromGroup', function (req, res, next) { // uses multer npm module to handle file upload
    var sohoGMIDArr = req.body.students;
    var sohoGID = req.body.groupId;
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        dbjsMethods.getPracticalGroupDetails(sohoGID, function (groupData) {

            var count = groupData[0].count;
            if (typeof (sohoGMIDArr) == 'string') {
                var noOfStudentsToRemove = 1;
            } else {
                var noOfStudentsToRemove = sohoGMIDArr.length;
            }
            var finalGroupSize = count - noOfStudentsToRemove;

            // remove from group
            var asyncArr = [];
            if (typeof (sohoGMIDArr) == 'string') { // this means only 1 option was selected
                dbjsMethods.removeGroupMemberGroupClass(sohoGMIDArr);
            } else {
                for (let i = 0; i < sohoGMIDArr.length; i++) {
                    var sohoGMID = sohoGMIDArr[i];
                    var classObj = {
                        sohoGMID: sohoGMID,
                    }
                    asyncArr.push(classObj);
                }
                async.forEach(asyncArr, (asyncObj) => {
                    dbjsMethods.removeGroupMemberGroupClass(asyncObj.sohoGMID);
                });
            }

            if (finalGroupSize == 1) { // this group aint happening mate
                dbjsMethods.getEmailDataForDeleteStudentFromGroup(sohoGID, function (stuData) {
                    var sFirstName = stuData[0].firstName;
                    var email = stuData[0].email;
                    var timezone = stuData[0].timezone;

                    var options = {
                        tz: 'UTC'
                    };

                    try {
                        var interval = parser.parseExpression(stuData[0].start, options);
                        var nextClass = interval.next().toISOString();
                    } catch (err) {
                        console.log('Error: ' + err.message);
                    }
                    var timeMom = moment(nextClass, 'YYYY-MM-DDTHH:mm:ssZ').utc();
                    var timeFormatted = timeMom.clone().tz(timezone).format('LLLL');

                    // email the final student
                    customMethods.emailStuAcceptJoinGroupClassUnconfirmed(sFirstName, email, timeFormatted, timezone);


                    // remove everyone from event
                    dbjsMethods.getGcEventIDBySohoGID(sohoGID, function (eventData) {
                        if (eventData.length > 0) {
                            try {
                                var gcEventID = eventData[0].gcEventID.split('_')[0];
                            } catch (e) {
                                console.log(e);
                            }
                        }
                        fs.readFile('credentials.json', (err, content) => {
                            if (err) return console.log('Error loading client secret file:', err);
                            var attendeesArr = [];
                            var gCalData = {
                                gcEventId: gcEventID,
                                attendees: attendeesArr,
                            }
                            customMethods.gCalUpdateAttendees(JSON.parse(content), gCalData, function (data) {});
                        });
                        res.redirect('/sohogroupclass');
                    });
                });
            } else { // this group still happening
                // remove from event
                dbjsMethods.getCalendarDataForRemoveStudentFromGroup(sohoGID, sohoGMIDArr, function (calData) {
                    dbjsMethods.getGcEventIDBySohoGID(sohoGID, function (eventData) {
                        if (eventData.length > 0) {
                            try {
                                var gcEventID = eventData[0].gcEventID.split('_')[0];
                            } catch (e) {
                                console.log(e);
                            }
                        }
                        fs.readFile('credentials.json', (err, content) => {
                            if (err) return console.log('Error loading client secret file:', err);
                            var attendeesArr = [];
                            // push student
                            if (calData.length > 0) { // inadvertently no teachers are invited to this event unless someone is already confirmed, ie you're confirming attendance of the 2nd student
                                for (let i = 0; i < calData.length; i++) {
                                    var attendeesObj = {
                                        'email': calData[i].sEmail
                                    }
                                    attendeesArr.push(attendeesObj);
                                }
                                // push teacher
                                var attendeesObj = {
                                    'email': calData[0].tEmail
                                }
                                attendeesArr.push(attendeesObj);

                            }
                            var gCalData = {
                                gcEventId: gcEventID,
                                attendees: attendeesArr,
                            }
                            customMethods.gCalUpdateAttendees(JSON.parse(content), gCalData, function (data) {});
                        });
                        res.redirect('/sohogroupclass');
                    });
                });
            }

        });
    });
});
router.post('/sohoAcceptJoinGroupClass', function (req, res, next) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoGMID = req.body.groupMemberId;
        dbjsMethods.getStudentDataForAcceptJoinGroup(sohoGMID, function (stuData) {
            var time = req.body.time;

            var state = 'pendingStuConfirm';
            dbjsMethods.updateGroupMemberState(state, sohoGMID);

            if (stuData.length > 0) {
                var email = stuData[0].email;
                var sFirstName = stuData[0].firstName;
                var timezone = stuData[0].timezone;
                var startTime = moment(time, 'YYYY-MM-DDTHH:mm:ssZ').utc();
                var timeFormatted = startTime.clone().tz(timezone).format('LLLL');
                var link = 'https://culturestride.com/a/confirm/practical?groupMemberID=' + sohoGMID + '&time=' + time;
                // email the student
                customMethods.emailStudentConfirmPracticalClass(sFirstName, email, timeFormatted, timezone, link);
            }


            res.status(200).send();
        });
    });
});
router.post('/sohoRejectJoinGroupClass', function (req, res, next) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoGMID = req.body.groupMemberId;
        dbjsMethods.deleteGroupMember(sohoGMID);
        res.status(200).send();
    });
});
router.post('/deletePracticalClass', function (req, res, next) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var sohoGID = req.body.groupId;

        // delete gcal
        dbjsMethods.getGcEventIDBySohoGID(sohoGID, function (eventData) {
            if (eventData.length > 0) {
                try {
                    var gcEventID = eventData[0].gcEventID.split('_')[0];
                } catch (e) {
                    console.log(e);
                }
            }
            fs.readFile('credentials.json', (err, content) => {
                if (err) return console.log('Error loading client secret file:', err);

                var gCalData = {
                    gcEventId: gcEventID,
                }
                customMethods.gCalDelete(JSON.parse(content), gCalData, function (data) {});
            });

            // delete from db
            dbjsMethods.deletePracticalClass(sohoGID);

            res.redirect('/sohogroupclass');
        });
    });
});
router.post('/ajaxGetSCI', function (req, res, next) {
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        dbjsMethods.getStripeCustomerData(req.session.csStudentLoggedIn, async function (stripeCustomerData) {
            var stripeCustomerId = stripeCustomerData[0].stripeCustomerId;
            res.status(200).json(stripeCustomerId);
        });
    });
});
router.post('/sohocalendar/freetimes', function (req, res, next) {
    customMethods.verifyjwtTokenTea(res, req.cookies.access_token, function (authData) {
        var rule = JSON.parse(req.body.rule);
        dbjsMethods.getFreeRuleTeacher(req.session.sohoUserLoggedIn, function (teacherData) {

            // puts it into startHour,startMin, etc
            var weekRule = [];
            for (let i = 0; i < rule.length; i++) { // per day
                var dayInterval = [];
                var ruleDay = rule[i];
                for (let j = 0; j < ruleDay.length; j++) { // per interval in each day
                    var startTime = ruleDay[j].startTime;
                    var endTime = ruleDay[j].endTime;

                    var startArr = startTime.split(':');
                    var startHour = startArr[0];
                    var startMin = startArr[1];
                    var endArr = endTime.split(':');
                    var endHour = endArr[0];
                    var endMin = endArr[1];

                    var intervalObj = {
                        startHour: startHour,
                        startMin: startMin,
                        endHour: endHour,
                        endMin: endMin,
                    }
                    dayInterval.push(intervalObj);

                }
                weekRule.push(dayInterval);
            }

            dbjsMethods.updateFreeRule(req.session.sohoUserLoggedIn, JSON.stringify(weekRule));

            res.redirect('/sohocalendar/freetimes');
        });
    });
});
























































// STRIPE
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

router.post('/stripe-webhook',
    async (req, res) => {
        // Retrieve the event by verifying the signature using the raw body and secret.
        let event;

        try {
            event = stripe.webhooks.constructEvent(
                req.rawBody,
                req.headers['stripe-signature'],
                process.env.STRIPE_WEBHOOK_SECRET
            );
        } catch (err) {
            console.log(err);
            console.log(`⚠️  Webhook signature verification failed.`);
            console.log(
                `⚠️  Check the env file and enter the correct webhook secret.`
            );
            return res.sendStatus(400);
        }
        // Extract the object from the event.
        const dataObject = event.data.object;

        // Handle the event
        // Review important events for Billing webhooks
        // https://stripe.com/docs/billing/webhooks
        // Remove comment to see the various objects sent for this sample
        switch (event.type) {
            case 'invoice.paid':
                console.log('invoice paid');

                console.log('invoice paid: ' + JSON.stringify(dataObject));
                // Used to provision services after the trial has ended.
                // The status of the invoice will show up as paid. Store the status in your
                // database to reference when a user accesses your service to avoid hitting rate limits.
                break;

            case 'invoice.payment_failed':
                console.log('invoice failed');

                console.log('invoice payment failed: ' + JSON.stringify(dataObject));
                // If the payment fails or the customer does not have a valid payment method,
                //  an invoice.payment_failed event is sent, the subscription becomes past_due.
                // Use this webhook to notify your user that their payment has
                // failed and to retrieve new card details.
                break;
            case 'customer.subscription.deleted':
                if (event.request != null) {
                    // handle a subscription cancelled by your request
                    // from above.
                } else {
                    // handle subscription cancelled automatically based
                    // upon your subscription settings.
                }
                break;
            default:
                // Unexpected event type
        }
        res.sendStatus(200);
    }
);

router.get('/getdate', function (req, res) {
    var date = new Date();
    console.log('date: ' + date);
    res.send(date);
});

router.get('/resetdate', function (req, res) {
    var clock = sinon.restore();
    var date = new Date();
    console.log('date: ' + date);
    res.send(date);
});


router.get('/advancedate', function (req, res) {
    var date = new Date('2021-12-29T23:59:58Z'); // adjust this and call route to adjust time
    var unix = date.getTime();
    // SET FAKE TIME (FOR TESTING)
    var clock = sinon.useFakeTimers({
        now: unix,
        shouldAdvanceTime: true
    });
    var date = new Date();
    console.log('date: ' + date);
    res.send(date);
});

// router.get('/advancedate2', function (req, res) {
//     var date = new Date('2021-10-06T22:59:58Z'); // adjust this and call route to adjust time
//     var unix = date.getTime();
//     // SET FAKE TIME (FOR TESTING)
//     var clock = sinon.useFakeTimers({
//         now: unix,
//         shouldAdvanceTime: true
//     });
//     var date = new Date();
//     console.log('date: ' + date);
//     res.send(date);
// });

// router.get('/advancedate3', function (req, res) {
//     var date = new Date('2021-06-05T09:59:58Z'); // adjust this and call route to adjust time
//     var unix = date.getTime();
//     // SET FAKE TIME (FOR TESTING)
//     var clock = sinon.useFakeTimers({
//         now: unix, 
//         shouldAdvanceTime: true
//     });
//     var date = new Date();
//     console.log('date: ' + date);
//     res.send(date);
// });



router.get('/a/payments/addcard', function (req, res) {
    var plan = req.query.plan;
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
            req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
            res.redirect('/login');
        } else {
            dbjsMethods.getStripeCustomerData(req.session.csStudentLoggedIn, async function (stripeCustomerData) {
                var stripeCustomerId = stripeCustomerData[0].stripeCustomerId;
                // TEST PRODUCT IDS
                // var stripePracticalPriceIdAUD = '' // TEST - AUD practical Price ID 
                // var stripeTheoryPriceIdUSD = '' // TEST - USD theory Price ID 
                // var stripePracticalPriceIdUSD = '' // TEST - USD practical Price ID 

                // REAL PRODUCT IDS
                var stripeTheoryPriceIdAUD = '' // AUD theory Price ID 
                var stripePracticalPriceIdAUD = '' // AUD practical Price ID 
                var stripeTheoryPriceIdUSD = '' // USD theory Price ID 
                var stripePracticalPriceIdUSD = '' // USD practical Price ID 

                // render view
                res.render('pages/account/paymentsaddcard', {
                    title: 'Culturestride', // title of the page (in the tab window)
                    metadescription: 'Immerse deeper and manage your lessons with your Culturestride account.', // metadescription of the page for SEO
                    rwHSK: req.session.csStudentReadWriteHskLevel,
                    lsHSK: req.session.csStudentListenSpeakHskLevel,
                    layout: 'dashlayout', // logged in template
                    sFirstName: req.session.csStudentFirstName, // student first name
                    sLastName: req.session.csStudentLastName, // student last name
                    sLang: req.session.csStudentClassLang, // class language
                    sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                    sClassType: req.session.csStudentClassType, // class type
                    sSlug: req.session.csStudentSlug, // slug
                    sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                    sProfileImage: req.session.csStudentProfileImage, // own profile image
                    sClass: req.session.csStudentClassID, // class data
                    sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                    sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                    sStudyTimer: req.session.sStudyTimer, // study timer
                    sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                    sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                    sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                    sNextMeetingType: req.session.nextMeetingType, // next meeting type
                    moment: moment, // moment
                    plan: plan, // which plan did they select
                    stripeCustomerId: stripeCustomerId, // customer id
                    stripeTheoryPriceIdAUD: stripeTheoryPriceIdAUD, // stripe product id
                    stripePracticalPriceIdAUD: stripePracticalPriceIdAUD, // stripe product id
                    stripeTheoryPriceIdUSD: stripeTheoryPriceIdUSD, // stripe product id
                    stripePracticalPriceIdUSD: stripePracticalPriceIdUSD, // stripe product id
                });
            });

        }
    });
});

router.get('/a/start/card', function (req, res) {
    var meta = ``;
    customMethods.verifyjwtToken(res, req.cookies.access_token, function (authData) {
        if (!req.session.csStudentLoggedIn) { // check if the user is logged in. req.session.sID is only set if a user has logged in.
            req.session.aPageToBeAccessed = req.originalUrl; // gets the url query past the .com and stores it in session
            res.redirect('/login');
        } else {
            dbjsMethods.getStripeCustomerData(req.session.csStudentLoggedIn, async function (stripeCustomerData) {
                var stripeCustomerId = stripeCustomerData[0].stripeCustomerId;

                // TEST PRODUCT IDS
                // var stripeTheoryPriceIdAUD = '' // TEST - AUD theory Price ID 
                // var stripePracticalPriceIdAUD = '' // TEST - AUD practical Price ID 
                // var stripeTheoryPriceIdUSD = '' // TEST - USD theory Price ID 
                // var stripePracticalPriceIdUSD = '' // TEST - USD practical Price ID 

                // REAL PRODUCT IDS
                var stripeTheoryPriceIdAUD = '' // AUD theory Price ID 
                var stripePracticalPriceIdAUD = '' // AUD practical Price ID 
                var stripeTheoryPriceIdUSD = '' // USD theory Price ID 
                var stripePracticalPriceIdUSD = '' // USD practical Price ID 

                // render view
                res.render('pages/account/startcard', {
                    title: 'Culturestride', // title of the page (in the tab window)
                    metadescription: 'Learn Mandarin online with 1 free Private 1-on-1 Theory and 1 free Group Practical class with native teachers in China.', // metadescription of the page for SEO
                    layout: 'blanklayout',
                    sFirstName: req.session.csStudentFirstName, // student first name
                    sLastName: req.session.csStudentLastName, // student last name
                    sLang: req.session.csStudentClassLang, // class language
                    sShowOnboarding: req.session.csStudentShowOnboarding, // is this a trial student?
                    sClassType: req.session.csStudentClassType, // class type
                    sSlug: req.session.csStudentSlug, // slug
                    sLessonCount: req.session.csStudentLessonCount, // lesson count for free counter
                    sProfileImage: req.session.csStudentProfileImage, // own profile image
                    sClass: req.session.csStudentClassID, // class data
                    sUnreadMsgCount: req.session.csStudentUnreadMessages, // unread messages,
                    sTeachingRoomID: req.session.csStudentTeachingRoomID, // teaching room ID
                    sStudyTimer: req.session.sStudyTimer, // study timer
                    sTheoryMeetingURL: req.session.theoryMeetingURL, // next class meeting link
                    sPracticalMeetingURL: req.session.practicalMeetingURL, // practical meting url
                    sNextMeetingTime: req.session.nextMeetingTime, // next meeting time
                    sNextMeetingType: req.session.nextMeetingType, // next meeting type
                    moment: moment, // moment
                    meta: meta, // meta
                    stripeCustomerId: stripeCustomerId, // customer id
                    stripeTheoryPriceIdAUD: stripeTheoryPriceIdAUD, // stripe product id
                    stripePracticalPriceIdAUD: stripePracticalPriceIdAUD, // stripe product id
                    stripeTheoryPriceIdUSD: stripeTheoryPriceIdUSD, // stripe product id
                    stripePracticalPriceIdUSD: stripePracticalPriceIdUSD, // stripe product id
                });
            });

        }
    });
});

router.post('/retrieve-customer-payment-method', async (req, res) => {
    const paymentMethods = await stripe.paymentMethods.list({
        customer: req.body.stripeCustomerId,
        type: 'card',
    });

    try {
        var brand = paymentMethods.data[0].card.brand;
        var expiryMonth = paymentMethods.data[0].card.exp_month;
        var expiryYear = paymentMethods.data[0].card.exp_year;
        var last4 = paymentMethods.data[0].card.last4;

        var data = {
            brand: brand,
            expiryMonth: expiryMonth,
            expiryYear: expiryYear,
            last4: last4
        }
        res.send(data);
    } catch (e) {
        console.log('No payment method associated with this customer - ' + req.body.stripeCustomerId);
    }
});
router.post('/create-subscription', async (req, res) => {

    // Attach the payment method to the customer
    try {
        await stripe.paymentMethods.attach(req.body.paymentMethodId, {
            customer: req.body.customerId,
        });
    } catch (error) {
        return res.status('402').send({
            error: {
                message: error.message
            }
        });
    }
    // Change the default invoice settings on the customer to the new payment method
    await stripe.customers.update(
        req.body.customerId, {
            invoice_settings: {
                default_payment_method: req.body.paymentMethodId,
            },
        }
    );

    var mom = new moment().utc().add(1, 'month').startOf('month').format('X'); // anchor billing to start of next month UTC unix timestamp
    // Create the subscription
    const subscription = await stripe.subscriptions.create({
        customer: req.body.customerId,
        items: [{
            price: req.body.theorySPI // theory class
        }, {
            price: req.body.practicalSPI // practical
        }],
        billing_cycle_anchor: mom,
        expand: ['latest_invoice.payment_intent'],
    });

    // update subscription id of student
    var stripeSubscriptionItemId = subscription.items.data[0].id;
    var stripeGroupItemId = subscription.items.data[1].id;
    dbjsMethods.updateStripeSubscriptionItemId(stripeSubscriptionItemId, stripeGroupItemId, req.session.csStudentLoggedIn);

    var planText = 'theoryAndPractical';
    dbjsMethods.updatePlanSubscription(planText, req.session.csStudentClassID);

    req.session.csStudentClassType = 'standard';


    // email the student and the teacher
    dbjsMethods.getEmailFreeUpgrade(req.session.csStudentSlug, function (emailData) {
        customMethods.freeUpgrade(emailData[0].stuEmail, req.session.csStudentFirstName)
    })
    req.session.save(); // needed to save session states when updating vars through ajax

    res.send(subscription);
});

// router.post('/retry-invoice', async (req, res) => { // for payment failure, need to update new paymetn method
//     // Set the default payment method on the customer

//     try {
//       await stripe.paymentMethods.attach(req.body.paymentMethodId, {
//         customer: req.body.customerId,
//       });
//       await stripe.customers.update(req.body.customerId, {
//         invoice_settings: {
//           default_payment_method: req.body.paymentMethodId,
//         },
//       });
//     } catch (error) {
//       // in case card_decline error
//       return res
//         .status('402')
//         .send({ result: { error: { message: error.message } } });
//     }

//     const invoice = await stripe.invoices.retrieve(req.body.invoiceId, {
//       expand: ['payment_intent'],
//     });
//     res.send(invoice);
//   });







module.exports = router;