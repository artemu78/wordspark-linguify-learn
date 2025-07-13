// Import necessary modules from the AWS SDK using Deno's npm: specifier.
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3";

/**
 * Gets an environment variable and throws an error if it's not set
 */
function getEnvVariable(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Uploads content directly to an AWS S3 bucket without creating a local file.
 *
 * @param bucketName The name of the S3 bucket to upload to
 * @param key The object key (path and filename) for the file in S3
 * @param content The content to upload (string or Uint8Array)
 * @param contentType Optional content type for the file
 * @returns A Promise that resolves with the S3 response
 */
export async function uploadToS3(
  bucketName: string,
  key: string,
  content: string | Uint8Array,
  contentType?: string,
): Promise<any> {
  console.log(`Uploading content to s3://${bucketName}/${key}`);

  // Get AWS credentials from environment variables
  const awsAccessKeyId = getEnvVariable("AWS_ACCESS_KEY_ID");
  const awsSecretAccessKey = getEnvVariable("AWS_SECRET_ACCESS_KEY");
  const awsRegion = getEnvVariable("AWS_REGION");

  // Configure the S3 client
  const s3Client = new S3Client({
    region: awsRegion,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    },
  });

  // Convert string content to Uint8Array if needed
  const body = typeof content === "string"
    ? new TextEncoder().encode(content)
    : content;

  // Create the upload command
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  try {
    const response = await s3Client.send(command);
    console.log("Upload successful:", response);
    return response;
  } catch (error) {
    console.error("Upload failed:", error);
    throw new Error(`Failed to upload to S3: ${error.message}`);
  }
}

/**
 * Uploads story bits as JSONL to S3
 *
 * @param storyBits Array of story objects to upload
 * @returns Promise that resolves when upload is complete
 */
export async function uploadStoryBitsToS3(
  storyBits: any[],
  storyId: string,
): Promise<void> {
  const bucketName = getEnvVariable("S3_INPUT_BUCKET");

  // Convert story bits to JSONL format (one JSON object per line)
  const jsonlContent = storyBits
    .map((story) =>
      JSON.stringify({
        ...story,
        taskType: "TEXT_IMAGE",
        imageGenerationConfig: {
          numberOfImages: 1,
          height: 1024,
          width: 1024,
          cfgScale: 8.0,
          seed: 1234,
        },
      })
    )
    .join("\n");

  // Generate a unique key with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const s3Key = `story-bits/story-${storyId}-${timestamp}.jsonl`;

  console.log(
    `Story bits uploaded successfully to s3://${bucketName}/${s3Key}`,
  );
  return uploadToS3(bucketName, s3Key, jsonlContent, "application/jsonl");
}

/**
 * Upload a JSON file to S3
 *
 * @param data Object to convert to JSON and upload
 * @param key S3 key for the file
 * @param bucketName Optional bucket name (uses S3_INPUT_BUCKET env var if not provided)
 */
export async function uploadJSONToS3(
  data: any,
  key: string,
  bucketName?: string,
): Promise<void> {
  const bucket = bucketName || getEnvVariable("S3_INPUT_BUCKET");
  const jsonContent = JSON.stringify(data, null, 2);

  console.log(`JSON data uploaded to s3://${bucket}/${key}`);
  return uploadToS3(bucket, key, jsonContent, "application/json");
}

/**
 * Upload a text file to S3
 *
 * @param content Text content to upload
 * @param key S3 key for the file
 * @param bucketName Optional bucket name (uses S3_INPUT_BUCKET env var if not provided)
 */
export async function uploadTextToS3(
  content: string,
  key: string,
  bucketName?: string,
): Promise<void> {
  const bucket = bucketName || getEnvVariable("S3_INPUT_BUCKET");

  console.log(`Text content uploaded to s3://${bucket}/${key}`);
  return uploadToS3(bucket, key, content, "text/plain");
}
