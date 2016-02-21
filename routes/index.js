module.exports = function (app) {
    app.get('/', function (req, res) {
       res.render("index", {user: req.session.user, messages: req.session.messages});
       req.session.messages = null;
    });
};