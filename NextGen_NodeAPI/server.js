'use strict';
var http = require('http');
var AWS = require("aws-sdk")
const express = require('express')
const cors = require('cors')
const app = express()

var sub = "";
var id = 0;

AWS.config.update({ endpoint: "https://dynamodb.eu-west-1.amazonaws.com" });

var dynamodb = new AWS.DynamoDB({ region: 'eu-west-1' });
var docClient = new AWS.DynamoDB.DocumentClient({ service: dynamodb });

app.use(function (req, res, next) {
    res.header('Content-Type', 'application/json');
    next();
});

app.use(cors());
app.use(express.urlencoded());
app.use(express.json());


app.options('*', cors());

app.get('/api/v1/users', cors(), function(req, res, next) {

    sub = req.query.sub;

    if (sub === undefined) {
        outputError(res, 400, "1", "missing identifier","The sub parameter was not provided");
    }

    console.log("About to call getIDFromSub");
    getIdFromSub(function (error, item) {
        if (error) {
            console.log("getIDFromSub is in error");
            console.log(error);
            outputError(res, 404, "2", "Error getting user ID", error.desc);                        
        }
        else {
            console.log("getIDFromSub was successful");
            if (item === undefined) {
                console.log("No Record returned")
                outputError(res, 404, "4", "No record found", "A user with the specified alias does not exist");
            }
            else {
           
                console.log(item.id);
                id = item.id;

                console.log("About to call getUser");
                getUser(function (error, item) {
                    if (error) {
                        console.log("getUser is in error");
                        outputError(res, 404, "3", "Error getting user details", error.desc);  
                        console.log(error);
                    }
                    else {
                        console.log("getUser was successful");
                        console.log(item.name);

                        res.status(200).send(JSON.stringify(item));

                    }

                });
            }

        }
    });


});

app.post('/api/v1/users', cors(), function (req, res, next) {

    var email = req.body.emailaddress;
    var fullname = req.body.fullname;
    var tenant = req.body.tenant;

    console.log(email + " " + fullname + " " + tenant);

    res.status(200).send();

});


function outputError(res, status, code, short, desc) {

    var body = {
        code: code,
        short: short,
        description: desc
    };

    res.status(status).send(JSON.stringify(body));

}


function getIdFromSub(callback) {

    console.log("Entering getIDFromSub");
    var params = {
        TableName: "KFPNextGenUsers",
        IndexName: "sub-index",
        KeyConditionExpression: "#sub = :xxx",
        ExpressionAttributeNames: {
            "#sub": "sub"
        },
        ExpressionAttributeValues: {
            ":xxx": sub
        }
    };

    console.log("Preparing to run query");
    docClient.query(params, function (err, data) {        
        if (err) {
            console.log("Query in in error");
            callback(err)

        } else {
            console.log("Query succeeded.");
            var item = data.Items[0];
            console.log("Query result: " + JSON.stringify(item, null, 2));                     
            callback(null,item);
        }

    });

    console.log("Leaving getIDFromSub");

};

function getUser(callback) {

    console.log("Entering getUser")

    var params = {
        TableName: "KFPNextGenUsers",
        KeyConditionExpression: "#id = :n",
        ExpressionAttributeNames: {
            "#id": "id"
        },
        ExpressionAttributeValues: {
            ":n": id
        }
    };

    docClient.query(params, function (err, data) {
        if (err) {
            console.log("Query in in error");
            callback(err)
        } else {
            console.log("Query succeeded.");
            var item = data.Items[0];
            console.log("Query result: " + JSON.stringify(item, null, 2));
            callback(null, item);
        }
    });

    console.log("Leaving getUser");

};

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`server running on port ${PORT}`)
});



