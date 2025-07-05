import { SignerV4 } from "https://esm.sh/@aws-sdk/signature-v4@3.463.0";
import { Sha256 } from "https://esm.sh/@aws-crypto/sha256-js@3.462.0";
import { getEnvVariable } from "../_shared/common-lib.ts";

export async function uploadStoryBitsToS3(
  storyBits: { sceneId: string; imagePrompt: string }[]
) {
  const storyId = crypto.randomUUID();
  const region = getEnvVariable("AWS_REGION")!;
  const bucket = getEnvVariable("S3_BUCKET_NAME")!;
  const accessKeyId = getEnvVariable("AWS_ACCESS_KEY_ID")!;
  const secretAccessKey = getEnvVariable("AWS_SECRET_ACCESS_KEY")!;

  const signer = new SignerV4({
    credentials: { accessKeyId, secretAccessKey },
    region,
    service: "s3",
    sha256: Sha256,
  });

  const lines = storyBits.map((bit, index) =>
    JSON.stringify({
      sceneId: bit.sceneId || `scene-${index + 1}`.padStart(3, "0"),
      taskType: "TEXT_IMAGE",
      textToImageParams: { text: bit.imagePrompt },
      imageGenerationConfig: {
        width: 1024,
        height: 1024,
        seed: 1000 + index,
        cfgScale: 8.0,
      },
    })
  );

  const jsonl = lines.join("\n");
  const key = `input/${storyId}.jsonl`;

  const presigned = await signer.presign(
    {
      method: "PUT",
      protocol: "https:",
      hostname: `${bucket}.s3.${region}.amazonaws.com`,
      path: `/${key}`,
      headers: {
        host: `${bucket}.s3.${region}.amazonaws.com`,
        "content-type": "application/jsonlines",
      },
    },
    { expiresIn: 900 }
  );

  const upload = await fetch(presigned.href, {
    method: "PUT",
    headers: { "Content-Type": "application/jsonlines" },
    body: jsonl,
  });

  if (!upload.ok) {
    throw new Error(
      `S3 upload failed: ${upload.status} ${await upload.text()}`
    );
  }

  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}
