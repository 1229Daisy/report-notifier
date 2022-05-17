import * as fs from "fs";
import {AWSError} from "aws-sdk";
// const AWS = require('aws-sdk');
import * as AWS from 'aws-sdk';

const { Lambda, Bucket, s3 } = require('aws-sdk');
//get environment variables from lambda declaration
let BUCKET_NAME   = process.env.BUCKET_NAME || '';
let SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || '';
// let SUBSCRIBERS:any   = process.env.SUBSCRIBERS || [];

// //get emails list from list of subscribers
// //  map SUBSCRIBERS to emails

// let emails:any=[]
// for (let i in SUBSCRIBERS) {
//     emails.add(SUBSCRIBERS.get(i)['emails']);
// }

let subscribers = process.env.SUBSCRIBERS || ''
let subscribersArr = JSON.parse(subscribers)
let emails:any=[]
for (let i in subscribersArr) {
    emails.add(subscribersArr.get(i)['email']);
}

exports.handler = async function(event:any) {

    //get s3 events from the event and get the bucket name and key and update key with metadata
    let s3Event = event.Records[0].s3;
    let bucketName = s3Event.bucket.name;

    let key = s3Event.object.key;
    let metadata=s3Event.object.metadata
    let email=metadata.email


    //create presigned url for zip file
    const url = s3.getSignedUrl('getObject', {
        Bucket: bucketName,
        Key: key,
        Expires: 60 * 60 * 24,
    });
    //send message to sns  with url

    const sns = new AWS.SNS();
    const message = {
        default: url,
        APNS: {
            aps: {
                alert: {
                    title: 'Report Notification',
                    body: "Report is ready for download",
                },
            },
        },
    };
    const paramsSns = {
        Message: JSON.stringify(message),
        Subject: 'Report Notification',
        TopicArn: process.env.TOPIC_ARN,
        MessageAttributes:{"send_to":email}
    };

    await sns.publish(paramsSns).promise();



}
