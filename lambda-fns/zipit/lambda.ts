import {PutObjectRequest} from "aws-sdk/clients/s3";

export {}
const archiver = require('archiver');
import * as AWS from 'aws-sdk';
import {Readable, Stream} from 'stream';

archiver.registerFormat('zip-encrypted', require("archiver-zip-encrypted"));

let bucketName = process.env.BUCKET_NAME; 
let zipBucketName = process.env.ZIP_BUCKET_NAME ||'';   // optional
let subscribers = process.env.SUBSCRIBERS || ''
let subscribersArr = JSON.parse(subscribers)
let EMAIL_SETTINGS = JSON.parse(process.env.EMAIL_SETTINGS || '')
let LABELED_REPORTS_PREFIX = process.env.LABELED_REPORTS_PREFIX || '';
// let SUBSCRIBERS:any   = process.env.SUBSCRIBERS || [];
let mailMap:any = {};
let emails:any=subscribersArr.map((subscriber:any)=>{
    mailMap[subscriber.email] = subscriber
}
)
type S3DownloadStreamDetails = { stream: Readable; filename: string };

exports.handler = async function (event: any) {
    const s3 = new AWS.S3();
    //get contents of s3 object and zip it
    let s3Event = event.Records[0].s3;
    console.log('s3Event:', JSON.stringify(s3Event))
    let key = s3Event.object.key;
    let key_arr= key.split('/');
    let email='',report_type='';
    let email_key=key_arr[0]==LABELED_REPORTS_PREFIX?key_arr[1]:''
    if (email_key) {
        email = EMAIL_SETTINGS[email_key]['email']
    }else{
        console.error('email_key not found')
        return
    }


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
        Metadata:{"subscribers": `${email}`}

    };
    
    const s3Upload = s3.upload(params, (error: Error): void => {
        if (error) {
            console.error(`Got error creating stream to s3 ${error.name} ${error.message} ${error.stack}`);
            throw error;
        }
    });
    s3Upload.on('httpUploadProgress', (progress: any): void => {
        console.log(progress);
    });
    const Password = EMAIL_SETTINGS[email_key]['password'];
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


    await s3Upload.promise().then((data: any) => {
        console.log(data)

    }).catch((error: any) => {
            console.error(error)}
    );




    console.log('Upload complete');


}
