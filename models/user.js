/**
 * Created by emilyperegrine on 19/02/2016.
 */
module.exports = function (sql) {
    return sql.define({
        name: 'TBL_USERS',
        columns: ['id', 'email', 'password', 'reset_key', 'reset_key_exp_date']
    });
};