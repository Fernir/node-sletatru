/*
 * node-sletatru
 * 
 *
 * Copyright (c) 2014 Anton Parkhomenko
 * Licensed under the MIT license.
 */

'use strict';

var soap = require('soap');
var restify = require('restify');
var redis = require('redis');

var credentials = require('../credentials.json');
var url = 'http://module.sletat.ru/XmlGate.svc?singleWSDL';


function getRedisClient() {
    var port = credentials.redisPort || 6379;
    var host = credentials.redisHost || '127.0.0.1';
    var redis_client = redis.createClient(port, host);

    redis_client.on('error', function (err) {
        console.log('Redis error ): \n' + err);
    });

    return redis_client;
}

function processSearchParams(req) {
    // I don't know WTF, but ordering of params is important :/
    var params = {};
    params['countryId'] = Number(req.params['countryId']);
    params['cityFromId'] = Number(req.params['cityFromId']);
    params['cacheMode'] = 3; 
    return params;
}

function getSyncClient(callback, error) {
    soap.createClient(url, function(err, client) {
        if (!err) {
            client.addSoapHeader('<AuthInfo xmlns="urn:SletatRu:DataTypes:AuthData:v1">' +
                                    '<Login>' + credentials.Login + '</Login>' +
                                    '<Password>' + credentials.Password + '</Password>' +
                                 '</AuthInfo>');
            callback(client);
        } else { 
            console.log("Client couldn't be created");
            error();
        }
    });
}

function getResults(requestId, callback) {
    getSyncClient(function(client) {
        client.GetRequestResult({requestId: requestId}, function(err, result) {
            var tours = result['GetRequestResultResult'];
            callback(tours);
        });
    });
}

function isProcessed(states) {
    states.forEach(function(state) {
        if (state['IsProcessed'] == 'false' && state['IsError'] == 'false' && state['IsSkipped'] == 'false') {
            return false;
        }
    });
    return true;
}

function checkStatus(requestId, callback, error) {
    getSyncClient(function(client) {
        var processed = false;
        function check(interval) {
            if (typeof interval != 'undefined') {
                clearTimeout(interval);
            }
            client.GetRequestState({requestId: requestId}, function(err, result) {
                if (!err) {
                    var states = result['GetRequestStateResult']['OperatorLoadState'];
                    processed = isProcessed(states);
                    if (!processed) {
                        interval = setTimeout(function() {check(interval)}, 1500);
                    } else {
                        if (states.length == 1 && states[0]['IsError'] == 'true') { error(states[0]['ErrorMessage']) }
                        callback(requestId);
                    }
                } else {
                    error(err);
                }
            });
        }
        check();
    });
}

function createRequest (params, callback) {
    getSyncClient(function(client) {
        client.CreateRequest(params, function(err, result) {
            var requestId = result['CreateRequestResult'];
            callback(requestId);
        });
    });
}

var server = restify.createServer({
      name: 'SletatRuREST',
      version: '0.0.1'
});

server.pre(restify.pre.sanitizePath());     // trailing slashes

server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());


server.get('/:requestId/', function(req, res, next) {   // Django ResultsView
    var requestId = Number(req.params['requestId']);
    var start, end, page = Number(req.query.page);
    var redis_client = getRedisClient();
    if (!isNaN(page) && page != 1) {
        start = (page-1)*15;
        end = (page*15)-1;

        redis_client.lrange('search:'+requestId, start, end, function (err, rows) {
            var answer = [];
            rows.forEach(function (row) {
                answer.push(JSON.parse(row));
            });
            res.send({results: answer});
        });
    } else {
        checkStatus(requestId, function(requestId) {
            getResults(requestId, function(tours) {
                if (tours['RowsCount'] == 0) {
                    res.send({
                        results: [],
                        count: 0
                    });
                } else {
                    res.send({
                        results: tours['Rows']['XmlTourRecord'].slice(0, 15),
                        count: tours['RowsCount']
                    });
                    tours['Rows']['XmlTourRecord'].forEach(function(tour) {
                        redis_client.rpush('search:' + String(tours['RequestId']), JSON.stringify(tour, null, 0));
                        redis_client.expire('search:' + String(tours['RequestId']), 1800)
                    });
                }
            });
        }, function (err) {
            console.log('CheckRequestResult error: \n' + err);
            res.send(new restify.InternalError('CheckRequestResult failed'));
        });
    }
    return next(); 
});


server.listen(8002, function () {
    console.log('%s listening at %s', server.name, server.url);
});
