var express = require('express');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var cookieSession = require('cookie-session');
var bodyParser = require('body-parser');
var nunjucks = require('nunjucks');
var sql = require("sql");
var mysql = require('mysql');
var bcrypt = require('bcryptjs');

var app = express();


/**
 * You first need to create a formatting function to pad numbers to two digits…
 **/
function twoDigits(d) {
    if(0 <= d && d < 10) return "0" + d.toString();
    if(-10 < d && d < 0) return "-0" + (-1*d).toString();
    return d.toString();
}

/**
 * …and then create the method to output the date string as desired.
 * Some people hate using prototypes this way, but if you are going
 * to apply this to more than one Date object, having it as a prototype
 * makes sense.
 **/
Date.prototype.toMysqlFormat = function() {
    return this.getUTCFullYear() + "-" + twoDigits(1 + this.getUTCMonth()) + "-" + twoDigits(this.getUTCDate()) + " " + twoDigits(this.getUTCHours()) + ":" + twoDigits(this.getUTCMinutes()) + ":" + twoDigits(this.getUTCSeconds());
};

Date.createFromMysql = function(mysql_string)
{
    var dateParts = mysql_string.split("-");
    return new Date(dateParts[0], dateParts[1] - 1, dateParts[2].substr(0, 2), dateParts[2].substr(3, 2), dateParts[2].substr(6, 2), dateParts[2].substr(9, 2));
};

app.set('view engine', 'nunjucks');
var nEnv = nunjucks.configure('templates', {
    autoescape: true,
    noCache: true,
    express: app
});

app.use(cookieSession({
    name: 'session',
    keys: ['key1', 'key2']
}));

sql.setDialect('mysql');

var connection = mysql.createConnection({
    host     : 'localhost',
    user     : 'dev',
    password : 'pass',
    database : 'node_user_test'
});

connection.connect(function(err) {
    if (err) {
        console.error('error connecting: ' + err.stack);
        return;
    }

    console.log('connected as id ' + connection.threadId);
    app.locals.db = connection;
});

app.locals.sql = sql;

app.locals.isLoggedIn = function(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

app.locals.isNotLoggedIn = function(req, res, next) {
    if (!req.session.user) {
        next();
    } else {
        res.redirect('/');
    }
};

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static('public'));

require('./routes/index.js')(app);
require('./routes/account.js')(app);

var server = app.listen(process.env.PORT || 3000, function () {
    var host = server.address().address;
    var port = server.address().port;

    console.log('Example app listening at http://%s:%s', host, port);
});
