'use strict';
var http = require('http');
var AWS = require("aws-sdk")
const AmazonCognitoIdentity = require('amazon-cognito-identity-js-with-node-fetch')
const CognitoUserPool = AmazonCognitoIdentity.CognitoUserPool
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const app = express()
const fetch = require('node-fetch')
const uuidv4 = require('uuid/v4')
const PORT = 3000;

var sub = "";
var id = 0;
var email = "";
var fullname = "";
var tenant = "";

AWS.config.update({ endpoint: "https://dynamodb.eu-west-1.amazonaws.com" });

var dynamodb = new AWS.DynamoDB({ region: 'eu-west-1' });
var docClient = new AWS.DynamoDB.DocumentClient({ service: dynamodb });

app.use(function (req, res, next) {
    res.header('Content-Type', 'application/json');
    next();
});

app.use(cors());
app.use(bodyParser.json());                        

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


app.get('/api/v1/tenants', cors(), function (req, res) {

    id = req.query.id;

    if (id === undefined) {
        outputError(res, 400, "1", "missing identifier", "The tenant ID was not provided");
        return false;
    }

    console.log(req.header.x-tenant);
    var xtenant = req.header("x-tenant");

    if (isNaN(xtenant) {
        outputError(res, 400, "1", "missing identifier", "The X-tenant header was not provided");
        return false;
    }

    if (xtenant != id) {
        outputError(res, 400, "1", "Tenancy mis-match", "You are attempting to retrieve data from a tenancy other than your own");
        return false;
    }


    getTenant(id, function (error, item) {
        if (error) {
            outputError(res, 404, "8", "Error getting Data", error.desc);
        }
        else {
            res.status(200).send(JSON.stringify(item));
        }

    });

});


app.post('/api/v1/users', cors(), function (req, res, next) {

    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

    console.log("Getting body values");
    console.log("Inbound Request: " + req.body);
    
    try {
        email = req.body.emailaddress;
        fullname = req.body.fullname;
        tenant = req.body.tenant;
    }
    catch(err)
    {
        outputError(res, 400, "7", "Error adding user to the directory", err.message);
        return false;
    }

    console.log(email + " " + fullname + " " + tenant);

    addUserToCognito(function (error, item) {
        if (error) {
            console.log("Couldn't add user to Cognito");
            console.log(error);
            outputError(res, 400, "5", "Error adding user to the directory", error.message);
        }
        else {
            console.log("User added to Cognito successfully");
            sub = item.User.Username;
            var userid = uuidv4();

            addUser(userid, function (error, item) {
                if (error) {
                    console.log("Couldn't add user to DynamoDB");
                    console.log(error);
                    outputError(res, 400, "6", "Error adding user to the database", error.message);
                }
                else {
                    console.log("User added to DynamoDB successfully");
                    res.status(200).send("{ 'KFP Database ID' : '" + userid + "', 'Directory ID': '" + sub + "'}");
                }
            });                        
        }
    });   

});

function addUserToCognito(callback) {

    const poolData = {
        UserPoolId: "eu-west-1_2DtCcoypN",    
        ClientId: "57vo0lcv2gq0822td26v9nhnh6"
    }; 

    AWS.config.update({ endpoint: "cognito-idp.eu-west-1.amazonaws.com" });
    AWS.config.region = 'eu-west-1';
    const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

    var params = {
        UserPoolId: 'eu-west-1_2DtCcoypN',
        Username: email, 
        DesiredDeliveryMediums: [
            'EMAIL'            
        ],
        UserAttributes: [
            {
                Name: 'email', /* required */
                Value: email
            },
            
            {
                Name: 'custom:tenant',
                Value: tenant
            }
            
        ]
    };

    var cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider();
    cognitoidentityserviceprovider.adminCreateUser(params, function (err, data) {
        if (err) {
            console.log(err);
            callback(err);
        }

        console.log('user name is ' + JSON.stringify(data));
        callback(null, data);


    });


    /*
    var attributeList = [];
    attributeList.push(new AmazonCognitoIdentity.CognitoUserAttribute({ Name: "email", Value: email }));
    attributeList.push(new AmazonCognitoIdentity.CognitoUserAttribute({ Name: "custom:tenant", Value: tenant }));

    cogSP.

    userPool.signUp(email, 'SamplePassword_123', attributeList, null, function (err, result) {
        if (err) {
            console.log(err);
            callback(err);
        }

        var cognitoUser = result.user;
        console.log('user name is ' + cognitoUser.getUsername());
        callback(null, cognitoUser.getUsername());

    });
    */   

}



function outputError(res, status, code, short, desc) {

    var body = {
        code: code,
        short: short,
        message: desc
    };

    res.status(status).send(JSON.stringify(body));

}


function getIdFromSub(callback) {

    console.log("Entering getIDFromSub");

    AWS.config.update({ endpoint: "https://dynamodb.eu-west-1.amazonaws.com" });

    var params = {
        TableName: "KFPNGUsers",
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

    console.log("Entering getUser");

    AWS.config.update({ endpoint: "https://dynamodb.eu-west-1.amazonaws.com" });

    var params = {
        TableName: "KFPNGUsers",
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


function getTenant(id, callback) {

    console.log("Entering getTenant");

    AWS.config.update({ endpoint: "https://dynamodb.eu-west-1.amazonaws.com" });

    var params = {
        TableName: "KFPNGTenantData",
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

    console.log("Leaving getTenant");

};


function addUser(userid, callback) {

    console.log("Entering addUser");

    AWS.config.update({ endpoint: "https://dynamodb.eu-west-1.amazonaws.com" });
    var ddb = new AWS.DynamoDB({ apiVersion: '2012-08-10' });

    var params = {
        TableName: "KFPNGUsers",
        Item: {
            'id': { S: userid},
            'name': { S: fullname },
            'sub': { S: sub },
            'tenant': { S: tenant },
        }
    };

    ddb.putItem(params, function (err, data) {
        if (err) {
            console.log("Query in in error");
            callback(err)
        } else {
            console.log("Query succeeded.");
            console.log(JSON.stringify);
            callback(null, data);
        }
    });

    console.log("Leaving addUser");

};



app.listen(PORT, () => {
    console.log(`server running on port ${PORT}`)
});



