const AWS = require("aws-sdk");

import {getEnv} from "aws-cdk-lib/custom-resources/lib/provider-framework/runtime/util";
const { Lambda, Bucket } = require('aws-sdk');

const BUCKET_NAME=process.env.BUCKET_NAME

const subscribers=JSON.parse(process.env.SUBSCRIBERS || '')
const EMAIL_SETTINGS = JSON.parse(process.env.EMAIL_SETTINGS || '')
const s3 = new AWS.S3();
const labeledReportsPrefix = process.env.LABELED_REPORTS_PREFIX;
const SUFFIX_TO_ZIP = process.env.SUFFIX_TO_ZIP;
const PREFIX_EPI_REPORTS = process.env.PREFIX_EPI_REPORTS;
exports.handler = async function(event:any) {

    //get s3 events from the event and get the bucket name and key and update key with metadata
    let s3Event = event.Records[0].s3;
    console.log('s3Event', JSON.stringify(s3Event))
    let bucketName = s3Event.bucket.name;

    let key = s3Event.object.key;
    let metadata = s3Event.object.metadata
    let emails:any=subscribers.map((subscriber: { email: any; })=>subscriber.email)
    //copy object from reports_bucket to other prefix
    for (let emailsKey in EMAIL_SETTINGS) {
        let copyParams = {
            Bucket: bucketName,
            CopySource: bucketName + '/' + key,
            Key: labeledReportsPrefix + '/'+emailsKey?.toString()+ '/' + key.replace(PREFIX_EPI_REPORTS+'/','')+ SUFFIX_TO_ZIP,
        }
        console.log('copyParams', JSON.stringify(copyParams))
        await s3.copyObject(copyParams).promise().then((data: any)=>{
            console.log('data', data)
        }).catch((error:any)=>
            console.error(error)
        )

    }

}