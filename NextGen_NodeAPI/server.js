'use strict';
var http = require('http');
var https = require('https');
var AWS = require("aws-sdk");
var atob = require('atob');
var jwkToPem = require('jwk-to-pem');
var jwtLib = require('jsonwebtoken');
const AmazonCognitoIdentity = require('amazon-cognito-identity-js-with-node-fetch')
const CognitoUserPool = AmazonCognitoIdentity.CognitoUserPool
const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const app = express()
const fetch = require('node-fetch')
const uuidv4 = require('uuid/v4')
const PORT = 3000;

var sub = "";
var id = 0;
var email = "";
var fullname = "";
var tenant = "";
var phone = "";

AWS.config.update({ endpoint: "https://dynamodb.eu-west-1.amazonaws.com" });

AWS.config.apiVersions = {
    cognitoidentityserviceprovider: '2016-04-18',
    // other service API versions
};

var dynamodb = new AWS.DynamoDB({ region: 'eu-west-1' });
var docClient = new AWS.DynamoDB.DocumentClient({ service: dynamodb });

var jsonParser = bodyParser.json();

app.use(bodyParser.json());                        

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

app.get('/api/v1/helloworld', function (req, res, next) {

    var accesstoken = req.header("Authorization");
    console.log(".");
    console.log("##### AUTH DEMO BACKEND SERVICE - VERIFY A JWT TOKEN #####");
    console.log(".");
    console.log("Access Token from Authorization Header: " + accesstoken);
    console.log(".");

    var jwt = decodeToken(accesstoken);
    var kid = jwt.header.kid;
    console.log("Kid: " + kid);
    console.log(".");
    console.log("Getting JWKS from https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_2DtCcoypN/.well-known/jwks.json");
    console.log(".");

    var key;
    getKey(kid, function (item) {        
        key = item;
        console.log("Key Found: " + JSON.stringify(key));
        console.log(".");
        console.log("Generating PEM file from Key");
        console.log(".");
        var pem = jwkToPem(key);

        console.log("Verifying the JWT");
        console.log(".");
        try {
            var decoded = jwtLib.verify(accesstoken, pem)
            console.log("JWT Verified! Decoded token: " + JSON.stringify(decoded));
            console.log(".");
            console.log("User: " + decoded.sub);
            console.log(".");
            console.log("Returning a Status 200");
            res.status(200).send("All good! Here's some data");

        }
        catch (err) {
            console.log("Verification Error: " + err);
            console.log(".");
            console.log("Returning a Status 401");
            res.status(401).send("Invalid Token");
        }                         

    });
    

});

function decodeToken(token) {
    try {

        console.log("Decoding Token");
        console.log(".");
        const base64HeaderUrl = token.split('.')[0];
        const base64Header = base64HeaderUrl.replace('-', '+').replace('_', '/');
        const headerData = JSON.parse(atob(base64Header));

        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace('-', '+').replace('_', '/');
        var tokenData = JSON.parse(atob(base64));
        tokenData.header = headerData;

        return tokenData;

    } catch (e) {
        console.log("Token Parsing failed: " + e);
        throw e;
    }

}

function getKey(kid, callback) {

    callForKeys(function (result) {

        if (result != null) {        

            console.log("Web Key Set returned from AWS. Searching for matching key");
            console.log(".");

            var jsonRes = JSON.parse(result);
            var i;        
            for (i = 0; i < jsonRes.keys.length; i++) {

                if (jsonRes.keys[i].kid == kid) {
                    console.log("Key found!");
                    console.log(".");
                    callback(jsonRes.keys[i]);
                }
            }
        }

    });

}

async function callForKeys(callback) {

    https.get('https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_2DtCcoypN/.well-known/jwks.json', (resp) => {
        let data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });
        
        resp.on('end', () => {
            callback(data);
        });

    }).on("error", (err) => {
        console.log("Error: " + err.message);
    });

}


app.get('/api/v1/users', function(req, res, next) {

    sub = req.query.sub;

    if (sub === undefined) {
        outputError(res, 400, "1", "missing identifier","The sub parameter was not provided");
    }

    console.log("About to call getUserIdFromSub");
    getUserIdFromSub(function (error, item) {
        if (error) {
            console.log("getUserIdFromSub is in error");
            console.log(error);
            outputError(res, 404, "2", "Error getting user ID", error.desc);                        
        }
        else {
            console.log("getUserIdFromSub was successful");
            if (item === undefined) {
                console.log("No Record returned")
                outputError(res, 404, "4", "No record found", "A user with the specified alias does not exist");
            }
            else {
           
                console.log(item.id);
                id = item.id;

                console.log("About to call getUser");
                getUser(id, function (error, item) {
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

app.put('/api/v1/users/me/mfa', function (req, res) {

    sub = req.header("X-USER");
    console.log("X-USER: " + sub);

    var phoneNumber = req.query.phone_number;
    var mfa_enabled = req.query.mfa_enabled;

    console.log("Phone number: " + phoneNumber);


    if (sub == undefined) {
        outputError(res, 400, "1", "missing information", "The User was not passed from the directory");
    }

    cognitoListUsers(sub, function (err, result) {
        if (err) {
            console.log("cognitoListUsers is in error: " + err);
            outputError(res, 400, "3", "Error Listing users in Cognito", err.desc);
        }
        else {
            var res2 = result.split(";");
            cognitoUpdatePhone(res2[0], res2[1], phoneNumber, function (err2, response) {
            if (err2) {
                console.log("cognitoUpdatePhone is in error: " + err2);
                outputError(res, 400, "3", "Error updating Phone Number Status", err2.desc);
            }
                else {

                cognitoSetMFAStatus(result, mfa_enabled, function (error, response) {
                    if (error) {
                        console.log("cognitoSetMFAStatus is in error: " + error);
                        outputError(res, 400, "3", "Error updating MFA Status", error.desc);
                    }
                    else {
                        res.status(200).send();
                    }
                });

            }

            });

        }

    });
});

app.get('/api/v1/users/me/mfa', cors(), function (req, res, next) {

    sub = req.header("X-USER");
    console.log("X-USER: " + sub);
    var key = req.header("Authorization");
    console.log("Authorization: " + key);


    if (sub == undefined) {
        outputError(res, 400, "1", "missing information", "The User was not passed from the directory");
    }

    cognitoListUsers(sub, function (err, result) {
        if (err) {
            console.log("cognitoListUsers is in error: " + err);
            outputError(res, 404, "3", "Error Listing users in Cognito", err.desc);
        }
        else {

            getCognitoUserData(result, function (error, item) {
                if (error) {
                    console.log("getCognitoUserData is in error: " + error);
                    outputError(res, 404, "3", "Error getting user details from Cognito", error.desc);
                }
                else {

                    if (item == null) {
                        outputError(res, 404, "3", "Could not find user record in Cognito");
                        console.log("Item is null");
                    }
                    else {
                        console.log("getCognitoUserData was successful");
                        console.log(item.Username);

                        var mfa = item.PreferredMfaSetting;
                        var userAtts = item.UserAttributes;
                        var phone = getPhoneNumber(userAtts);

                        var ret = "";

                        ret = {
                            "mfa_enabled": !(mfa === undefined),
                            "phone_number": phone
                        };

                        console.log("Returning Payload: " + ret);

                        res.status(200).send(JSON.stringify(ret));
                    }

                }
            });

        }

    });


});

function getPhoneNumber(atts) {

    console.log(atts);

    try {
        for (var key in atts) {
            if (atts[key] != null) { 
                console.log(key + " -> " + atts[key].Name + " : " + atts[key].Value);
                if (atts[key].Name == "phone_number") {
                    return atts[key].Value;
                }
            }
        }
        return "";
    }
    catch (e) {
        return "";
    }

}

app.get('/api/v1/users/me', cors(), function (req, res, next) {

    sub = req.header("X-USER");
    console.log("X-USER: " + sub);

    if (sub == undefined) {
        outputError(res, 400, "1", "missing information", "The User was not passed from the directory");
        return false;
    }

    console.log("About to call getUserIdFromSub");
    getUserIdFromSub(function (error, item) {
        if (error) {
            console.log("getUserIdFromSub is in error");
            console.log(error);
            outputError(res, 404, "2", "Error getting user ID", error.desc);
        }
        else {
            console.log("getUserIdFromSub was successful");
            if (item === undefined) {
                console.log("No Record returned")
                outputError(res, 404, "4", "No record found", "A user with the specified alias does not exist");
            }
            else {

                console.log(item.id);
                id = item.id;

                console.log("About to call getUser");
                getUser(id, function (error, item) {
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
    console.log("ID: " + id);

    if (id == undefined) {
        outputError(res, 400, "1", "missing identifier", "The tenant ID was not provided");
        return false;
    }

    sub = req.header("X-USER");
    console.log("X-USER: " + sub);

    if (sub == undefined) {
        outputError(res, 400, "1", "missing information", "The User was not passed from the directory");
        return false;
    }

    console.log("About to call getUserIdFromSub");
    getUserIdFromSub(function (error, item) {
        if (error) {
            console.log("getUserIdFromSub is in error");
            console.log(error);
            outputError(res, 404, "2", "Error matching the ID of the user from the Directory identifier provided", error.desc);
            return false;
        }
        else {
            console.log("getUserIdFromSub was successful");
            if (item === undefined) {
                console.log("No Record returned")
                outputError(res, 404, "4", "No record found", "A user with the specified alias does not exist");
                return false;
            }
            else {

                console.log("About to call getUser");
                getUser(item.id, function (error, item2) {
                    if (error) {
                        console.log("getUser is in error");
                        outputError(res, 404, "3", "Error getting user details", error.desc);
                        console.log(error);
                        return false;
                    }
                    else {
                        console.log("getUser was successful");

                        if (item2 == undefined) {
                            outputError(res, 404, "9", "Missing Information", "User record cannot be found");
                            return false;
                        }                      

                        console.log(item2.tenant);
                        tenant = item2.tenant;

                        if (tenant === undefined) {
                            outputError(res, 404, "9", "Missing Information", "The user is not associated with a Tenant");
                            return false;
                        }

                        console.log("Comparing: Tenant: " + tenant + " with ID: " + id);

                        if (tenant != id) {
                            outputError(res, 401, "10", "Unauthorized", "Attempting to retrieve data from a tenant the user does not belong to");
                            return false;
                        }

                        console.log("About to call getTenant");
                        getTenant(tenant, function (error, item3) {
                            if (error) {
                                outputError(res, 404, "8", "Error getting Data", error.desc);
                                return false;
                            }
                            else {
                                console.log("Success: " + item3);
                                res.status(200).send(JSON.stringify(item3));
                            }

                        });

                    }

                });

            }

        }
    });


});


app.post('/api/v1/users', function (req, res, next) {

    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

    console.log("Getting body values");
    console.log("Inbound Request: " + req.body);
    
    try {
        email = req.body.emailaddress;
        fullname = req.body.fullname;
        tenant = req.body.tenant;
        phone = req.body.phone;

        if (phone == undefined) {
            phone = "";
        }

    }
    catch(err)
    {
        outputError(res, 400, "7", "Error adding user to the directory", err.message);
        return false;
    }

    console.log(email + " " + fullname + " " + tenant + " " + phone);

    addUserToCognito(function (error, item) {
        if (error) {
            console.log("Couldn't add user to Cognito");
            console.log(error);
            outputError(res, 400, "5", "Error adding user to the directory", error.message);
            return false;
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
                    return false;
                }
                else {
                    console.log("User added to DynamoDB successfully");
                    res.status(200).send("{ 'KFP Database ID' : '" + userid + "', 'Directory ID': '" + sub + "'}");
                }
            });                        
        }
    });   

});

function cognitoUpdatePhone(username, email, phoneNumber, callback) {

    try {
        
        console.log("Setting User's Phone Number");
        console.log("Username: " + username);
        console.log("Email: " + email);
        console.log("Phone number: " + phoneNumber);

        AWS.config.update({ endpoint: "cognito-idp.eu-west-1.amazonaws.com" });
        AWS.config.region = 'eu-west-1';

        var params = {
            UserPoolId: 'eu-west-1_2DtCcoypN',
            Username: username,
            UserAttributes: [
                {
                    "Name": "phone_number",
                    "Value": "+" + phoneNumber
                }]
        };        

        var cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider();
        console.log("API Version: " + cognitoidentityserviceprovider.apiVersion);        
        cognitoidentityserviceprovider.adminUpdateUserAttributes(params, function (err, data) {
            if (err) {
                console.log(err);
                callback(err);
            }
            else {
                console.log("Phone Number Setting is Successful");
                callback(null, true);
            }
        });
        
        return (null, true);
    }
    catch (e) {
        console.log("Error: " + e);
        throw e;
    }
}

function cognitoSetMFAStatus(username, status, callback) {

    console.log("Setting MFA status");

    var sta = (status == "true");

    AWS.config.update({ endpoint: "cognito-idp.eu-west-1.amazonaws.com" });
    AWS.config.region = 'eu-west-1';

    var params = {
        UserPoolId: 'eu-west-1_2DtCcoypN',
        Username: username,
        SMSMfaSettings: {
            Enabled: sta,
            PreferredMfa: sta
        }
    };

    var cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider();
    cognitoidentityserviceprovider.adminSetUserMFAPreference(params, function (err, data) {
        if (err) {
            console.log(err);
            callback(err);
        }
        else {
            console.log("MFA status Setting is Successful");
            callback(null, true);
        }           

    });

}


function cognitoListUsers(sub, callback) {

    console.log("Searching for the User given a Sub");
    AWS.config.update({ endpoint: "cognito-idp.eu-west-1.amazonaws.com" });
    AWS.config.region = 'eu-west-1';

    var filter = "sub = \"" + sub + "\"";

    var params = {
        UserPoolId: 'eu-west-1_2DtCcoypN',
        Filter: filter
    };

    var un = "";
    var em = "";

    var cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider();
    console.log("API Version: " + cognitoidentityserviceprovider.apiVersion);
    console.log("AWS API Version: " + AWS.apiVersion);
    cognitoidentityserviceprovider.listUsers(params, function (err, data) {
        if (err) {
            console.log(err);
            callback(err);
        }

        for (let user in data.Users) {
            console.log("User: " + JSON.stringify(data.Users[user]));
            un = data.Users[user].Username + ";" + data.Users[user].email;

        }

        callback(null, un);

    });

}

function getCognitoUserData(sub, callback) {

    AWS.config.update({ endpoint: "cognito-idp.eu-west-1.amazonaws.com" });
    AWS.config.region = 'eu-west-1';

    var params = {
        UserPoolId: 'eu-west-1_2DtCcoypN',
        Username: sub
    };

    var cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider();
    cognitoidentityserviceprovider.adminGetUser(params, function (err, data) {
        if (err) {
            console.log(err);
            callback(err);
        }

        console.log('user record: ' + JSON.stringify(data));
        callback(null, data);

    });

}

function addUserToCognito(callback) {

    const poolData = {
        UserPoolId: "eu-west-1_2DtCcoypN",    
        ClientId: "57vo0lcv2gq0822td26v9nhnh6"
    }; 

    AWS.config.update({ endpoint: "cognito-idp.eu-west-1.amazonaws.com" });
    AWS.config.region = 'eu-west-1';

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
                Name: 'phone_number',
                Value: phone
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

}



function outputError(res, statusCode, code, short, desc) {

    console.log("An error has occured");

    var body = {
        code: code,
        short: short,
        message: desc
    };

    // Here
    res.statusCode = parseInt(statusCode, 10);
    console.log("Writing an output message with Status: " + statusCode + ", value: " + body);
    res.send(JSON.stringify(body));

}


function getUserIdFromSub(callback) {

    console.log("Entering getUserIdFromSub");

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

    console.log("Leaving getUserIdFromSub");

};

function getUser(userid, callback) {

    console.log("Entering getUser");

    AWS.config.update({ endpoint: "https://dynamodb.eu-west-1.amazonaws.com" });

    var params = {
        TableName: "KFPNGUsers",
        KeyConditionExpression: "#id = :n",
        ExpressionAttributeNames: {
            "#id": "id"
        },
        ExpressionAttributeValues: {
            ":n": userid
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



