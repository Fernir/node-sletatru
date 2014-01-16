/*
 * interface.js: interaction with sletat.ru search
 *
 *
 * Copyright (c) 2014 Anton Parkhomenko
 * Licensed under the MIT license.
 */


'use strict';

var soap = require('soap');
var settings = require('../settings.json');
var url = 'http://module.sletat.ru/XmlGate.svc?singleWSDL';


function getSyncClient(callback, error) {
    soap.createClient(url, function (err, client) {
        if (!err) {
            client.addSoapHeader('<AuthInfo xmlns="urn:SletatRu:DataTypes:AuthData:v1">' +
                '<Login>' + settings.Login + '</Login>' +
                '<Password>' + settings.Password + '</Password>' +
                '</AuthInfo>');
            callback(client);
        } else {
            console.log("Client couldn't be created");
            error();
        }
    });
}

function getResults(requestId, callback) {
    getSyncClient(function (client) {
        client.GetRequestResult({requestId: requestId}, function (err, result) {
            var tours = result['GetRequestResultResult'];
            callback(tours);
        });
    });
}

function isProcessed(states) {
    for (var i = 0; i < states.length; i++) {
        if (states[i]['IsProcessed'] == 'false' && states[i]['IsError'] == 'false' && states[i]['IsSkipped'] == 'false') {
            return false;
        }
    }
    return true;
}

function checkStatus(requestId, callback, error) {
    getSyncClient(function (client) {
        var processed = false;

        function check(interval) {
            if (typeof interval != 'undefined') {
                clearTimeout(interval);
            }
            client.GetRequestState({requestId: requestId}, function (err, result) {
                if (!err) {
                    var states = result['GetRequestStateResult']['OperatorLoadState'];
                    processed = isProcessed(states);
                    if (!processed) {
                        interval = setTimeout(function () {
                            check(interval)
                        }, 1500);
                    } else {
                        if (states.length == 1 && states[0]['IsError'] == 'true') {
                            error(states[0]['ErrorMessage'])
                        }
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

module.exports = {
    getSyncClient: getSyncClient,
    getResults: getResults,
    checkStatus: checkStatus
};
