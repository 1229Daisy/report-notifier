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

    //update s3 object with metadata
    let s3 = new AWS.S3();
    let params = {
        Bucket: bucketName,
        CopySource: bucketName + '/' + key,
        Key: key,
        Metadata: {
            "subscribers": `${JSON.stringify(emails)}`
            // "subscribers":"xxxx@qq.com"
        }
    };
    console.log(JSON.stringify(emails))
    s3.copyObject(params, function(err:AWSError, data:any) {
        if (err) {
            console.log(err, err.stack);
        } else {
            console.log(data);
        }
    });



}
