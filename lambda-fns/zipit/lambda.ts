const archiver = require('archiver');
// register format for archiver
// note: only do it once per Node.js process/application, as duplicate registration will throw an error
archiver.registerFormat('zip-encrypted', require("archiver-zip-encrypted"));
import {PutObjectRequest} from "aws-sdk/clients/s3";
import {createReadStream} from 'fs';
import {Readable, Stream} from 'stream';
import * as AWS from 'aws-sdk';
import {applyDefaultRotationOptions} from "aws-cdk-lib/aws-rds/lib/private/util";
import { Tag, Tags } from "aws-cdk-lib";

let bucketName = process.env.BUCKET_NAME;
let zipBucketName = process.env.ZIP_BUCKET_NAME ||'';   // optional
let email_address = process.env.emailAddresses ||''

type S3DownloadStreamDetails = { stream: Readable; filename: string };

exports.handler = async function (event: any) {
    const s3 = new AWS.S3();
    //get contents of s3 object and zip it
    const s3DownloadStreams: S3DownloadStreamDetails[] = event.Records.map((rec: any) => {
        let bucket = rec.s3.bucket.name
        let key = rec.s3.object.key
        if (bucket == bucketName){
            return {
                stream: s3.getObject({Bucket: bucket, Key: key}).createReadStream(),
                filename: key,
            };
        }else{
            return;
        }
    });

    const streamPassThrough = new Stream.PassThrough();
    const params: PutObjectRequest = {
        ACL: 'private',
        Body: streamPassThrough,
        Bucket: zipBucketName,
        ContentType: 'application/zip',
        Key: 'archived_' + Date.now() + '.zip',
        StorageClass: 'STANDARD_IA', // Or as appropriate
        Metadata:{'email':"1729828003@qq.com"}
    };
    const s3Upload = s3.upload(params, (error: Error): void => {
        if (error) {
            console.error(`Got error creating stream to s3 ${error.name} ${error.message} ${error.stack}`);
            throw error;
        }
    });
    s3Upload.on('httpUploadProgress', (progress: any): void => {
        console.log(progress); // { loaded: 4915, total: 192915, part: 1, key: 'foo.jpg' }
    });
    const Password = Math.random().toFixed(6).slice(-6)
    console.info(Password)
    const archive = archiver('zip-encrypted',   {
        zlib: {
            level: 8,//压缩等级
        },
        encryptionMethod: 'aes256',//加密方法
        password: `${Password}`,//解压密码
    });
    archive.on('error', (error: any) => {
        throw new Error(`${error.name} ${error.code} ${error.message} ${error.path} ${error.stack}`);
    });

    await new Promise((resolve, reject) => {

        console.log('Starting upload');

        streamPassThrough.on('close', resolve);
        streamPassThrough.on('end', resolve);
        streamPassThrough.on('error', reject);

        archive.pipe(streamPassThrough);
        s3DownloadStreams.forEach((streamDetails: S3DownloadStreamDetails) => archive.append(streamDetails.stream, {name: streamDetails.filename}));
        archive.finalize();
    }).catch((error: { code: string; message: string; data: string }) => {
        throw new Error(`${error.code} ${error.message} ${error.data}`);
    });


    await s3Upload.promise();
    //create presigned url for zip file
    const url = s3.getSignedUrl('getObject', {
        Bucket: zipBucketName,
        Key: params.Key,
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
                    body: `open file password : ${Password}`,
                },
            },
        },
    };
    const paramsSns = {
        Message: JSON.stringify(message),
        Subject: 'Report Notification',
        TopicArn: process.env.TOPIC_ARN
    };

    await sns.publish(paramsSns).promise();


    console.log('Upload complete');


}
