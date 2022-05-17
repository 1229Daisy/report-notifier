import * as fs from 'fs';
import 'source-map-support/register';

import { Construct } from 'constructs';
import {App, Duration, RemovalPolicy, Stack, StackProps} from 'aws-cdk-lib';                 // core constructs
import { aws_s3 as s3 } from 'aws-cdk-lib';               // stable module
import {SubscriptionFilter, Topic} from "aws-cdk-lib/aws-sns";
import {EmailSubscription} from "aws-cdk-lib/aws-sns-subscriptions";
import {Bucket, EventType} from "aws-cdk-lib/aws-s3";
import {Code, LayerVersion, Runtime, Function} from "aws-cdk-lib/aws-lambda";
import {LambdaDestination, SqsDestination} from "aws-cdk-lib/aws-s3-notifications";
import {Queue} from "aws-cdk-lib/aws-sqs";
import {randomUUID} from "crypto";  // experimental module
interface EpiStackProps extends StackProps {
    epiAppConfig: any;
}


export class ReportNotifierStack extends Stack {
    constructor(scope: Construct, id: string, props?: EpiStackProps) {
        super(scope, id, props);
        const config = props?.epiAppConfig;
        const SUFFIX_TOZIP = config?.SUFFIX_TOZIP || '.tozip';
        const PREFIX_LABELED_REPORT = config?.PREFIX_LABELED_REPORT || 'labeled-report';
        const PREFIX_EPI_REPORTS = config?.PREFIX_EPI_REPORTS || 'epi-reports';

        const sns_topic = new Topic(this, 'epi_reports_topic',);
        //console.log(__dirname);
        //console.info(readFileSync(__dirname+"/../config/config.json",'utf8').toString())
        let email_settings:any={}
        config['subscribers'].forEach((subscriber: any) => {
            let rkey=randomUUID()
            email_settings[rkey]=subscriber;

            const emailFilter={
                "send_to":SubscriptionFilter.stringFilter({
                    allowlist:[subscriber['email']]
                })
            }

            const email_subscription = new EmailSubscription(subscriber['email'], {filterPolicy: emailFilter});
            sns_topic.addSubscription(email_subscription);
        });

        const reports_bucket = new Bucket(this, 'epi_reports', {
            versioned: true,
            removalPolicy: RemovalPolicy.DESTROY,
        });
        //create epi_reports_zip bucket
        const reports_zip_bucket = new Bucket(this, 'epi_reports_zip', {
            versioned: true,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        let zipit_layer = LayerVersion.fromLayerVersionArn(this, 'zipit_layer', config['zipit_layer_arn']);

        const zipit_lambda = new Function(this, 'zipit_lambda', {
            runtime: Runtime.NODEJS_14_X,
            code: Code.fromAsset('lambda-fns/zipit'),
            handler: 'lambda.handler',
            environment: {
                SNS_TOPIC_ARN: sns_topic.topicArn,
                BUCKET_NAME: reports_bucket.bucketName,
                ZIP_BUCKET_NAME: reports_zip_bucket.bucketName,
                SUBSCRIBERS: JSON.stringify(config['subscribers']),
                EMAIL_SETTINGS: JSON.stringify(email_settings),
                LABELED_REPORTS_PREFIX: PREFIX_LABELED_REPORT,
                SUFFIX_TO_ZIP: SUFFIX_TOZIP
            },
            timeout: Duration.seconds(300),
            memorySize: 1024,
            layers: [zipit_layer],

        });
        sns_topic.grantPublish(zipit_lambda);


     
        //add permission to read from reports_bucket to zipit_lambda
        reports_bucket.grantRead(zipit_lambda);
        
        reports_zip_bucket.grantReadWrite(zipit_lambda)

        // const emailAddress = new CfnParameter(this, 'emailAddress', {
        //     type: 'String',
        //     default: '2517022100@qq.com',
        //     description: 'Email address to send reports to',
        // });
        // console.log('emailAddress', emailAddress.valueAsString);
        // sns_topic.addSubscription(new aws_sns_subscriptions.EmailSubscription(emailAddress.valueAsString));


   


        //create Lambda to listen to reports_bucket
        const publish_message = new Function(this, 'publish_message', {
            runtime: Runtime.NODEJS_14_X,
            code: Code.fromAsset('lambda-fns/publish_message'),
            handler: 'lambda.handler',
            environment: {
                BUCKET_NAME: reports_bucket.bucketName,
                SNS_TOPIC_ARN: sns_topic.topicArn,
                SUBSCRIBERS: JSON.stringify(config['subscribers']),
                EMAIL_SETTINGS: JSON.stringify(email_settings),
                LABELED_REPORTS_PREFIX: PREFIX_LABELED_REPORT,
                SUFFIX_TO_ZIP: SUFFIX_TOZIP
            },
            timeout: Duration.seconds(300),
            memorySize: 1024,
        });
        // reports_zip_bucket.grantReadWrite(publish_message);
        reports_bucket.grantReadWrite(publish_message)
        //listen publish message to reports_zip_bucket
        reports_zip_bucket.addEventNotification(
            EventType.OBJECT_CREATED,
            new LambdaDestination(publish_message)
        );

        sns_topic.grantPublish(publish_message);

        const sqs_queue = new Queue(this, 'epi_reports_queue', {
            visibilityTimeout: Duration.seconds(300),
        }
        );

        //create label_file Lambda function
        const label_file = new Function(this, 'label_file', {
            runtime: Runtime.NODEJS_14_X,
            code: Code.fromAsset('lambda-fns/label_file'),
            handler: 'lambda.handler',
            environment: {
                BUCKET_NAME: reports_bucket.bucketName,
                SNS_TOPIC_ARN: sns_topic.topicArn,
                SUBSCRIBERS: JSON.stringify(config['subscribers']),
                EMAIL_SETTINGS: JSON.stringify(email_settings),
                LABELED_REPORTS_PREFIX: PREFIX_LABELED_REPORT,
                SUFFIX_TO_ZIP: SUFFIX_TOZIP,
                PREFIX_EPI_REPORTS : PREFIX_EPI_REPORTS,
            },
            timeout: Duration.seconds(300),
            memorySize: 1024,
        })

        sqs_queue.grantSendMessages(label_file);


        reports_bucket.addEventNotification(
            EventType.OBJECT_CREATED,
            new LambdaDestination(label_file), {
                    prefix: PREFIX_EPI_REPORTS + '/'
            }
        );

        reports_bucket.addEventNotification(
            EventType.OBJECT_CREATED,
            new LambdaDestination(zipit_lambda), {
                prefix: PREFIX_LABELED_REPORT+'/',
                suffix:  SUFFIX_TOZIP
            }
        );


        reports_bucket.grantReadWrite(label_file);

    }
}
