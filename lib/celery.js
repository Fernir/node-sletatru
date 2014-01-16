var celery = require('node-celery');

var BROKER_URL = require('../credentials.json').brokerURL;


var client = celery.createClient({
    CELERY_BROKER_URL: BROKER_URL,
    CELERY_RESULT_BACKEND: 'redis'
});

client.on('error', function(err) {
    console.log(err);
});


exports.celeryClient = client;

