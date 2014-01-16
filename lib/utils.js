/*
 * utils.js: specific utils
 * 
 *
 * Copyright (c) 2014 Anton Parkhomenko
 * Licensed under the MIT license.
 */

'use strict';

var celery = require('node-celery');
var redis = require('redis');

var settings = require('../settings.json');


function getCeleryClient() {
    var client = celery.createClient({
        CELERY_BROKER_URL: settings.BROKER_URL,
        CELERY_RESULT_BACKEND: 'redis'
    });
    
    client.on('error', function (err) {
        console.log('Celery error ): \n' + err);
    });
    
    return client
}


function getRedisClient() {
    var port = settings.redisPort || 6379;
    var host = settings.redisHost || '127.0.0.1';
    var client = redis.createClient(port, host);

    client.on('error', function (err) {
        console.log('Redis error ): \n' + err);
    });

    return client;
}


module.exports = {
    getCeleryClient:  getCeleryClient,
    getRedisClient: getRedisClient
};

