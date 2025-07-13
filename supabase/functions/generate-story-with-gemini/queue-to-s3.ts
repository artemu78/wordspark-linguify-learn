// Import necessary modules from the AWS SDK using Deno's npm: specifier.
// This is the recommended way to use npm packages in Deno.
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";
import { getEnvVariable } from "../_shared/common-lib.ts";

/**
 * Uploads a file to an AWS S3 bucket.
 *
 * This function reads a local file and uploads it to a specified S3 bucket
 * using the AWS SDK v3. It relies on AWS credentials and region being
 * set as environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION).
 *
 * @param bucketName The name of the S3 bucket to upload to.
 * @param key The object key (path and filename) for the file in S3.
 * @param filePath The local path to the file to be uploaded.
 * @returns A Promise that resolves with the S3 PutObjectCommandOutput on success,
 * or rejects with an error if the upload fails.
 */
async function uploadFileToS3(
  bucketName: string,
  key: string,
  filePath: string,
): Promise<any> { // Using 'any' for PutObjectCommandOutput for simplicity, can be more specific
  console.log(`Attempting to upload file '${filePath}' to s3://${bucketName}/${key}`);

  // Retrieve AWS credentials and region from environment variables.
  // It's crucial to set these before running the Deno script.
  const awsAccessKeyId = getEnvVariable("AWS_ACCESS_KEY_ID");
  const awsSecretAccessKey = getEnvVariable("AWS_SECRET_ACCESS_KEY");
  const awsRegion = getEnvVariable("AWS_REGION");

  // Validate that required environment variables are set.
  if (!awsAccessKeyId || !awsSecretAccessKey || !awsRegion) {
    throw new Error(
      "Missing AWS environment variables. Please set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION.",
    );
  }

  // Configure the S3 client.
  // The 'credentials' object is used to provide your AWS access keys.
  // The 'region' specifies the AWS region your S3 bucket is in.
  // 'endpoint' and 'forcePathStyle' are useful for local S3 emulators like MinIO.
  const s3Client = new S3Client({
    region: awsRegion,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    },
    forcePathStyle: true,
  });

  let fileContent: Uint8Array;
  try {
    // Read the file content from the local file system.
    // Deno.readFile returns a Uint8Array.
    fileContent = await Deno.readFile(filePath);
    console.log(`Successfully read file: ${filePath}`);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    throw new Error(`Failed to read file: ${filePath}. Error: ${error.message}`);
  }

  // Create a PutObjectCommand.
  // - Bucket: The name of your S3 bucket.
  // - Key: The full path and filename where the object will be stored in the bucket.
  // - Body: The content of the file (Uint8Array in this case).
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileContent,
    // You can add more options here, e.g., ContentType, ACL, etc.
    // ContentType: "image/jpeg", // Example: if you know the file type
  });

  try {
    // Send the command to S3 and wait for the response.
    const response = await s3Client.send(command);
    console.log("File uploaded successfully:", response);
    return response;
  } catch (error) {
    console.error(`Error uploading file to S3:`, error);
    throw new Error(`Failed to upload file to S3. Error: ${error.message}`);
  }
}

// --- Example Usage ---
// To run this example:
// 1. Save the code as, for instance, `s3_uploader.ts`.
// 2. Create a dummy file for testing, e.g., `test_file.txt` with some content.
// 3. Set your AWS environment variables in your terminal:
//    export AWS_ACCESS_KEY_ID="YOUR_ACCESS_KEY_ID"
//    export AWS_SECRET_ACCESS_KEY="YOUR_SECRET_ACCESS_KEY"
//    export AWS_REGION="your-aws-region" # e.g., "us-east-1", "eu-central-1"
//    # If using a local S3 (e.g., MinIO):
//    # export AWS_ENDPOINT="http://localhost:9000"
// 4. Run the Deno script with necessary permissions:
//    deno run --allow-env --allow-read --allow-net s3_uploader.ts

export async function uploadStoryBitsToS3(storyBits) {
  const BUCKET_NAME = getEnvVariable("S3_INPUT_BUCKET");
  const LOCAL_FILE_PATH = "./test_file.txt"; // <<< REPLACE WITH YOUR LOCAL FILE PATH
  const S3_OBJECT_KEY = "my-test-file.jsonl"; // <<< REPLACE WITH DESIRED S3 KEY

  // Create a dummy file for demonstration if it doesn't exist
  try {
    await Deno.writeFile(LOCAL_FILE_PATH, new TextEncoder().encode("This is a test file for S3 upload."));
    console.log(`Created dummy file: ${LOCAL_FILE_PATH}`);
  } catch (e) {
    // File might already exist, which is fine
    if (!(e instanceof Deno.errors.AlreadyExists)) {
      console.error(`Error creating dummy file: ${e.message}`);
    }
  }


  uploadFileToS3(BUCKET_NAME, S3_OBJECT_KEY, LOCAL_FILE_PATH)
    .then(() => {
      console.log("File upload process completed successfully.");
    })
    .catch((error) => {
      console.error("File upload process failed:", error.message);
    });
}
