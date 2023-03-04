# Culturestride

Culturestride was an online language learning platform teaching Mandarin Chinese operational between 2019 - 2023. This is the underlying source code with only certain sensitive information removed. We hope this is helpful for other builders in the space.

This is an [internet archive version](https://web.archive.org/web/20230227115913/https://culturestride.com/) of the final version of the site before we shut it down.

## Application Technology Stack
### Backend
This is an [Express](https://expressjs.com/) web app built on Node.js connecting to a MySQL backend database. The web app is hosted on Amazon Web Services (AWS) using [AWS Elastic Beanstalk](https://aws.amazon.com/elasticbeanstalk/), our MySQL database is also hosted on AWS. We are also using [AWS S3 Object Storage](https://aws.amazon.com/s3/) to store files (user uploaded attachments and images).
#### File structure
|Name|Description|
|---|---|
|.ebextensions|These are custom config files which affects our AWS Elastic Beanstalk instance. The files here have no impact on your local debug environment|
|node_modules|These are your local node modules. You can add and remove these by running npm install and npm uninstall|
|public|This includes all files intended to be publically accessible (e.g. css and img files). ".well-known" in this folder is used for SSL validation.|
|routes|Includes index.js which handles all get and post routes|
|views|Includes all .ejs views that act as our HTML website templates|
|.npmrc|This is needed to override some aspect of server start processes in AWS and was necessary to get bcrypt working (I think)|
|app.js|main app file which defines how the server starts|
|custom.js|All custom javasript methods (outside of the front end) are placed here (e.g. email methods). This is done purely for organisational purposes.|
|db.js|Database methods and connection params|
|iam_policy.json|Identity management files|
|npm-shrinkwrap.json|Npm files|
|package.json|Defines what npm modules are required in the app to run so that when you run npm install it will install these specific modules|

### Database (db.js)
All of our database methods are defined in db.js. If you wish to use a database call, you must first define the database method in db.js and then add the db.js file route to the .js file that you're trying to call the method in by using "var dbjsMethods = require("../db.js");"

There are 5 types of database functions that we use, these are the templates for each (modify as you need). They all basically dynamically create MySQL database queries:

*select*
```javascript
    someMethodName: function (callback) {
        conn.query('SELECT * FROM applicant ORDER BY aID DESC LIMIT 1',
            function (err, results, fields) {
                if (err) throw err;
                return callback(results);
            })
    },
```
*insert*
```javascript
    someMethodName: function (someVar1, someVar2) {
        conn.query('INSERT INTO application (someColumnName1,someColumnName2)' +
            'VALUES (\'' + someVar1 + '\',\'' + someVar2 + '\')',
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
```
*update*
```javascript
    someMethodName: function (someVar1, someVar2) {
        conn.query('UPDATE application SET someColumnName = ' + someVar1 + ' where someVar2 = ' + someVar2 + ';',
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
```
*delete*
```javascript
    someMethodName: function (someVar1) {
        conn.query('DELETE from application where someVar1 = ' + someVar1 + ';',
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
```
*database setting manipulation*
```javascript
    someMethodName: function () {
        conn.query('SET FOREIGN_KEY_CHECKS=0;',
            function (err, results, fields) {
                if (err) throw err;
                else console.log('Updated ' + results.affectedRows + ' row(s).');
            });
    },
```
### Frontend
The front end framework is built using [Embedded JavaScript templates](https://ejs.co/). EJS works to populate data into HTML using the <%- %> tag (to display the data) and the <% %> (to run javascript logic - don't display data).

*Using <%- %>:*
```javascript
<%- application[0].firstName %>
```

This will print the "firstName" variable in the application[0] array object assuming that you have passed an application data object into the ejs page.

*Using <% %>:*
```javascript
<% for (var i = 0 ; i < 10 ; i++ ) { %>
  // do something - can print html or data or anything really
<% } %>
```

This will create a javascript loop that can print or run logic dynamically in the HTML.

**How to pass data to the .ejs view file**
```javascript
dbjsMethods.getURLforSocietyLink(req.session.eID, function (urlData) {
    res.render('pages/societyLink', {
        url: urlData,
        someVariable: someVariableData
    });
});
```
The dbjsMethods line runs a database query as defined by method "getURLforSocietyLink" and returns query data into an object "urlData". What data this db method returns is defined in db.js as "getURLforSocietyLink".
In db.js:
```javascript
getURLforSocietyLink: function (eID, callback) {
    conn.query('SELECT url FROM applicationform where eID = ' + eID + ';',
        function (err, results, fields) {
            if (err) throw err;
            return callback(results);
        })
},
```
The MySQL query that is run is "SELECT url FROM applicationform where eID = ***some eID***;" and this data is then stored and accessible in urlData.

res.render is then called which tells the app to render the ejs file societyLink.ejs in the pages folder **and** pass the urlData object accessible under the variable "url".

Afterwards, you will be able to access the urlData data using EJS notation and the variable url.

*In societyLink.ejs:*
```javascript
<%- url[0].url %>
```
This will print the datafield name "url" from the first row (0) of the urlData object which is stored in the "url" variable.

### CSS
We use the [Materialize CSS](http://materializecss.com/) framework (open to changing this in the future) to easily template and configure the look of the app. If you wish to make your own custom changes, make them in style.css in the public/css folder.

The real materialise.css file that we get our css templates from is hosted online (it's pinged via an href link tag in layout.ejs and blanklayout.ejs) and is NOT the materialize.css file in the public/css folder. Therefore any modifications in materialize.css will not be reflected in the app.

The purpose of the local materialize.css file is so that the app doesn't become fucked when we build offline and we may not have connection to the internet to call the online materialize.css file.