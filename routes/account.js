var bcrypt = require('bcryptjs');
var sendgrid = require('sendgrid')("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");
var async = require('async');
var crypto = require('crypto');

module.exports = function (app) {
    var userModel = require("../models/user.js")(app.locals.sql);
    app.get('/login', app.locals.isNotLoggedIn,function (req, res) {
        console.log(req.session);
        res.render("login", {messages: req.session.messages});
        req.session.messages = null;
    });

    app.get('/register', app.locals.isNotLoggedIn,function (req, res) {
        res.render("register", {messages: req.session.messages});
        req.session.messages = null;
    });

    app.post('/login', app.locals.isNotLoggedIn,function (req, res) {
        if (req.body.password && req.body.email) {
            e = req.body.email;
            p = req.body.password;
            getPassQs = userModel.select(userModel.star()).from(userModel).where(userModel.email.equals(e)).toQuery();
            app.locals.db.query(getPassQs.text, getPassQs.values, function (err, rows) {
                if (err) {
                    req.messages = [{type: "danger", content: "Error logging in"}];
                    res.redirect('/login');
                    console.error(err.stack);
                } else {
                    bcrypt.compare(p, rows[0].password, function(err, result) {
                        if (result) {
                            req.session.messages = [{type: "success", content: "Successfully Logged In"}];
                            req.session.user = rows[0];
                            res.redirect("/");
                        } else {
                            req.session.messages = [{type: "danger", content: "Incorrect email/ and or password"}];
                            res.redirect("/login");
                        }
                    });
                }
            });
        } else {
            req.messages = [{type: "danger", content: "Error logging in"}];
            res.redirect('/login');
        }
    });

    app.post('/register', app.locals.isNotLoggedIn, function (req, res) {
        console.log("register");
        if (req.body.password == req.body.passwordConf && req.body.password.length > 4) {
            bcrypt.genSalt(10, function(err, salt) {
                if (err) {console.error(err)}
                bcrypt.hash(req.body.password, salt, function(err, hash) {
                    if (err) {
                        console.error(err);
                        res.render('register', {messages: [{type: "danger", content: "Error hashing account"}]});
                    } else {
                        qs = userModel.insert(
                            userModel.email.value(req.body.email),
                            userModel.password.value(hash)
                        ).toQuery();
                        console.log(qs.text + " " + qs.values);
                        app.locals.db.query(qs.text, qs.values, function (err, rows) {
                            if (err) {
                                req.session.messages = [{type: "danger", content: "Error creating account"}];
                                res.redirect('/register');
                                console.error(err.stack);
                            } else {
                                req.session.messages = [{type: "success", content: "Succesfully created account"}];
                                res.redirect('/login');
                            }
                        });
                    }
                });
            });
        } else {
            res.render('register',{messages: [{type: "danger", content: "Passwords do not match"}]});
        }

    });

    app.get('/logout', app.locals.isLoggedIn, function (req, res) {
        req.session.user = null;
        res.redirect("/login");
    });

    app.get('/forgot-password', app.locals.isNotLoggedIn, function (req, res) {
        res.render("forgot_password", {messages: req.session.messages});
        req.session.messages = null;
    });

    app.post('/forgot-password', app.locals.isNotLoggedIn, function (req, res) {
        async.waterfall([
            function(done) {
                crypto.randomBytes(20, function(err, buf) {
                    var token = buf.toString('hex');
                    done(err, token);
                });
            },
            function (token, done) {
                userQs = userModel.select(userModel.star()).from(userModel).where(userModel.email.equals(req.body.email)).toQuery();
                app.locals.db.query(userQs.text, userQs.values, function (err, rows) {
                    var u = rows[0];
                    if (err) {
                        done(err);
                    }

                    var resetPasswordToken = token;
                    var resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour

                    console.log(typeof resetPasswordExpires);

                    tokenQs = userModel.update({
                        reset_key: resetPasswordToken,
                        reset_key_exp_date: resetPasswordExpires.toMysqlFormat()
                    }).where(userModel.id.equals(u.id)).toQuery();

                    console.log(tokenQs);

                    app.locals.db.query(tokenQs.text, tokenQs.values, function (err, rows2) {
                        if (err) {
                            done(err)
                        } else {
                            console.log(token);

                            var email = new sendgrid.Email({
                                to: rows[0].email,
                                from: 'passwordreset@demo.com',
                                subject: 'Node.js password reset',
                                text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
                                'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
                                'http://' + req.headers.host + '/reset/' + token + '\n\n' +
                                'If you did not request this, please ignore this email and your password will remain unchanged.\n'
                            });

                            sendgrid.send(email, function(err, json) {
                                if (err) {
                                    req.session.messages = [{ type: 'danger', content: 'There was an error sending the reset email.'}];
                                    console.log("error sending email"); done(err);
                                } else {
                                    req.session.messages = [{ type: 'info', content: 'An e-mail has been sent to ' + rows[0].email + ' with further instructions.'}];
                                    return res.redirect('/');
                                }

                            });
                        }
                    })
                });
            }
        ], function (err) {
            if (err) {
                console.error(err);
                req.session.messages = [{ type: 'danger', content: 'There was an error setting up the reset system'}];
                res.redirect('/forgot-password');
            }
        });
    });

    app.get('/reset/:token', app.locals.isNotLoggedIn, function (req, res) {
        tokenQs = userModel.select(userModel.star()).from(userModel).where(userModel.reset_key.equals(req.params.token)).toQuery();
        app.locals.db.query(tokenQs.text, tokenQs.values, function (err, rows) {
            u = rows[0];
            if (u) {
                if (Date.now() < u.reset_key_exp_date.getTime()) {
                    res.render('reset');
                } else {
                    req.session.messages = [{ type: 'danger', content: 'Reset token has expired'}];
                    res.redirect('/forgot-password');
                }
            }
            else {
                req.session.messages = [{ type: 'danger', content: 'Invalid reset token'}];
                res.redirect('/forgot-password');
            }
        });
    });

    app.post('/reset/:token', app.locals.isNotLoggedIn, function (req, res) {
        console.log("reset post");
        tokenQs = userModel.select(userModel.star()).from(userModel).where(userModel.reset_key.equals(req.params.token)).toQuery();
        app.locals.db.query(tokenQs.text, tokenQs.values, function (err, rows) {
            u = rows[0];
            if (u) {
                if (Date.now() < u.reset_key_exp_date.getTime()) {
                    if (req.body.password == req.body.passwordConf && req.body.password.length > 4) {
                        //Change pass
                        bcrypt.genSalt(10, function(err, salt) {
                            if (err) {console.error(err);}
                            bcrypt.hash(req.body.password, salt, function(err, hash) {
                                console.log("Hash = " + hash);

                                if (err) {
                                    console.error(err);
                                    req.session.messages = [{ type: 'danger', content: 'Error securely storing password'}];
                                    res.redirect('/reset/' + token);
                                } else {
                                    console.log("updating password");
                                    passUpdateQs = userModel.update({
                                        reset_key: undefined,
                                        reset_key_exp_date: undefined,
                                        password: hash
                                    }).where(userModel.id.equals(u.id)).toQuery();

                                    app.locals.db.query(passUpdateQs.text, passUpdateQs.values, function (err, response) {
                                       if (err) {
                                           console.error(err);
                                           req.session.messages = [{ type: 'danger', content: 'Reset token has expired'}];
                                           res.render('reset', {messages: req.session.messages});
                                       } else {

                                           var email = new sendgrid.Email({
                                               to: u.email,
                                               from: 'passwordreset@demo.com',
                                               subject: 'Your password has been changed',
                                               text: 'Hello,\n\n' +
                                               'This is a confirmation that the password for your account ' + u.email + ' has just been changed.\n'
                                           });

                                           sendgrid.send(email, function(err, json) {
                                               if (err) { return console.error(err); }
                                               req.flash('success', 'Your password has been changed!');
                                               done(err, 'done');
                                           });

                                           console.log("success");
                                           req.session.messages = [{ type: 'success', content: 'Successfully changed password'}];
                                           res.redirect('/login');
                                       }
                                    });
                                }
                            });
                        });
                    } else {
                        req.session.messages = [{ type: 'danger', content: 'Passwords do not match or are too short'}];
                        res.render('reset', {messages: req.session.messages});
                        console.log(req.body.password + " | Conf = " + req.body.passwordConf);
                    }
                } else {
                    req.session.messages = [{ type: 'danger', content: 'Reset token has expired'}];
                    res.redirect('/forgot-password');
                }
            }
            else {
                req.session.messages = [{ type: 'danger', content: 'Invalid reset token'}];
                res.redirect('/forgot-password');
            }
        });
    });

    app.get('/profile', function (req, res) {
       res.render('profile', {user: req.session.user, messages: req.session.messages});
    });
};