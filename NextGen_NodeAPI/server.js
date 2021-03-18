'use strict';
const express = require('express');
const cors = require('cors');
const app = express();                 

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



