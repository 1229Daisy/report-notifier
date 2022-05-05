import * as fs from "fs";
import {AWSError} from "aws-sdk";
const AWS = require('aws-sdk');

let BUCKET_NAME   = process.env.BUCKET_NAME || '';
let SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || '';
let SUBSCRIBERS:any   = process.env.SUBSCRIBERS || [];

console.log(`SUBSCRIBERS: ${SUBSCRIBERS}`);

let S3 = new AWS.S3();

let emails=JSON.parse(SUBSCRIBERS).map((row: { [x: string]: any; })=>{return row['email']})

console.log("emails:", emails);

exports.handler = async function(event:any) {

    //get s3 events from the event and get the bucket name and key and update key with metadata
    let s3Event = event.Records[0].s3;
    console.log(`s3Event: ${JSON.stringify(s3Event)}`);
    let bucketName = s3Event.bucket.name;
    let key = s3Event.object.key;
    //get metadata from s3 event
    let metadata = s3Event.object.Metadata;

    //get met
    console.log("metadata:", metadata);
    //update s3 object with metadata
    await S3.getObject({
        Bucket: bucketName,
        Key: key
    }).promise().then(function(data:any) {
        console.log("getObject success", data.Metadata);
        if (!data.Metadata ) {
            addSubscribersMetadata();
        }else if(!data.Metadata['subscribers']){
            addSubscribersMetadata(data.Metadata);

        }
    }).catch(function(err:AWSError){
        console.log("getObject error:", JSON.stringify(err));
    });

    async function addSubscribersMetadata(metadataArr:any=null){
        //merge old metadata with new metadata

        let metadataDirective="REPLACE"
        if(metadataArr){
            metadataArr["subscribers"] = JSON.stringify(emails);
            metadataDirective="REPLACE"
        }else{
            metadataArr = {
                "subscribers": JSON.stringify(emails)
            }
            metadataDirective="COPY"

        }
        let params: AWS.S3.Types.CopyObjectRequest = {
            Bucket: bucketName,
            CopySource: bucketName + '/' + key,
            Key: key,
            MetadataDirective: metadataDirective,
            Metadata: metadataArr
        };

        console.log(`params: ${JSON.stringify(params)}`);

        let copyObjResults: any = await S3.copyObject(params).promise().then(function (data: any) {
            console.log("saving success:", params, data);
        }).catch(function (err: any) {
            console.error("error saving: ", params, err, err.stack);
        })

        console.log(`copyObjResults: ${JSON.stringify(copyObjResults)}`);
    }



}
