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

var credentials = require('../credentials.json');
var url = 'http://module.sletat.ru/XmlGate.svc?singleWSDL';


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
            console.log("Client couldn't be created")
            error();
        }
    });
}

function getResults(requestId, callback) {
    getSyncClient(function(client) {
        client.GetRequestResult({requestId: requestId}, function(err, result) {
            var tours = result['GetRequestResultResult']['Rows']['XmlTourRecord'].slice(0, 5);  // HOW TO GET IT?!
            callback(tours);
        });
    });
}

function checkResult(requestId, callback, error) {
    setTimeout(function() {
        getSyncClient(function(client) {
            client.GetRequestState({requestId: requestId}, function(err, result) {
                if (!err) {
                    var states = result['GetRequestStateResult']['OperatorLoadState'];
                    var toursCount = 0;
                    states.forEach(function(tourState) { toursCount = toursCount + Number(tourState['RowsCount']); });
                    if  (toursCount > 0) { callback(requestId); }
                } else { error(err); }
            });
        });
    }, 2000);   
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

server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());

server.post('/search', function (req, res, next) {
    var params = processSearchParams(req);

    createRequest(params, function(requestId) {
        checkResult(requestId, function(requestId) {
            getResults(requestId, function(tours) {
                res.send({requestId: tours});
            });
        }, function (err) {console.log("Can't check tour :( \n" + err)});
    });
    return next();
});

server.listen(8088, function () {
    console.log('%s listening at %s', server.name, server.url);
});
