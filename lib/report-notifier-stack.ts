import {RemovalPolicy, Duration, Stack, StackProps, CfnParameter, aws_sns_subscriptions, Fn}
    from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {Bucket, EventType} from "aws-cdk-lib/aws-s3";
import {Topic,SubscriptionFilter, Subscription} from "aws-cdk-lib/aws-sns";
import {Code, Function, Runtime} from "aws-cdk-lib/aws-lambda";// import * as sqs from 'aws-cdk-lib/aws-sqs';
import {LambdaDestination} from "aws-cdk-lib/aws-s3-notifications";
import {EmailSubscription} from "aws-cdk-lib/aws-sns-subscriptions";
import {readFileSync} from "fs";

export class ReportNotifierStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const sns_topic = new Topic(this, 'epi_reports_topic',);
        console.log(__dirname);
        console.info(readFileSync(__dirname+"/../config/config.json",'utf8').toString())
        const config = JSON.parse(readFileSync(__dirname+"/../config/config.json",'utf8').toString());
        config['subscribers'].forEach((subscriber: any) => {
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




        const zipit_lambda = new Function(this, 'zipit_lambda', {
            runtime: Runtime.NODEJS_12_X,
            code: Code.fromAsset('lambda-fns/zipit'),
            handler: 'lambda.handler',
            environment: {
                BUCKET_NAME: reports_bucket.bucketName,
                ZIP_BUCKET_NAME: reports_zip_bucket.bucketName,
                TOPIC_ARN: sns_topic.topicArn,
                SUBSCRIBERS: JSON.stringify(config['subscribers']),
            },
            timeout: Duration.seconds(300),
            memorySize: 1024,

        });

        // add permissions to lambda to publish to SNS
        sns_topic.grantPublish(zipit_lambda);


        reports_bucket.addEventNotification(
            EventType.OBJECT_CREATED,
            new LambdaDestination(zipit_lambda)
        );

     
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
            runtime: Runtime.NODEJS_12_X,
            code: Code.fromAsset('lambda-fns/publish_message'),
            handler: 'lambda.handler',
            environment: {
                BUCKET_NAME: reports_bucket.bucketName,
                SNS_TOPIC_ARN: sns_topic.topicArn,
                SUBSCRIBERS: JSON.stringify(config['subscribers']),
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

    }
}
