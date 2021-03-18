'use strict';
const express = require('express');
const cors = require('cors');
const app = express();                 

app.use(function (req, res, next) {
    /*
    console.log("Setting headers");
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader("Access-Control-Allow-Origin", '*');
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Origin,Accept,X-USER,Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    */
    next();
})

app.use(cors());

app.get('/api/v1/widgets', function (req, res, next) {
    res.status(200).json([{ id: 1, name: 'foo', type: 'Standard' }, { id: 2, name: 'bar', type: 'Standard' }]);
});

app.post('/api/v1/widgets', function (req, res, next) {
    res.status(200).send();
});

app.delete('/api/v1/widgets', function (req, res, next) {
    res.status(200).send();
});

app.get('/api/v1/widgets/1', function (req, res, next) {
    res.status(200).json({ id: 1, name: 'foo', type: 'Standard' });
});

app.put('/api/v1/widgets/1', function (req, res, next) {
    res.status(200).send();
});

app.delete('/api/v1/widgets/1', function (req, res, next) {
    res.status(200).send();
});



