/*
 * server.js: fire up module
 * 
 *
 * Copyright (c) 2014 Anton Parkhomenko
 * Licensed under the MIT license.
 */

'use strict';

var restify = require('restify');
var sletatru = require('./interface');
var utils = require('./utils');


// HTTP Server

var server = restify.createServer({
    name: 'SletatRuREST',
    version: '0.1.1'
});

server.pre(restify.pre.sanitizePath());     // trailing slashes
server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());


server.get('/:requestId/', function (req, res, next) {   // Django ResultsView
    var requestId = Number(req.params['requestId']);
    var start, end, page = Number(req.query.page);
    var celeryClient = utils.getCeleryClient();
    var redisClient = utils.getRedisClient();
    if (isNaN(page) || page == 1) {
        sletatru.checkStatus(requestId, function (requestId) {
            sletatru.getResults(requestId, function (tours) {
                if (tours['RowsCount'] == 0) {
                    res.send({
                        results: [],
                        count: 0
                    });
                } else {
                    var results = tours['Rows']['XmlTourRecord'].slice(0, 15);
                    res.send({
                        results: results,
                        count: tours['RowsCount']
                    });
                    celeryClient.call('api_ojas.tasks.save_tours_to_db', [results]);
                    tours['Rows']['XmlTourRecord'].forEach(function (tour) {
                        redisClient.rpush('search:' + String(tours['RequestId']), JSON.stringify(tour, null, 0));
                        redisClient.expire('search:' + String(tours['RequestId']), 1800)
                    });
                }
            });
        }, function (err) {
            console.log('CheckRequestResult error: \n' + err);
            res.send(new restify.InternalError('CheckRequestResult failed'));
        });
    } else {
        start = (page - 1) * 15;
        end = (page * 15) - 1;

        redisClient.lrange('search:' + requestId, start, end, function (err, rows) {
            var results = [];
            rows.forEach(function (row) {
                results.push(JSON.parse(row));
            });
            res.send({results: results});
            celeryClient.call('api_ojas.tasks.save_tours_to_db', [results]);
        });
    }
    return next();
});


server.listen(8002, function () {
    console.log('%s listening at %s', server.name, server.url);
});

